<script lang="ts" setup>
import {ref} from 'vue'
import {useNuxtApp} from 'nuxt/app'
import type {GameListItem} from './types/lobby'

const emit = defineEmits<{gameCreated: [value: GameListItem]}>()

function isResponseCreateGame(value: unknown): value is ResponseCreateGame {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'id' in value &&
    'creator_id' in value &&
    'turnDurationMinutes' in value &&
    'seat_count' in value &&
    'occupiedSeats' in value &&
    'hasPassword' in value &&
    (value.seat_count === 2 || value.seat_count === 3 || value.seat_count === 4) &&
    typeof value.id === 'string' &&
    typeof value.creator_id === 'string' &&
    typeof value.hasPassword === 'boolean' &&
    Array.isArray(value.occupiedSeats) &&
    value.occupiedSeats.every(el => el !== null && typeof el === 'object' && !Array.isArray(el) && 'user_id' in el
      && typeof el.user_id === 'string'
    )
    && value.occupiedSeats.length > 0
    && typeof value.turnDurationMinutes === 'number'
    && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(value.turnDurationMinutes)
  );
}

type Seat = { "user_id": string }

interface ResponseCreateGame {
  id: string
  creator_id: string
  seat_count: 2 | 3 | 4
  hasPassword: boolean
  occupiedSeats: Seat[]
  turnDurationMinutes: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
}

const MIN_LENGTH_PASSWORD = 8
const countPlayers = ref<number | null>(null)
const password = ref<string | null>(null)
const message = ref<string>('')
const requestPending = ref<boolean>(false)
const resCreateGame = ref<ResponseCreateGame | null>(null)
const turnDurationMinutes = ref<number>(3)
const request = ref<Record<string, string | number> | null>(null)
const createGame = async () => {
  if (requestPending.value) return
  if (request.value === null) {
    message.value = ''
    const countPlayer = (
      countPlayers.value !== null
      && Number.isSafeInteger(countPlayers.value)
      && countPlayers.value >= 2
      && countPlayers.value <= 4)
      ? countPlayers.value
      : null

    if (countPlayer == null) {
      message.value = 'Укажите число игроков'
      return
    }
    if (password.value !== null && password.value !== '' && password.value.length < MIN_LENGTH_PASSWORD) {
      message.value = 'Минимальное количество символов пароля 8'
      return
    }
    message.value = 'Данные формы проверены'
    request.value = {
      seatCount: countPlayer,
      requestId: crypto.randomUUID(),
      turnDurationMinutes: turnDurationMinutes.value,
      ...((password.value !== null && password.value !== '') && {password: password.value}),
    }
  }

  try {
    requestPending.value = true
    message.value = 'Создаём комнату…'
    const {$supabase} = useNuxtApp()
    const response = await $supabase.functions.invoke('create-game', {body: request.value})

    if (response.error) {
      message.value = 'Не удалось получить результат. Повторите запрос с прежними настройками'
      return
    }

    if (!isResponseCreateGame(response.data)) {
      message.value = 'Не удалось получить результат. Повторите запрос с прежними настройками'
      return
    }
    resCreateGame.value = response.data
    message.value = ''
    emit('gameCreated', {
      id: response.data.id,
      seat_count: response.data.seat_count,
      occupiedSeatCount: response.data.occupiedSeats.length,
      hasPassword: response.data.hasPassword,
      turnDurationMinutes: response.data.turnDurationMinutes,
    })
  } catch {
    message.value = 'Не удалось получить результат. Повторите запрос с прежними настройками'
  } finally {
    requestPending.value = false
  }

}


</script>
<template>
  <div v-if="resCreateGame">
    <p>{{ resCreateGame.id }}</p>
    <p>{{ resCreateGame.seat_count }}</p>
    <p>Занятые места {{ resCreateGame.occupiedSeats.length }}</p>
    <p>Свободные {{ resCreateGame.seat_count - resCreateGame.occupiedSeats.length }}</p>
    <p>Количество минут на ход игрока {{ resCreateGame.turnDurationMinutes }}</p>
    <p>Наличие пароля {{ resCreateGame.hasPassword }}</p>
  </div>
  <div v-else>
    <form @submit.prevent="createGame()">
      <div>
        <label for="countPlayers">Количество игроков от 2 до 4</label>
        <input
          type="number"
          id="countPlayers"
          min="2"
          max="4"
          maxlength="1"
          v-model="countPlayers"
          :disabled="requestPending || request !== null"
          required
        >
      </div>
      <div>
        <span>Количество минут на ход игрока</span>
        <select v-model="turnDurationMinutes" :disabled="requestPending || request !== null">
          <template v-for="i in 10" :key="i">
            <option :value="i">{{ i }}</option>
          </template>
        </select>
      </div>
      <div>
        <label for="password">Пароль (Необязательно)</label>
        <input
          id="password"
          type="password"
          v-model="password"
          min="8"
          :disabled="requestPending || request !== null"
        >
      </div>
      <button
        type="submit"
        :disabled="requestPending"
      >
        {{ request !== null ? 'Повторить' : 'Создать комнату' }}
      </button>
    </form>
  </div>
  <p>{{ message }}</p>
</template>
