<script setup lang="ts">
import {useNuxtApp} from 'nuxt/app'
import {ref} from 'vue'

interface GameListItem {
  id: string
  seat_count: number
  occupiedSeatCount: number
  hasPassword: boolean
}

function isGameListItem(value: unknown): value is GameListItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && item.id.length > 0
    && [2, 3, 4].includes(item.seat_count as number)
    && typeof item.occupiedSeatCount === 'number' && Number.isSafeInteger(item.occupiedSeatCount)
    && item.occupiedSeatCount >= 0 && item.occupiedSeatCount <= (item.seat_count as number)
    && typeof item.hasPassword === 'boolean'
}

const hasLoaded = ref(false)
const state = ref<GameListItem[]>([])
const {$supabase} = useNuxtApp()
const isLoading = ref(false)
const message = ref('')
const pendingGameId = ref<string | null>(null)
const passwords = ref<Record<string, string>>({})
const joinMessage = ref('')
const joinedGame = ref<GameListItem | null>(null)

const loadList = async () => {
  if (isLoading.value || pendingGameId.value) return
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
    hasLoaded.value = true
  } catch {
    message.value = 'Не удалось загрузить комнаты. Попробуйте ещё раз'
  } finally {
    isLoading.value = false
  }
}

const joinGame = async (game: GameListItem) => {
  if (pendingGameId.value || isLoading.value) return
  pendingGameId.value = game.id
  joinedGame.value = null
  joinMessage.value = ''
  try {
    const password = passwords.value[game.id] ?? ''
    const response = await $supabase.functions.invoke('join-game', {
      body: {gameId: game.id, ...(password !== '' && {password})},
    })
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
    joinMessage.value = 'Не удалось присоединиться к комнате. Попробуйте ещё раз'
  } finally {
    pendingGameId.value = null
  }
}
</script>

<template>
  <section aria-label="Список комнат">
    <h2>Комнаты</h2>
    <button :disabled="isLoading || pendingGameId !== null" type="button" @click="loadList">Обновить</button>
    <p v-if="message" role="alert">{{ message }}</p>
    <p v-if="isLoading" role="status">Загружаем комнаты…</p>
    <p v-if="!isLoading && hasLoaded && state.length === 0 && message === ''">Комнат пока нет</p>

    <article v-for="el in state" :key="el.id" :aria-label="'Комната ' + el.id">
      <div>
        <p>Комната {{ el.id }}</p>
        <p>Всего мест: {{ el.seat_count }}</p>
        <p>Занято: {{ el.occupiedSeatCount }}</p>
        <p>Свободно: {{ el.seat_count - el.occupiedSeatCount }}</p>
        <p>Пароль: {{ el.hasPassword ? 'требуется' : 'не требуется' }}</p>
      </div>
      <form @submit.prevent="joinGame(el)">
        <template v-if="el.hasPassword">
          <label :for="'password-' + el.id">Пароль комнаты</label>
          <input :id="'password-' + el.id" v-model="passwords[el.id]" type="password" autocomplete="off">
        </template>
        <button type="submit" :disabled="pendingGameId !== null || isLoading">
          {{ pendingGameId === el.id ? 'Присоединяемся…' : 'Присоединиться' }}
        </button>
      </form>
    </article>

    <p v-if="joinMessage" role="alert">{{ joinMessage }}</p>
    <section v-if="joinedGame" aria-label="Лобби">
      <h2>Вы в комнате {{ joinedGame.id }}</h2>
      <p>Всего мест: {{ joinedGame.seat_count }}</p>
      <p>Занято: {{ joinedGame.occupiedSeatCount }}</p>
      <p>Свободно: {{ joinedGame.seat_count - joinedGame.occupiedSeatCount }}</p>
      <p>Пароль: {{ joinedGame.hasPassword ? 'требуется' : 'не требуется' }}</p>
    </section>
  </section>
</template>