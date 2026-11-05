<script setup lang="ts">
import {computed, onUnmounted, ref} from 'vue'
import {useNuxtApp} from 'nuxt/app'
import type {GameListItem} from './types/lobby'
import {isGamePlayersResponse, isReadyResult, isSettingsResult, isSeatCount, isTurnDurationMinutes} from './utils/lobby-validation'
import {getFunctionErrorMessage} from './utils/api-errors'


interface ChangeData {
  seat_count: number
  turnDurationMinutes: number
}

interface GamePlayer {
  isReady: boolean,
  user_id: string
}

const props = defineProps<{ joinedGame: GameListItem | null }>()
const emit = defineEmits<{
  busyChange: [value: boolean]
  changeData: [value: ChangeData]
  occupiedSeatCountChange: [value: number]
}>()
let active = true
let refreshPending = false
onUnmounted(() => {
  active = false
})

const isRefreshGame = ref(false)
const waiting = ref<boolean>(false)
const message = ref('')
const isChangeSeatCount = ref(false)
const playerList = ref<GamePlayer[] | null>(null)
const {$supabase} = useNuxtApp()
const playerIsReady = ref<boolean | null>(null)
const changeSeatCount = ref<number | null>(props.joinedGame?.seat_count ?? null)
const turnDurationMinutes = ref<number | null>(props.joinedGame?.turnDurationMinutes ?? null)
const changeReady = computed(() => playerIsReady.value !== true)
const isBusy = computed(() => waiting.value || isRefreshGame.value)
const areSettingsDisabled = computed(() => isBusy.value || isChangeSeatCount.value)
const freeSeatCount = computed(() => props.joinedGame
  ? props.joinedGame.seat_count - props.joinedGame.occupiedSeatCount
  : 0)
const passwordLabel = computed(() => props.joinedGame?.hasPassword ? 'требуется' : 'не требуется')
const readyButtonLabel = computed(() => waiting.value ? 'Сохраняем…'
  : changeReady.value ? 'Подтвердить готовность' : 'Снять готовность')
const readinessLabel = computed(() => playerIsReady.value === null ? 'Готовность неизвестна'
  : playerIsReady.value ? 'Готов' : 'Не готов')
const refreshLabel = computed(() => isRefreshGame.value ? 'Загружаем состав…' : 'Обновить')
const hasPlayerList = computed(() => playerList.value !== null)
const playerRows = computed(() => (playerList.value ?? []).map(player => ({
  ...player, readinessLabel: player.isReady ? 'готов' : 'не готов',
})))
const toggleReady = () => isReady(changeReady.value)

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

const isReady = async (value: boolean) => {
  if (isBusy.value || props.joinedGame === null) return
  waiting.value = true
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
    waiting.value = false
    if (active) emit('busyChange', false)
    if (active && refreshPending) await refreshGame()
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
  try {
    const response = await $supabase.functions.invoke('get-game-players', {
      body: {
        gameId: props.joinedGame.id,
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
    if (isGamePlayersResponse(data) && data.gameId === props.joinedGame?.id) {
      playerList.value = data.players
      emit('occupiedSeatCountChange', data.players.length)
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

  isChangeSeatCount.value = true
  waiting.value = true
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
    isRefreshGame.value = false
    isChangeSeatCount.value = false
    waiting.value = false
    if (active) emit('busyChange', false)
    if (active && refreshPending) await refreshGame()
  }
}
</script>

<template>
  <p v-if="message" role="alert">{{ message }}</p>
  <section v-if="joinedGame" aria-label="Лобби">
    <h2>Вы в комнате {{ joinedGame.id }}</h2>
    <p>Всего мест: {{ joinedGame.seat_count }}</p>
    <p>Занято: {{ joinedGame.occupiedSeatCount }}</p>
    <p>Свободно: {{ freeSeatCount }}</p>
    <p>Количество минут на ход игрока {{ joinedGame.turnDurationMinutes }}</p>
    <p>Пароль: {{ passwordLabel }}</p>
    <button type="button" :disabled="isBusy" @click="toggleReady">{{ readyButtonLabel }}</button>
    <p>{{ readinessLabel }}</p>

    <div v-if="hasPlayerList">
      <p v-for="el of playerRows" :key="el.user_id">
        <span>{{ el.user_id }}</span>
        <span>{{ el.readinessLabel }}</span>
      </p>
    </div>
    <button
      type="button"
      :disabled="isBusy"
      @click="refreshGame"
    >
      {{ refreshLabel }}
    </button>
    <div>
      <label for="lobby-seat-count">Количество игроков</label>
      <select
        id="lobby-seat-count"
        v-model="changeSeatCount"
        :disabled="areSettingsDisabled"
        required
      >
        <option :value="2">2 игрока</option>
        <option :value="3">3 игрока</option>
        <option :value="4">4 игрока</option>
      </select>
    </div>
    <div>
      <label for="lobby-turn-duration">Количество минут на ход игрока</label>
      <select
        id="lobby-turn-duration"
        v-model="turnDurationMinutes"
        :disabled="areSettingsDisabled"
      >
        <option v-for="minutes in 10" :key="minutes" :value="minutes">{{ minutes }}</option>
      </select>
    </div>
    <button type="button" :disabled="areSettingsDisabled" @click="editChangeSeatCount">
      Изменить
    </button>
  </section>

</template>

