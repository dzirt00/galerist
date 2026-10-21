<script lang="ts" setup>
import {ref} from 'vue'
import {useNuxtApp} from 'nuxt/app'

function isResponseCreateGame(value: unknown): value is ResponseCreateGame {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'id' in value &&
    'creator_id' in value &&
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
  );
}

type Seat = { "user_id": string }

interface ResponseCreateGame {
  id: string
  creator_id: string
  seat_count: 2 | 3 | 4
  hasPassword: boolean
  occupiedSeats: Seat[]
}

const MIN_LENGTH_PASSWORD = 8
const countPlayers = ref<number | null>(null)
const password = ref<string | null>(null)
const message = ref<string>('')
const requestPending = ref<boolean>(false)
const resCreateGame = ref<ResponseCreateGame | null>(null)

let request: Record<string, string | number> | null = null
const createGame = async () => {
  if (requestPending.value) return
  if (request === null) {
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
    request = {
      seatCount: countPlayer,
      requestId: crypto.randomUUID(),
      ...((password.value !== null && password.value !== '') && {password: password.value}),
    }
  }

  try {
    requestPending.value = true
    message.value = 'Создаём комнату…'
    const {$supabase} = useNuxtApp()
    const response = await $supabase.functions.invoke('create-game', {body: request})

    if (response.error) {
      message.value = 'Не удалось создать комнату. Попробуйте ещё раз'
      return
    }

    if (!isResponseCreateGame(response.data)) {
      message.value = 'Не удалось создать комнату. Попробуйте ещё раз'
      return
    }
    resCreateGame.value = response.data
    message.value = ''
  } catch {
    message.value = 'Не удалось создать комнату. Попробуйте ещё раз'
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
          required
        >
      </div>
      <div>
        <label for="password">Пароль (Необязательно)</label>
        <input
          id="password"
          type="password"
          v-model="password"
          min="8"
        >
      </div>
      <button
        type="submit"
        :disabled="requestPending"
      >
        Создать комнату
      </button>
    </form>
  </div>
  <p>{{ message }}</p>
</template>
