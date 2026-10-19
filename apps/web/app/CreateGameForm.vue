<script lang="ts" setup>
import {ref} from 'vue'

const MIN_LENGTH_PASSWORD = 8
const countPlayers = ref<number | null>(null)
const password = ref<string | null>(null)
const message = ref<string>('')
const createGame = () => {
  message.value = ''
  const countPlayer = (
    countPlayers.value !== null
    && Number.isSafeInteger(countPlayers.value)
    && countPlayers.value >= 2
    && countPlayers.value <= 4)
    ? countPlayers.value
    : null

  if (countPlayer == null) {
    message.value = 'Укажите число игроков'
    return
  }
  if (password.value !== null && password.value !== '' && password.value.length < MIN_LENGTH_PASSWORD) {
    message.value = 'Минимальное количество символов пароля 8'
    return
  }

  message.value = 'Данные формы проверены'
}
</script>
<template>
  <form @submit.prevent="createGame()">
    <div>
      <label for="countPlayers">Количество игроков от 2 до 4</label>
      <input
        type="number"
        id="countPlayers"
        min="2"
        max="4"
        maxlength="1"
        v-model="countPlayers"
        required
      >
    </div>
    <div>
      <label for="password">Пароль (Необязательно)</label>
      <input
        id="password"
        type="password"
        v-model="password"
        min="8"
      >
    </div>
    <button
      type="submit"
    >
      Создать комнату
    </button>
  </form>
  <p>{{ message }}</p>
</template>
