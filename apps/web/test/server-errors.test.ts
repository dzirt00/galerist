import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils'
import {passiveRealtime} from './helpers/passive-realtime'
import GameLobby from '../app/GameLobby.vue'
import GameList from '../app/GameList.vue'
import CreateGameForm from '../app/CreateGameForm.vue'

const api = vi.hoisted(() => ({invoke: vi.fn()}))
vi.mock('nuxt/app', () => ({useNuxtApp: () => ({$supabase: {...passiveRealtime, functions: {invoke: api.invoke}}})}))
enableAutoUnmount(afterEach)
const room = {id: '11111111-1111-4111-8111-111111111111', seat_count: 3,
  occupiedSeatCount: 1, hasPassword: false, turnDurationMinutes: 3}
const serverMessage = 'Новая формулировка сервера <b>без HTML</b>'
beforeEach(() => {
  vi.resetAllMocks()
  api.invoke.mockImplementation(async () => ({
    data: null, error: {context: Response.json({error: serverMessage}, {status: 400})},
  }))
})

it.each(['ready-to-game', 'get-game-players', 'change-settings-game'])('лобби показывает текст %s без клиентской таблицы', async (name) => {
  const wrapper = mount(GameLobby, {props: {joinedGame: room}})
  const label = name === 'ready-to-game' ? 'Подтвердить готовность' : name === 'get-game-players' ? 'Обновить' : 'Изменить'
  await wrapper.findAll('button').find(button => button.text() === label)!.trigger('click')
  await flushPromises()
  expect(api.invoke.mock.calls[0][0]).toBe(name)
  expect(wrapper.get('[role="alert"]').text()).toBe(serverMessage)
  expect(wrapper.find('b').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('Сохраняем…')
})

it('список показывает подготовленную сервером ошибку чтения', async () => {
  const wrapper = mount(GameList)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe(serverMessage)
  expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
})

it.each(['create-game', 'join-game'])('%s показывает текст ошибки без известного code', async (name) => {
  if (name === 'create-game') {
    const wrapper = mount(CreateGameForm)
    await wrapper.get('input[type="number"]').setValue('3')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain(serverMessage)
    expect(wrapper.emitted('gameCreated')).toBeUndefined()
    expect(wrapper.find('b').exists()).toBe(false)
  } else {
    api.invoke.mockResolvedValueOnce({data: [room], error: null})
    const wrapper = mount(GameList)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe(serverMessage)
    expect(wrapper.find('[aria-label="Лобби"]').exists()).toBe(false)
  }
})
