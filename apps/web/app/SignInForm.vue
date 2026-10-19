<script setup lang="ts">
import {useSignInLink} from './composable/auth'

const emit = defineEmits<{
  submit: []
}>()

const {
  isSubmitting,
  email,
  sendSignInLink,
  handlerSubmitting,
  signInMessage,
} = useSignInLink()

const submitSignInLink = async () => {
  if (isSubmitting.value) return
  emit('submit')
  await sendSignInLink()
}
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
      >
    </div>
    <button type="submit" :disabled="isSubmitting">{{ handlerSubmitting }}</button>
  </form>
  <p v-if="signInMessage" role="status">{{ signInMessage }}</p>
</template>
