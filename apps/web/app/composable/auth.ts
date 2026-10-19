import {useNuxtApp} from 'nuxt/app'
import {computed, onMounted, ref} from 'vue'

interface Profile {
  id: string;
  created_at: string
}

export function useProfile() {
  const {$supabase} = useNuxtApp()
  const profile = ref<Profile | null>(null)
  const isLoadingProfile = ref(false)
  const hasProfileError = ref(false)
  const profileMessage = ref('')

  const loadProfile = async () => {
    if (isLoadingProfile.value) return
    profileMessage.value = ''
    isLoadingProfile.value = true
    hasProfileError.value = false
    try {
      const response = await $supabase.auth.getSession()
      if (response.error) {
        profileMessage.value = 'Не удалось проверить вход'
        hasProfileError.value = true
      } else if (response.data.session) {
        const profileResponse = await $supabase.from('profiles').select('id, created_at').eq('id', response.data.session.user.id).maybeSingle()
        if (profileResponse.error) {
          profileMessage.value = 'Не удалось загрузить профиль'
          hasProfileError.value = true
        } else if (profileResponse.data === null) {
          profileMessage.value = 'Профиль не найден'
          hasProfileError.value = true
        } else {
          profileMessage.value = 'Профиль загружен'
          profile.value = profileResponse.data
        }
      }
    } catch {
      profileMessage.value = 'Не удалось загрузить профиль'
      hasProfileError.value = true
    } finally {
      isLoadingProfile.value = false
    }
  }

  onMounted(async () => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    if (params.has('error')) {
      profileMessage.value = 'Ссылка недействительна или устарела. Запросите новую.'
    } else {
      await loadProfile()
    }
  })

  return {
    profile,
    isLoadingProfile,
    hasProfileError,
    profileMessage,
    loadProfile,
  }
}

export function useSignInLink() {
  const {$supabase} = useNuxtApp()
  const email = ref('')
  const isSubmitting = ref(false)
  const signInMessage = ref('')
  const handlerSubmitting = computed(() => isSubmitting.value ? 'Отправляем…' : 'Получить ссылку')

  const sendSignInLink = async () => {
    if (isSubmitting.value) return
    isSubmitting.value = true
    signInMessage.value = ''
    try {
      const response = await $supabase.auth.signInWithOtp({email: email.value})
      signInMessage.value = response.error ? 'Не удалось отправить письмо. Попробуйте ещё раз' : 'Письмо отправлено. Проверьте почту'
    } catch {
      signInMessage.value = 'Не удалось отправить письмо. Попробуйте ещё раз'
    } finally {
      isSubmitting.value = false
    }
  }

  return {
    email,
    isSubmitting,
    signInMessage,
    handlerSubmitting,
    sendSignInLink,
  }
}
