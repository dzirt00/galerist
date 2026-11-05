<script lang="ts" setup>
import {computed, ref} from 'vue'
import {useNuxtApp} from 'nuxt/app'
import type {GameListItem} from './types/lobby'
import {isSeatCount, isResponseCreateGame} from './utils/lobby-validation'
import {getFunctionError} from './utils/api-errors'
import {useOwnLobby} from './composable/own-lobby'

const emit = defineEmits<{ gameCreated: [value: GameListItem]; lobbyReturned: [value: GameListItem] }>()
const {ownLobbyId, isReturning, returnMessage, clearOwnLobby, offerOwnLobby, returnToOwnLobby} =
  useOwnLobby(game => emit('lobbyReturned', game))
const {$supabase} = useNuxtApp()

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
const areFieldsDisabled = computed(() => requestPending.value || request.value !== null)
const isSubmitDisabled = computed(() => requestPending.value || isReturning.value)
const submitLabel = computed(() => request.value !== null ? 'Повторить' : 'Создать комнату')
const returnLabel = computed(() => isReturning.value ? 'Возвращаемся…' : 'Вернуться в своё лобби')
const occupiedSeatCount = computed(() => resCreateGame.value?.occupiedSeats.length ?? 0)
const freeSeatCount = computed(() => (resCreateGame.value?.seat_count ?? 0) - occupiedSeatCount.value)

const createGame = async () => {
  if (isSubmitDisabled.value) return
  clearOwnLobby()
  if (request.value === null) {
    message.value = ''
    const countPlayer = isSeatCount(countPlayers.value) ? countPlayers.value : null

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
    const response = await $supabase.functions.invoke('create-game', {body: request.value})

    if (response.error) {
      const failure = await getFunctionError(response.error, 'Не удалось получить результат. Повторите запрос с прежними настройками')
      message.value = failure.message
      offerOwnLobby(failure)
      return
    }

    if (!isResponseCreateGame(response.data) || response.data.occupiedSeats.length === 0) {
      message.value = 'Не удалось получить результат. Повторите запрос с прежними настройками'
      return
    }
    resCreateGame.value = response.data
    message.value = ''
    const emitGameCreated: GameListItem = {
      id: response.data.id,
      seat_count: response.data.seat_count,
      occupiedSeatCount: response.data.occupiedSeats.length,
      hasPassword: response.data.hasPassword,
      turnDurationMinutes: response.data.turnDurationMinutes,
    }
    emit('gameCreated', emitGameCreated)
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
    <p>Занятые места {{ occupiedSeatCount }}</p>
    <p>Свободные {{ freeSeatCount }}</p>
    <p>Количество минут на ход игрока {{ resCreateGame.turnDurationMinutes }}</p>
    <p>Наличие пароля {{ resCreateGame.hasPassword }}</p>
  </div>
  <div v-else>
    <form @submit.prevent="createGame">
      <div>
        <label for="countPlayers">Количество игроков от 2 до 4</label>
        <input
          id="countPlayers"
          v-model="countPlayers"
          type="number"
          min="2"
          max="4"
          maxlength="1"
          :disabled="areFieldsDisabled"
          required
        >
      </div>
      <div>
        <label for="create-turn-duration">Количество минут на ход игрока</label>
        <select id="create-turn-duration" v-model="turnDurationMinutes" :disabled="areFieldsDisabled">
          <option v-for="minutes in 10" :key="minutes" :value="minutes">{{ minutes }}</option>
        </select>
      </div>
      <div>
        <label for="password">Пароль (Необязательно)</label>
        <input
          id="password"
          v-model="password"
          type="password"
          min="8"
          :disabled="areFieldsDisabled"
        >
      </div>
      <button
        type="submit"
        :disabled="isSubmitDisabled"
      >
        {{ submitLabel }}
      </button>
    </form>
  </div>
  <p>{{ message }}</p>
  <button v-if="ownLobbyId" type="button" :disabled="isSubmitDisabled" @click="returnToOwnLobby">
    {{ returnLabel }}
  </button>
  <p v-if="returnMessage" role="alert">{{ returnMessage }}</p>
</template>
