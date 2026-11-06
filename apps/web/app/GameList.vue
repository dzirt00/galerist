<script setup lang="ts">
import {useNuxtApp} from 'nuxt/app'
import {computed, ref, onMounted, onUnmounted} from 'vue'

import type {GameListItem} from './types/lobby'
import {isGameList, isGameListItem} from './utils/lobby-validation'
import {getFunctionError, getFunctionErrorMessage} from './utils/api-errors'
import {useOwnLobby} from './composable/own-lobby'

const emit = defineEmits<{
  lobbyReturned: [value: GameListItem]
  gameJoined: [value: GameListItem]
}>()


const hasLoaded = ref(false)

const state = ref<GameListItem[]>([])
const {$supabase} = useNuxtApp()
const isLoading = ref(false)
const message = ref('')
const pendingGameId = ref<string | null>(null)
const passwords = ref<Record<string, string>>({})
const joinMessage = ref<string>('')
const {ownLobbyId, isReturning, returnMessage, clearOwnLobby, offerOwnLobby, returnToOwnLobby} =
  useOwnLobby(game => {
    state.value = [...state.value.filter(item => item.id !== game.id), game]
    joinMessage.value = ''
    emit('lobbyReturned', game)
  })
let active = true
const isBusy = computed(() => isLoading.value || pendingGameId.value !== null || isReturning.value)
const isReturnDisabled = computed(() => isReturning.value || pendingGameId.value !== null)
const showEmptyList = computed(() => !isLoading.value && hasLoaded.value && state.value.length === 0 && message.value === '')
const returnLabel = computed(() => isReturning.value ? 'Возвращаемся…' : 'Вернуться в своё лобби')
const roomCards = computed(() => state.value.map(game => ({
  game,
  label: `Комната ${game.id}`,
  passwordInputId: `password-${game.id}`,
  freeSeatCount: game.seat_count - game.occupiedSeatCount,
  passwordLabel: game.hasPassword ? 'требуется' : 'не требуется',
  joinLabel: pendingGameId.value === game.id ? 'Присоединяемся…' : 'Присоединиться',
})))

onMounted(() => {
  loadList()
})

onUnmounted(() => {
  active = false
})
const loadList = async () => {
  if (isBusy.value) return

  try {
    message.value = ''
    isLoading.value = true
    hasLoaded.value = false
    const response = await $supabase.functions.invoke('game-list', {method: 'GET'})
    if (!active) return
    if (response.error) {
      const errorMessage = await getFunctionErrorMessage(response.error, 'Не удалось загрузить комнаты. Попробуйте ещё раз')
      if (!active) return
      message.value = errorMessage
      return
    }
    if (!isGameList(response.data)) {
      message.value = 'Не удалось загрузить комнаты. Попробуйте ещё раз'
      return
    }
    state.value = response.data

    hasLoaded.value = true
  } catch {
    if (active) message.value = 'Не удалось загрузить комнаты. Попробуйте ещё раз'

  } finally {
    if (active) isLoading.value = false
  }
}

const joinGame = async (game: GameListItem) => {

  if (isBusy.value) return
  clearOwnLobby()

  pendingGameId.value = game.id
  joinMessage.value = ''
  try {
    const password = passwords.value[game.id] ?? ''
    const response = await $supabase.functions.invoke('join-game', {
      body: {gameId: game.id, ...(password !== '' && {password})},
    })
    if (!active) return

    if (response.error) {
      const failure = await getFunctionError(response.error, 'Не удалось присоединиться к комнате. Попробуйте ещё раз')
      if (!active) return

      joinMessage.value = failure.message
      offerOwnLobby(failure)
      return
    }
    if (!isGameListItem(response.data) || response.data.id !== game.id || response.data.occupiedSeatCount < 1) {
      joinMessage.value = 'Не удалось присоединиться к комнате. Попробуйте ещё раз'
      return
    }
    emit('gameJoined', response.data)
    state.value = state.value.map((item) => item.id === game.id ? response.data : item)
    passwords.value[game.id] = ''
  } catch {

    if (active) joinMessage.value = 'Не удалось присоединиться к комнате. Попробуйте ещё раз'

  } finally {
    if (pendingGameId.value === game.id && active) pendingGameId.value = null
  }
}


</script>

<template>
  <section aria-label="Список комнат">
    <h2>Комнаты</h2>
    <button :disabled="isBusy" type="button" @click="loadList">Обновить</button>
    <p v-if="message" role="alert">{{ message }}</p>
    <p v-if="isLoading" role="status">Загружаем комнаты…</p>
    <p v-if="showEmptyList">Комнат пока нет</p>

    <article v-for="card in roomCards" :key="card.game.id" :aria-label="card.label">
      <div>
        <p>Комната {{ card.game.id }}</p>
        <p>Всего мест: {{ card.game.seat_count }}</p>
        <p>Занято: {{ card.game.occupiedSeatCount }}</p>
        <p>Свободно: {{ card.freeSeatCount }}</p>
        <p>Количество минут на ход игрока {{ card.game.turnDurationMinutes }}</p>
        <p>Пароль: {{ card.passwordLabel }}</p>
      </div>
      <form @submit.prevent="joinGame(card.game)">
        <template v-if="card.game.hasPassword">
          <label :for="card.passwordInputId">Пароль комнаты</label>
          <input :id="card.passwordInputId" v-model="passwords[card.game.id]" type="password" autocomplete="off">
        </template>
        <button type="submit" :disabled="isBusy">
          {{ card.joinLabel }}
        </button>
      </form>
    </article>

    <p v-if="joinMessage" role="alert">{{ joinMessage }}</p>
    <button v-if="ownLobbyId" type="button" :disabled="isReturnDisabled" @click="returnToOwnLobby">
      {{ returnLabel }}
    </button>
    <p v-if="returnMessage" role="alert">{{ returnMessage }}</p>

  </section>
</template>
