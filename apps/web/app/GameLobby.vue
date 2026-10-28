<script setup lang="ts">
import {computed, ref} from 'vue'
import {useNuxtApp} from 'nuxt/app'

interface GameListItem {
  id: string
  seat_count: number
  occupiedSeatCount: number
  hasPassword: boolean
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
  seatCountChange: [value: number]
}>()

const isRefreshGame = ref(false)
const waiting = ref<boolean>(false)
const message = ref('')
const isChangeSeatCount = ref(false)
const playerList = ref<GamePlayer[] | null>(null)
const {$supabase} = useNuxtApp()
const playerIsReady = ref<boolean | null>(null)
const changeSeatCount = ref<number | null>(null)
const changeReady = computed(() => {
  if (playerIsReady.value === null) return true
  return !playerIsReady.value
})

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
    emit('busyChange', false)
    waiting.value = false
  }
}

const refreshGame = async () => {
  if (waiting.value) return
  if (props.joinedGame === null || isRefreshGame.value) return
  isRefreshGame.value = true
  emit('busyChange', true)
  message.value = ''
  playerList.value = null
  try {
    const response = await $supabase.functions.invoke('get-game-players', {
      body: {
        gameId: props.joinedGame.id,
      }
    })
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
    emit('busyChange', false)
  }
}

const editChangeSeatCount = async () => {
  message.value = ''
  if (changeSeatCount.value === null) {
    message.value = 'выберете количество игроков'
    return
  }
  if (props.joinedGame === null) {
    message.value = 'вы не присоединены ни к одной игре'
    return
  }
  if (isChangeSeatCount.value || waiting.value || isChangeSeatCount.value) return

  isChangeSeatCount.value = true
  waiting.value = true
  emit('busyChange', true)

  try {
    const response = await $supabase.functions.invoke('change-seat-count', {
      body: {
        gameId: props.joinedGame.id,
        seatCount: changeSeatCount.value,
      }
    })
    if (response.error) {
      message.value = 'Что то пошло не так'
      return
    }
    const data = response.data
    if (data !== null && typeof data === 'object' && !Array.isArray(data) && 'seat_count' in data &&
      data['seat_count'] === changeSeatCount.value) {
      emit('seatCountChange', data['seat_count'])
    } else {
      message.value = 'Что то пошло не так'
    }
  } catch {
    message.value = 'Что то пошло не так'

  } finally {
    isRefreshGame.value = false
    isChangeSeatCount.value = false
    waiting.value = false
    emit('busyChange', false)
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
      <p>изменить количество игроков</p>
      <select v-model="changeSeatCount" :disabled="waiting || isRefreshGame || isChangeSeatCount" required>
        <option :value="2">2 игрока</option>
        <option :value="3">3 игрока</option>
        <option :value="4">4 игрока</option>
      </select>
      <button type="button" :disabled="waiting || isRefreshGame || isChangeSeatCount" @click="editChangeSeatCount">
        Изменить
      </button>
    </div>

  </section>

</template>

