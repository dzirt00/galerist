<script lang="ts" setup>
import SignInForm from './SignInForm.vue'
import {useProfile} from './composable/auth'
import CreateGameForm from './CreateGameForm.vue'
import GameList from './GameList.vue'
import {computed, shallowRef} from 'vue'
import type {GameListItem} from './types/lobby'

const createdGame = shallowRef<GameListItem | null>(null)

const {
  profile,
  isLoadingProfile,
  hasProfileError,
  profileMessage,
  loadProfile,
} = useProfile()
const showSignIn = computed(() => !profile.value && !isLoadingProfile.value && !hasProfileError.value)
const showCreateGame = computed(() => !createdGame.value)
const clearProfileMessage = () => { profileMessage.value = '' }
const openLobby = (game: GameListItem) => { createdGame.value = game }
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
    />

    <GameList :created-game="createdGame" @lobby-returned="openLobby"/>
  </section>
  <p v-if="isLoadingProfile">Загружаем профиль…</p>
  <button
    v-if="hasProfileError"
    type="button"
    :disabled="isLoadingProfile"
    @click="loadProfile"
  >
    Повторить загрузку
  </button>
</template>
