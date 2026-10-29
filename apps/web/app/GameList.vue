<script setup lang="ts">
import {useNuxtApp} from 'nuxt/app'
import {ref, watch} from 'vue'
import GameLobby from './GameLobby.vue'
import type {GameListItem} from './types/lobby'

const props = defineProps<{ createdGame?: GameListItem | null }>()

interface ChangeData {
  seat_count: number
  turnDurationMinutes: number
}


function isGameListItem(value: unknown): value is GameListItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && item.id.length > 0
    && [2, 3, 4].includes(item.seat_count as number)
    && typeof item.occupiedSeatCount === 'number' && Number.isSafeInteger(item.occupiedSeatCount)
    && item.occupiedSeatCount >= 0 && item.occupiedSeatCount <= (item.seat_count as number)
    && typeof item.hasPassword === 'boolean'
    && typeof item.turnDurationMinutes === 'number' && Number.isSafeInteger(item.turnDurationMinutes)
    && item.turnDurationMinutes >= 1 && item.turnDurationMinutes <= 10
}


const hasLoaded = ref(false)

const state = ref<GameListItem[]>([])
const {$supabase} = useNuxtApp()
const isLoading = ref(false)
const message = ref('')
const pendingGameId = ref<string | null>(null)
const passwords = ref<Record<string, string>>({})
const joinMessage = ref<string>('')
const joinedGame = ref<GameListItem | null>(null)
const waiting = ref<boolean>(false)

watch(() => props.createdGame, (game) => {
  if (!game) return
  joinedGame.value = {...game}
  state.value = [...state.value.filter((item) => item.id !== game.id), {...game}]
  pendingGameId.value = null
  joinMessage.value = ''
  waiting.value = false
}, {immediate: true})

const loadList = async () => {
  if (isLoading.value || pendingGameId.value || waiting.value) return
  const creationAtStart = props.createdGame
  try {
    message.value = ''
    isLoading.value = true
    hasLoaded.value = false
    const response = await $supabase.functions.invoke('game-list', {method: 'GET'})
    if (response.error || !Array.isArray(response.data) || !response.data.every(isGameListItem)) {
      message.value = 'Не удалось загрузить комнаты. Попробуйте ещё раз'
      return
    }
    state.value = response.data
    // A list request started before creation may not contain the new room yet.
    if (props.createdGame && props.createdGame !== creationAtStart) {
      const game = joinedGame.value?.id === props.createdGame.id ? joinedGame.value : props.createdGame
      state.value = [...state.value.filter((item) => item.id !== game.id), {...game}]
    }
    hasLoaded.value = true
  } catch {
    message.value = 'Не удалось загрузить комнаты. Попробуйте ещё раз'
  } finally {
    isLoading.value = false
  }
}

const joinGame = async (game: GameListItem) => {

  if (pendingGameId.value || isLoading.value || waiting.value) return
  const creationAtStart = props.createdGame
  pendingGameId.value = game.id
  joinedGame.value = null
  joinMessage.value = ''
  try {
    const password = passwords.value[game.id] ?? ''
    const response = await $supabase.functions.invoke('join-game', {
      body: {gameId: game.id, ...(password !== '' && {password})},
    })
    if (props.createdGame !== creationAtStart) return
    if (response.error) {
      joinMessage.value = 'Не удалось присоединиться к комнате. Попробуйте ещё раз'
      // Read only known server errors; never display arbitrary upstream diagnostics.
      const context = response.error.context
      if (context instanceof Response) {
        const messages: Record<number, string> = {
          401: 'Сессия недействительна. Войдите снова',
          403: 'Неверный пароль',
          404: 'Комната не найдена. Обновите список',
          409: 'Свободных мест нет. Обновите список',
        }
        joinMessage.value = messages[context.status] ?? joinMessage.value
      }
      return
    }
    if (!isGameListItem(response.data) || response.data.id !== game.id || response.data.occupiedSeatCount < 1) {
      joinMessage.value = 'Не удалось присоединиться к комнате. Попробуйте ещё раз'
      return
    }
    joinedGame.value = response.data
    state.value = state.value.map((item) => item.id === game.id ? response.data : item)
    passwords.value[game.id] = ''
  } catch {
    if (props.createdGame !== creationAtStart) return
    joinMessage.value = 'Не удалось присоединиться к комнате. Попробуйте ещё раз'
  } finally {
    if (pendingGameId.value === game.id) pendingGameId.value = null
  }
}
const editState = (changeData: ChangeData) => {
  if (joinedGame.value === null) return
  joinedGame.value = {...joinedGame.value, ...changeData}
  state.value = state.value.map((item) => item.id === joinedGame.value?.id ? {...item, ...changeData} : item)
}
const updateOccupiedSeatCount = (value: number) => {
  if (joinedGame.value === null) return
  joinedGame.value = {...joinedGame.value, occupiedSeatCount: value}
  state.value = state.value.map((item) => item.id === joinedGame.value?.id ? {...item, occupiedSeatCount: value} : item)
}
</script>

<template>
  <section aria-label="Список комнат">
    <h2>Комнаты</h2>
    <button :disabled="isLoading || pendingGameId !== null || waiting" type="button" @click="loadList">Обновить</button>
    <p v-if="message" role="alert">{{ message }}</p>
    <p v-if="isLoading" role="status">Загружаем комнаты…</p>
    <p v-if="!isLoading && hasLoaded && state.length === 0 && message === ''">Комнат пока нет</p>

    <article v-for="el in state" :key="el.id" :aria-label="'Комната ' + el.id">
      <div>
        <p>Комната {{ el.id }}</p>
        <p>Всего мест: {{ el.seat_count }}</p>
        <p>Занято: {{ el.occupiedSeatCount }}</p>
        <p>Свободно: {{ el.seat_count - el.occupiedSeatCount }}</p>
        <p>Количество минут на ход игрока {{ el.turnDurationMinutes }}</p>
        <p>Пароль: {{ el.hasPassword ? 'требуется' : 'не требуется' }}</p>
      </div>
      <form @submit.prevent="joinGame(el)">
        <template v-if="el.hasPassword">
          <label :for="'password-' + el.id">Пароль комнаты</label>
          <input :id="'password-' + el.id" v-model="passwords[el.id]" type="password" autocomplete="off">
        </template>
        <button type="submit" :disabled="pendingGameId !== null || isLoading || waiting">
          {{ pendingGameId === el.id ? 'Присоединяемся…' : 'Присоединиться' }}
        </button>
      </form>
    </article>

    <p v-if="joinMessage" role="alert">{{ joinMessage }}</p>
    <GameLobby
      v-if="joinedGame"
      :key="joinedGame.id"
      :joined-game="joinedGame"
      @busy-change="waiting = $event"
      @change-data="editState($event)"
      @occupied-seat-count-change="updateOccupiedSeatCount($event)"
    />
  </section>
</template>
