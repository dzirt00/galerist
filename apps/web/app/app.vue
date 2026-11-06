<script lang="ts" setup>
import SignInForm from './SignInForm.vue'
import {useProfile} from './composable/auth'
import CreateGameForm from './CreateGameForm.vue'
import GameList from './GameList.vue'
import {computed, shallowRef, ref} from 'vue'
import type {GameListItem} from './types/lobby'
import GameLobby from './GameLobby.vue'

interface ChangeData {
  seat_count: number
  turnDurationMinutes: number
}

const createdGame = shallowRef<GameListItem | null>(null)

const {
  profile,
  isLoadingProfile,
  hasProfileError,
  profileMessage,
  loadProfile,
} = useProfile()
const showSignIn = computed(() => !profile.value && !isLoadingProfile.value && !hasProfileError.value)
const showCreateGame = computed(() => isCreateFormOpen.value && createdGame.value === null)
const showCreateButton = computed(() => !isCreateFormOpen.value && !createdGame.value)
const openCreateForm = () => {
  if (showCreateButton.value) isCreateFormOpen.value = true
}
const closeCreateForm = () => {
  isCreateFormOpen.value = false
}
const clearProfileMessage = () => {
  profileMessage.value = ''
}
const openLobby = (game: GameListItem) => {
  createdGame.value = game
  isCreateFormOpen.value = false
}
const isCreateFormOpen = ref(false)
const showGameList = computed(() => createdGame.value === null)
const editState = (changeData: ChangeData) => {
  if (createdGame.value === null) return
  createdGame.value = {...createdGame.value, ...changeData}
}
const updateOccupiedSeatCount = (value: number) => {
  if (createdGame.value === null) return
  createdGame.value = {...createdGame.value, occupiedSeatCount: value}
}

</script>

<template>
  <SignInForm
    v-if="showSignIn"
    @submit="clearProfileMessage"
  />
  <p v-if="profileMessage" role="status">{{ profileMessage }}</p>
  <section v-if="profile">
    <h2>Мой профиль</h2>
    <p>{{ profile.id }}</p>

    <CreateGameForm
      v-if="showCreateGame"
      @game-created="openLobby"
      @lobby-returned="openLobby"
      @cancel="closeCreateForm"
    />
    <button type="button" v-if="showCreateButton" @click="openCreateForm">Создать
      комнату
    </button>


    <GameList v-if="showGameList" @lobby-returned="openLobby"
              @game-joined="openLobby($event)"/>
    <GameLobby
      v-if="createdGame"
      :key="createdGame.id"
      :joined-game="createdGame"
      @change-data="editState"
      @occupied-seat-count-change="updateOccupiedSeatCount"
    />

  </section>
  <p v-if="isLoadingProfile">Загружаем профиль…</p>
  <button
    v-if="hasProfileError"
    type="button"
    :disabled="isLoadingProfile"
    @click="loadProfile()"
  >
    Повторить загрузку
  </button>
</template>
