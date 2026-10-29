<script setup lang="ts">
import {computed, onUnmounted, ref} from 'vue'
import {useNuxtApp} from 'nuxt/app'
import type {GameListItem} from './types/lobby'


interface ChangeData {
  seat_count: number
  turnDurationMinutes: number
}

interface GamePlayer {
  isReady: boolean,
  user_id: string
}

interface GamePlayersResponse {
  gameId: string
  players: GamePlayer[]
}

function isGamePlayersResponse(value: unknown): value is GamePlayersResponse {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'gameId' in value &&
    props.joinedGame !== null &&
    value.gameId === props.joinedGame.id &&
    'players' in value &&
    Array.isArray(value.players) &&
    value.players.every((el: unknown) => typeof el === 'object' && el !== null && !Array.isArray(el) &&
      'isReady' in
      el && 'user_id' in el && typeof el.user_id === 'string' && typeof el.isReady === 'boolean' && el.user_id.length > 0)
}

const props = defineProps<{ joinedGame: GameListItem | null }>()
const emit = defineEmits<{
  busyChange: [value: boolean]
  changeData: [value: ChangeData]
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
const changeReady = computed(() => {
  if (playerIsReady.value === null) return true
  return !playerIsReady.value
})
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
  if (waiting.value || props.joinedGame === null || isRefreshGame.value) return
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
      message.value = 'Что то пошло не так'
      return
    }
    if (typeof response.data === 'object' &&
      response.data !== null &&
      !Array.isArray(response.data) &&
      'isReady' in response.data &&
      typeof response.data.isReady === 'boolean'
      && response.data.isReady === value
    ) {
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

  if (waiting.value || isRefreshGame.value) {
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
      message.value = 'Что то пошло не так'
      return
    }
    const data = response.data
    if (isGamePlayersResponse(data)) {
      playerList.value = data.players
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
  if (typeof changeSeatCount.value !== 'number' || ![2, 3, 4].includes(changeSeatCount.value)) {
    message.value = 'выберете количество игроков'
    return
  }
  if (typeof turnDurationMinutes.value !== 'number' || !Number.isSafeInteger(turnDurationMinutes.value)
    || turnDurationMinutes.value < 1 || turnDurationMinutes.value > 10) {
    message.value = 'Выберите длительность хода от 1 до 10 минут'
    return
  }
  if (props.joinedGame === null) {
    message.value = 'вы не присоединены ни к одной игре'
    return
  }
  if (isChangeSeatCount.value || waiting.value || isRefreshGame.value) return

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
      message.value = 'Что то пошло не так'
      return
    }
    const data = response.data
    if (data !== null && typeof data === 'object' && !Array.isArray(data) && 'seat_count' in data &&
      data['seat_count'] === changeSeatCount.value && 'turnDurationMinutes' in data &&
      data['turnDurationMinutes'] === turnDurationMinutes.value) {
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
    <p>Свободно: {{ joinedGame.seat_count - joinedGame.occupiedSeatCount }}</p>
    <p>Количество минут на ход игрока {{ joinedGame.turnDurationMinutes }}</p>
    <p>Пароль: {{ joinedGame.hasPassword ? 'требуется' : 'не требуется' }}</p>
    <button type="button" :disabled="waiting || isRefreshGame" @click="isReady(changeReady)">{{
        waiting ? 'Сохраняем…' : changeReady ? 'Подтвердить готовность' : 'Снять готовность'
      }}
    </button>
    <p>{{ playerIsReady === null ? 'Готовность неизвестна' : playerIsReady ? 'Готов' : 'Не готов' }}</p>

    <div v-if="playerList !== null">
      <p v-for="el of playerList" :key="el.user_id">
        <span>{{ el.user_id }}</span>
        <span>{{ el.isReady ? 'готов' : 'не готов' }}</span>
      </p>
    </div>
    <button
      type="button"
      :disabled="isRefreshGame || waiting" @click="refreshGame"
    >
      {{ isRefreshGame ? 'Загружаем состав…' : 'Обновить' }}
    </button>
    <div>
      <label for="lobby-seat-count">Количество игроков</label>
      <select id="lobby-seat-count" v-model="changeSeatCount" :disabled="waiting || isRefreshGame || isChangeSeatCount"
              required>
        <option :value="2">2 игрока</option>
        <option :value="3">3 игрока</option>
        <option :value="4">4 игрока</option>
      </select>
    </div>
    <div>
      <label for="lobby-turn-duration">Количество минут на ход игрока</label>
      <select id="lobby-turn-duration" v-model="turnDurationMinutes"
              :disabled="waiting || isRefreshGame || isChangeSeatCount">
        <template v-for="i in 10" :key="i">
          <option :value="i">{{ i }}</option>
        </template>
      </select>
    </div>
    <button type="button" :disabled="waiting || isRefreshGame || isChangeSeatCount" @click="editChangeSeatCount">
      Изменить
    </button>
  </section>

</template>

