<script setup lang="ts">
import {useSignInLink} from './composable/auth'
import {computed} from 'vue'

const emit = defineEmits<{
  submit: []
}>()

const {
  isSubmitting,
  email,
  sendSignInLink,
  handlerSubmitting,
  signInMessage,
  displayName,
  isRegistration,
  authMode,
} = useSignInLink()

const submitSignInLink = async () => {
  if (isSubmitting.value) return
  emit('submit')
  await sendSignInLink()
}
const typeAuth = () => {
  if (isSubmitting.value) return
  if (authMode.value === 'signIn') {
    authMode.value = 'register'
  } else {
    authMode.value = 'signIn'
  }
}
const textAuthButton = computed(() => isRegistration.value ? 'Перейти ко входу' : 'Перейти к регистрации')
</script>

<template>
  <form @submit.prevent="submitSignInLink">
    <div>
      <label for="email">Email:</label>
      <input
        id="email"
        v-model="email"
        type="email"
        required
        :disabled="isSubmitting"
      >
      <div v-if="isRegistration">
        <label for="displayName">Никнейм пользователя:</label>
        <input
          id="displayName"
          v-model.trim="displayName"
          type="text"
          minLength="1"
          maxLength="30"
          required
          :disabled="isSubmitting"
        >
      </div>
    </div>
    <button type="button" class="btn btn-primary" :disabled="isSubmitting"
            @click="typeAuth">
      {{ textAuthButton }}
    </button>
    <button type="submit" :disabled="isSubmitting">{{ handlerSubmitting }}</button>
  </form>
  <p v-if="signInMessage" role="status">{{ signInMessage }}</p>
</template>
