<script lang="ts" setup>
import {computed, onMounted, ref} from 'vue'
import {useNuxtApp} from 'nuxt/app'

const {$supabase} = useNuxtApp()
const email = ref('')
const message = ref('')
const isSubmitting = ref(false);
const handlerSubmitting = computed(() => isSubmitting.value ? 'Отправляем…' : 'Получить ссылку')

onMounted(async () => {
  const response = await $supabase.auth.getSession()
  if (response.error) {
    message.value = 'Не удалось проверить вход'
  } else if (response.data.session) {
    const profileResponse = await $supabase.from('profiles').select('id, created_at').eq('id', response.data.session.user.id).maybeSingle()
    if (profileResponse.error) {
      message.value = 'Не удалось загрузить профиль'
    } else if (profileResponse.data === null) {
      message.value = 'Профиль не найден'
    } else {
      message.value = 'Профиль загружен'
    }
  }

})

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
  <form @submit.prevent="sendSignInLink">
    <div>
      <label for="email">Email:</label>
      <input
        v-model="email"
        id="email"
        type="email"
        required
      >
    </div>
    <button type="submit" :disabled="isSubmitting">{{ handlerSubmitting }}</button>
  </form>
  <p v-if="message" role="status"> {{ message }}</p>

</template>
