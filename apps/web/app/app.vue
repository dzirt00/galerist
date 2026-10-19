<script lang="ts" setup>
import SignInForm from './SignInForm.vue'
import {useProfile} from './composable/auth'
import CreateGameForm from './CreateGameForm.vue'

const {
  profile,
  isLoadingProfile,
  hasProfileError,
  profileMessage,
  loadProfile,
} = useProfile()
</script>

<template>
  <SignInForm
    v-if="!profile && !isLoadingProfile && !hasProfileError"
    @submit="profileMessage = ''"
  />
  <p v-if="profileMessage" role="status">{{ profileMessage }}</p>
  <section v-if="profile">
    <h2>Мой профиль</h2>
    <p>{{ profile.id }}</p>
    <CreateGameForm/>
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
