<script lang="ts" setup>
import {computed, onMounted, ref} from 'vue'
import {useNuxtApp} from 'nuxt/app'

interface Profile {
  id: string;
  created_at: string
}

const {$supabase} = useNuxtApp()
const email = ref('')
const isLoadingProfile = ref(false)
const message = ref('')
const hasProfileError = ref(false)
const isSubmitting = ref(false);
const handlerSubmitting = computed(() => isSubmitting.value ? 'Отправляем…' : 'Получить ссылку')
const profile = ref<Profile | null>(null)
onMounted(async () => {
  const hashParamsString = window.location.hash.slice(1);
  const params = new URLSearchParams(hashParamsString);
  if (params.has('error')) {
    message.value = 'Ссылка недействительна или устарела. Запросите новую.';
  } else {
    await loadProfile()
  }
})

const loadProfile = async () => {
  if (isLoadingProfile.value) return
  message.value = ''
  isLoadingProfile.value = true
  hasProfileError.value = false
  try {
    const response = await $supabase.auth.getSession()
    if (response.error) {
      message.value = 'Не удалось проверить вход'
      hasProfileError.value = true
    } else if (response.data.session) {
      const profileResponse = await $supabase.from('profiles').select('id, created_at').eq('id', response.data.session.user.id).maybeSingle()
      if (profileResponse.error) {
        message.value = 'Не удалось загрузить профиль'
        hasProfileError.value = true
      } else if (profileResponse.data === null) {
        message.value = 'Профиль не найден'
        hasProfileError.value = true
      } else {
        message.value = 'Профиль загружен'
        profile.value = profileResponse.data
      }
    }
  } catch {
    message.value = 'Не удалось загрузить профиль'
    hasProfileError.value = true
  } finally {
    isLoadingProfile.value = false
  }

}

const sendSignInLink = async () => {

  if (isSubmitting.value) return

  isSubmitting.value = true
  message.value = ''
  try {
    const response = await $supabase.auth.signInWithOtp({email: email.value})
    message.value = (response.error) ? 'Не удалось отправить письмо. Попробуйте ещё раз' : 'Письмо отправлено. Проверьте почту'
  } catch {
    message.value = 'Не удалось отправить письмо. Попробуйте ещё раз'
  } finally {
    isSubmitting.value = false
  }

}
</script>

<template>
  <form v-if="!profile && !isLoadingProfile && !hasProfileError" @submit.prevent="sendSignInLink">
    <div>
      <label for="email">Email:</label>
      <input
        id="email"
        v-model="email"
        type="email"
        required
      >
    </div>
    <button type="submit" :disabled="isSubmitting">{{ handlerSubmitting }}</button>
  </form>
  <p v-if="message" role="status"> {{ message }}</p>
  <section v-if="profile">
    <h2>Мой профиль</h2>
    <p v-if="profile"> {{ profile.id }}</p>
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
