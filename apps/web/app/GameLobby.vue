<script setup lang="ts">
import {computed, onUnmounted, ref} from 'vue'
import {useNuxtApp} from 'nuxt/app'
import type {GameListItem} from './types/lobby'
import {
  isGamePlayersResponse,
  isReadyResult,
  isSettingsResult,
  isSeatCount,
  isTurnDurationMinutes,
  isAddBot, isResponseDeleteUser
} from './utils/lobby-validation'
import {getFunctionErrorMessage, getFunctionError} from './utils/api-errors'


interface ChangeData {
  seat_count: number
  turnDurationMinutes: number
}

export interface GamePlayer {
  isReady: boolean,
  user_id: string | null
  display_name: string
  seat_id: string;
  is_bot: boolean;
}

export interface PendingBotRequest {
  gameId: string
  requestId: string
}

export interface PendingLeaveGameRequest {
  gameId: string
  requestId: string
}

export interface PendingRemoveBotRequest {
  gameId: string
  requestId: string
  seat_id: string
}

const props = defineProps<{
  joinedGame: GameListItem | null,
  profileId: string
}>()
const emit = defineEmits<{
  busyChange: [value: boolean]
  changeData: [value: ChangeData]
  occupiedSeatCountChange: [value: number]
  leaveRoom: [value: string]
}>()
let active = true
let refreshPending = false
onUnmounted(() => {
  active = false
})

// Keep command execution distinct from roster loading; isBusy serializes both.
const isRefreshGame = ref(false)
const isCommandPending = ref(false)
const message = ref('')
const playerList = ref<GamePlayer[] | null>(null)
const pendingLeaveGameRequest = ref<PendingLeaveGameRequest | null>(null)
const pendingRemoveBotRequest = ref<PendingRemoveBotRequest | null>(null)
const {$supabase} = useNuxtApp()
const playerIsReady = ref<boolean | null>(null)
const changeSeatCount = ref<number | null>(props.joinedGame?.seat_count ?? null)
const turnDurationMinutes = ref<number | null>(props.joinedGame?.turnDurationMinutes ?? null)
const creatorId = ref<string | null>(null)
const isCanEditLobby = computed(() => creatorId.value === props.profileId)

const changeReady = computed(() => playerIsReady.value !== true)
const isBusy = computed(() => isCommandPending.value || isRefreshGame.value)
const isReadyDisabled = computed(() => props.joinedGame === null || isBusy.value)
const areSettingsDisabled = computed(() => props.joinedGame === null || isBusy.value || !isCanEditLobby.value)
const freeSeatCount = computed(() => props.joinedGame
  ? props.joinedGame.seat_count - props.joinedGame.occupiedSeatCount
  : 0)
const canLeaveGame = computed(() => {
  if (props.joinedGame === null || isBusy.value) return false
  if (pendingLeaveGameRequest.value !== null) return true
  if (creatorId.value !== null && creatorId.value !== props.profileId) return true
  return false
})
const canRemoveBot = computed(() => {
  if (props.joinedGame === null || isBusy.value) return false
  if (pendingRemoveBotRequest.value !== null) return true
  if (creatorId.value !== null && creatorId.value === props.profileId) return true
  return false
})

const isLeaveDisabled = computed(() => !canLeaveGame.value)
const isRemoveDisabled = computed(() => !canRemoveBot.value)

const passwordLabel = computed(() => props.joinedGame?.hasPassword ? 'требуется' : 'не требуется')
const readyButtonLabel = computed(() => isCommandPending.value ? 'Сохраняем…'
  : changeReady.value ? 'Подтвердить готовность' : 'Снять готовность')
const readinessLabel = computed(() => playerIsReady.value === null ? 'Готовность неизвестна'
  : playerIsReady.value ? 'Готов' : 'Не готов')
const refreshLabel = computed(() => isRefreshGame.value ? 'Загружаем состав…' : 'Обновить')
const hasPlayerList = computed(() => playerList.value !== null)
const playerRows = computed(() => (playerList.value ?? []).map(player => ({
  ...player,
  readinessLabel: player.isReady ? 'готов' : 'не готов',
  buttonDisabled: (isRemoveDisabled.value ||
    (pendingRemoveBotRequest.value !== null && pendingRemoveBotRequest.value.seat_id !==
      player.seat_id)) || player.user_id === props.profileId
})))
const toggleReady = () => isReady(changeReady.value)
const isReadyToGame = computed(() => {
  if (isRefreshGame.value) {
    return 'Идет обновление данных'
  }
  if (playerList.value === null) {
    return 'неизвестная готовность'
  }
  if (playerList.value.length < 2) {
    return 'Для запуска нужны минимум два участника'
  }

  if (!(playerList.value.every(el => el.isReady))) {
    return 'Не все участники готовы'
  }
  return 'Комната готова к запуску'
})

let pendingBotRequest: PendingBotRequest | null = null
if (props.joinedGame && props.joinedGame.id !== null) {
  const channel = $supabase
    .channel(`lobby:${props.joinedGame.id}`, {config: {private: true}})
    .on('broadcast', {event: 'data is changed'}, () => {
      refreshGame()
    })
    .subscribe((status) => {
      if (!active) return
      if (status === 'CLOSED') return
      if (status === 'SUBSCRIBED') refreshGame()
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') message.value = 'Не удалось подключить автоматическое обновление. Состав можно обновить вручную'
    })
  onUnmounted(() => $supabase.removeChannel(channel))
}

// Release only the state owned by the command, then drain a queued roster read.
const finishCommand = async () => {
  isCommandPending.value = false
  if (active) emit('busyChange', false)
  if (active && refreshPending) await refreshGame()
}

const isReady = async (value: boolean) => {
  if (isReadyDisabled.value || props.joinedGame === null) return
  isCommandPending.value = true
  message.value = ''
  emit('busyChange', true)
  try {
    const response = await $supabase.functions.invoke('ready-to-game', {
      body: {
        gameId: props.joinedGame.id,
        isReady: value
      }
    })
    if (!active) return
    if (response.error) {
      const errorMessage = await getFunctionErrorMessage(response.error, 'Что то пошло не так')
      if (!active) return
      message.value = errorMessage
      return
    }
    if (isReadyResult(response.data) && response.data.isReady === value) {
      playerIsReady.value = response.data.isReady
    } else {
      message.value = 'Что то пошло не так'
    }
  } catch {
    message.value = 'Что то пошло не так'
  } finally {
    await finishCommand()
  }
}

const refreshGame = async () => {

  if (!active || props.joinedGame === null) return

  if (isBusy.value) {
    refreshPending = true
    return
  }
  isRefreshGame.value = true
  emit('busyChange', true)
  message.value = ''
  playerList.value = null
  refreshPending = false
  creatorId.value = null
  try {
    const response = await $supabase.functions.invoke('get-game-players', {
      body: {
        gameId: props.joinedGame.id,
      }
    })
    if (!active) return
    if (response.error) {
      const errorMessage = await getFunctionError(response.error, 'Что то пошло не так')
      if (!active) return
      if ('code' in errorMessage && 'gameId' in errorMessage && errorMessage.code === 'LOBBY_ACCESS_LOST' &&
        errorMessage.gameId === props.joinedGame.id) {
        emit('leaveRoom', 'Участник удален')
        return
      }
      message.value = errorMessage.message
      return
    }
    const data = response.data
    if (isGamePlayersResponse(data) && data.gameId === props.joinedGame?.id) {
      emit('occupiedSeatCountChange', data.players.length)
      emit('changeData', {
        seat_count: data['seat_count'],
        turnDurationMinutes: data['turnDurationMinutes']
      })
      creatorId.value = data.creator_id
      const userIsReady = data.players.find(el => el.user_id !== null && !el.is_bot && el.user_id ===
        props.profileId)
      if (userIsReady) {
        playerIsReady.value = userIsReady.isReady
        playerList.value = data.players
        if (data.gameId === pendingRemoveBotRequest.value?.gameId) {
          if (!data.players.find(elem => elem.seat_id === pendingRemoveBotRequest.value?.seat_id)) {
            pendingRemoveBotRequest.value = null
          }
        }

      } else {
        message.value = 'Что то пошло не так'
        playerIsReady.value = null
        return
      }
    } else {
      message.value = 'Что то пошло не так'
    }
  } catch {
    message.value = 'Что то пошло не так'
  } finally {
    isRefreshGame.value = false
    if (active) emit('busyChange', false)
    if (active && refreshPending) await refreshGame()
  }
}

const removeBot = async (seatId: string) => {
  message.value = ''
  if (props.joinedGame === null) {
    message.value = 'вы не присоединены ни к одной игре'
    return
  }
  const getButtonDisabled = playerRows.value.find(el => el.seat_id === seatId)
  if (isRemoveDisabled.value || getButtonDisabled === undefined || getButtonDisabled.buttonDisabled) return
  isCommandPending.value = true
  emit('busyChange', true)

  try {
    if (pendingRemoveBotRequest.value === null) {
      pendingRemoveBotRequest.value = {
        gameId: props.joinedGame.id,
        requestId: crypto.randomUUID(),
        seat_id: seatId
      }
    }
    const response = await $supabase.functions.invoke('remove-player', {
      body: pendingRemoveBotRequest.value
    })
    if (!active) return
    if (response.error) {
      const errorMessage = await getFunctionErrorMessage(response.error, 'Что то пошло не так')
      if (!active) return
      message.value = errorMessage
      return
    }
    const data = response.data

    if ((isResponseDeleteUser(data) && data.gameId === props.joinedGame?.id)) {
      pendingRemoveBotRequest.value = null
      refreshPending = true
      return
    }
    message.value = 'Что то пошло не так'


  } catch {
    message.value = 'Что то пошло не так'

  } finally {
    await finishCommand()
  }
}
const leaveGame = async () => {
  message.value = ''
  if (props.joinedGame === null) {
    message.value = 'вы не присоединены ни к одной игре'
    return
  }
  if (isLeaveDisabled.value) return
  isCommandPending.value = true
  emit('busyChange', true)

  try {
    if (pendingLeaveGameRequest.value === null) {
      pendingLeaveGameRequest.value = {
        gameId: props.joinedGame.id,
        requestId: crypto.randomUUID()
      }
    }
    const response = await $supabase.functions.invoke('leave-game', {
      body: pendingLeaveGameRequest.value
    })
    if (!active) return
    if (response.error) {
      const errorMessage = await getFunctionErrorMessage(response.error, 'Что то пошло не так')
      if (!active) return
      message.value = errorMessage
      return
    }
    const data = response.data

    if ((isResponseDeleteUser(data) && data.gameId === props.joinedGame?.id)) {
      pendingLeaveGameRequest.value = null
      refreshPending = false
      emit('leaveRoom', 'выход подтверждён')
      return
    }
    message.value = 'Что то пошло не так'


  } catch {
    message.value = 'Что то пошло не так'

  } finally {
    await finishCommand()
  }
}

const addBot = async () => {
  message.value = ''
  if (props.joinedGame === null) {
    message.value = 'вы не присоединены ни к одной игре'
    return
  }
  if (areSettingsDisabled.value) return

  isCommandPending.value = true
  emit('busyChange', true)

  try {
    if (pendingBotRequest === null) {
      pendingBotRequest = {
        gameId: props.joinedGame.id,
        requestId: crypto.randomUUID()
      }
    }
    const response = await $supabase.functions.invoke('add-bot', {
      body: pendingBotRequest
    })
    if (!active) return
    if (response.error) {
      const errorMessage = await getFunctionErrorMessage(response.error, 'Что то пошло не так')
      if (!active) return
      message.value = errorMessage
      return
    }
    const data = response.data

    if ((isAddBot(data) && data.gameId === props.joinedGame?.id)) {
      pendingBotRequest = null
      refreshPending = true
      return
    }
    message.value = 'Что то пошло не так'


  } catch {
    message.value = 'Что то пошло не так'

  } finally {
    await finishCommand()
  }
}
const editChangeSeatCount = async () => {
  message.value = ''
  if (!isSeatCount(changeSeatCount.value)) {
    message.value = 'выберете количество игроков'
    return
  }
  if (!isTurnDurationMinutes(turnDurationMinutes.value)) {
    message.value = 'Выберите длительность хода от 1 до 10 минут'
    return
  }
  if (props.joinedGame === null) {
    message.value = 'вы не присоединены ни к одной игре'
    return
  }
  if (areSettingsDisabled.value) return

  isCommandPending.value = true
  emit('busyChange', true)

  try {
    const response = await $supabase.functions.invoke('change-settings-game', {
      body: {
        gameId: props.joinedGame.id,
        seatCount: changeSeatCount.value,
        turnDurationMinutes: turnDurationMinutes.value,
      }
    })
    if (!active) return
    if (response.error) {
      const errorMessage = await getFunctionErrorMessage(response.error, 'Что то пошло не так')
      if (!active) return
      message.value = errorMessage
      return
    }
    const data = response.data
    if (isSettingsResult(data) && data.seat_count === changeSeatCount.value &&
      data.turnDurationMinutes === turnDurationMinutes.value) {
      emit('changeData', {
        seat_count: data['seat_count'],
        turnDurationMinutes: data['turnDurationMinutes']
      })

    } else {
      message.value = 'Что то пошло не так'
    }
  } catch {
    message.value = 'Что то пошло не так'

  } finally {
    await finishCommand()
  }
}
</script>

<template>
  <p v-if="message" role="alert">{{ message }}</p>
  <section v-if="joinedGame" aria-label="Лобби">
    <h2>Вы в комнате {{ joinedGame.display_name }}</h2>
    <section aria-label="Сведения о комнате">
      <p>Всего мест: {{ joinedGame.seat_count }}</p>
      <p>Занято: {{ joinedGame.occupiedSeatCount }}</p>
      <p>Свободно: {{ freeSeatCount }}</p>
      <p>Количество минут на ход игрока {{ joinedGame.turnDurationMinutes }}</p>
      <p>Пароль: {{ passwordLabel }}</p>
    </section>

    <section aria-label="Действия участника">
      <button type="button" :disabled="isReadyDisabled" @click="toggleReady">{{ readyButtonLabel }}</button>
      <p>{{ readinessLabel }}</p>
      <div v-if="hasPlayerList" role="group" aria-label="Состав комнаты">
        <p v-for="player of playerRows" :key="player.seat_id">
          <span>{{ player.display_name }}</span>
          <span>{{ player.readinessLabel }}</span>
          <span><button type="button"
                        :disabled="player.buttonDisabled"
                        @click="removeBot(player.seat_id)">
            Исключить</button></span>
        </p>
      </div>
      <button type="button" :disabled="isBusy" @click="refreshGame">
        {{ refreshLabel }}
      </button>
      <button type="button" :disabled="isLeaveDisabled" @click="leaveGame">
        Выйти из комнаты
      </button>
    </section>

    <section v-if="isCanEditLobby" aria-label="Управление лобби">
      <form aria-label="Настройки лобби" novalidate @submit.prevent="editChangeSeatCount">
        <div>
          <label for="lobby-seat-count">Количество игроков</label>
          <select id="lobby-seat-count" v-model="changeSeatCount" :disabled="areSettingsDisabled" required>
            <option :value="2">2 игрока</option>
            <option :value="3">3 игрока</option>
            <option :value="4">4 игрока</option>
          </select>
        </div>
        <div>
          <label for="lobby-turn-duration">Количество минут на ход игрока</label>
          <select id="lobby-turn-duration" v-model="turnDurationMinutes" :disabled="areSettingsDisabled">
            <option v-for="minutes in 10" :key="minutes" :value="minutes">{{ minutes }}</option>
          </select>
        </div>
        <button type="submit" :disabled="areSettingsDisabled">Изменить</button>
      </form>
      <button type="button" :disabled="areSettingsDisabled" @click="addBot">Добавить бота</button>
    </section>
  </section>
  <p>{{ isReadyToGame }}</p>
</template>
