import {onUnmounted, ref} from 'vue'
import {useNuxtApp} from 'nuxt/app'
import type {GameListItem} from '../types/lobby'
import {isGameListItem} from '../utils/lobby-validation'
import {getFunctionError, type FunctionError} from '../utils/api-errors'

export function useOwnLobby(onReturned: (game: GameListItem) => void) {
  const {$supabase} = useNuxtApp()
  const ownLobbyId = ref<string | null>(null)
  const isReturning = ref(false)
  const returnMessage = ref('')
  let active = true
  let generation = 0
  onUnmounted(() => { active = false; generation++ })

  function clearOwnLobby() {
    generation++
    ownLobbyId.value = null
    returnMessage.value = ''
    isReturning.value = false
  }
  function offerOwnLobby(failure: FunctionError) {
    clearOwnLobby()
    if (failure.status === 409 && failure.code === 'OWN_LOBBY_EXISTS' && failure.gameId) {
      ownLobbyId.value = failure.gameId
    }
  }
  async function returnToOwnLobby() {
    if (!active || isReturning.value || !ownLobbyId.value) return
    const gameId = ownLobbyId.value
    const started = generation
    const current = () => active && generation === started
    isReturning.value = true
    returnMessage.value = ''
    const fallback = 'Не удалось вернуться в своё лобби. Попробуйте ещё раз'
    try {
      const response = await $supabase.functions.invoke('get-own-lobby', {body: {gameId}})
      if (!current()) return
      if (response.error) {
        const failure = await getFunctionError(response.error, fallback)
        if (!current()) return
        returnMessage.value = failure.message
        if (failure.status === 404) ownLobbyId.value = null
        return
      }
      if (!isGameListItem(response.data) || response.data.id !== gameId || response.data.occupiedSeatCount < 1) {
        returnMessage.value = 'Некорректный ответ сервера'
        return
      }
      const {id, seat_count, occupiedSeatCount, hasPassword, turnDurationMinutes} = response.data
      ownLobbyId.value = null
      onReturned({id, seat_count, occupiedSeatCount, hasPassword, turnDurationMinutes})
    } catch {
      if (current()) returnMessage.value = fallback
    } finally {
      if (current()) isReturning.value = false
    }
  }
  return {ownLobbyId, isReturning, returnMessage, clearOwnLobby, offerOwnLobby, returnToOwnLobby}
}
