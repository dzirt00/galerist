import {useNuxtApp} from 'nuxt/app'
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {isProfile} from '../utils/lobby-validation'
import {getSupabaseErrorMessage} from '../utils/api-errors'

interface Profile {
  id: string;
  created_at: string
  display_name: string
}

type Auth = 'signIn' | 'register'

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
        profileMessage.value = getSupabaseErrorMessage(response.error, 'Не удалось проверить вход')
        hasProfileError.value = true
      } else if (response.data.session) {
        const profileResponse = await $supabase.from('profiles').select('id, created_at, display_name').eq('id', response.data.session.user.id).maybeSingle()
        if (profileResponse.error) {
          profileMessage.value = getSupabaseErrorMessage(profileResponse.error, 'Не удалось загрузить профиль')
          hasProfileError.value = true
        } else if (profileResponse.data === null) {
          profileMessage.value = 'Профиль не найден'
          hasProfileError.value = true
        } else if (!isProfile(profileResponse.data)) {
          profileMessage.value = 'Некорректный ответ сервера'
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
  let isActive = true
  const {$supabase} = useNuxtApp()
  const email = ref('')
  const isSubmitting = ref(false)
  const signInMessage = ref('')
  const authMode = ref<Auth>('signIn')
  const displayName = ref<string>('')
  const isRegistration = computed(() => (authMode.value === 'register'))
  const handlerSubmitting = computed(() => isSubmitting.value ? 'Отправляем…' : 'Получить ссылку')

  watch(() => authMode.value, () => {
    if (authMode.value === 'signIn') {
      displayName.value = ''
    }
  })

  const sendSignInLink = async () => {
    if (isSubmitting.value) return
    if (authMode.value === 'signIn') {
      isSubmitting.value = true
      signInMessage.value = ''
      try {
        const response = await $supabase.auth.signInWithOtp(
          {
            email: email.value,
            options: {
              shouldCreateUser: false,
            }
          }
        )
        if (!isActive) return
        signInMessage.value = response.error ? getSupabaseErrorMessage(response.error, 'Не удалось отправить письмо. Попробуйте ещё раз') : 'Письмо отправлено. Проверьте почту'
      } catch {
        if (isActive) signInMessage.value = 'Не удалось отправить письмо. Попробуйте ещё раз'
      } finally {
        if (isActive) isSubmitting.value = false
      }
    } else {
      signInMessage.value = ''
      const displayNameTrim = displayName.value.trim()
      if (displayNameTrim === '' || displayNameTrim.length > 30) {
        signInMessage.value = 'Имя должно быть не пустым'
        return
      }
      isSubmitting.value = true
      try {
        const response = await $supabase.auth.signInWithOtp(
          {
            email: email.value,
            options: {
              shouldCreateUser: true,
              data: {
                display_name: displayName.value
              }
            }
          })
        if (!isActive) return
        signInMessage.value = response.error ? getSupabaseErrorMessage(response.error, 'Не удалось отправить письмо. Попробуйте ещё раз') : 'Письмо отправлено. Проверьте почту'
      } catch {
        if (isActive) signInMessage.value = 'Не удалось отправить письмо. Попробуйте ещё раз'
      } finally {
        if (isActive) isSubmitting.value = false
      }
    }
  }
  onUnmounted(() => {
    isActive = false
  })
  return {
    email,
    isSubmitting,
    signInMessage,
    handlerSubmitting,
    sendSignInLink,
    displayName,
    isRegistration,
    authMode,
  }
}
