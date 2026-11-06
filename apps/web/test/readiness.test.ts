import {passiveRealtime} from './helpers/passive-realtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import App from '../app/app.vue'

const api = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('nuxt/app', () => ({
  useNuxtApp: () => ({ $supabase: {...passiveRealtime, functions: { invoke: api.invoke } } }),
}))
vi.mock('../app/composable/auth', async () => {
  const {ref} = await import('vue')
  return {useProfile: () => ({
    profile: ref({id: '11111111-1111-4111-8111-111111111111'}),
    isLoadingProfile: ref(false), hasProfileError: ref(false), profileMessage: ref(''), loadProfile: vi.fn(),
  })}
})
enableAutoUnmount(afterEach)

const room = { id: '11111111-1111-4111-8111-111111111111',
  seat_count: 3, occupiedSeatCount: 1, hasPassword: false, turnDurationMinutes: 3 }
const other = { ...room, id: '22222222-2222-4222-8222-222222222222' }
const lobbySelector = '[aria-label="Лобби"]'

beforeEach(() => {
  vi.resetAllMocks()
  api.invoke.mockImplementation(async (name, options) => {
    if (name === 'game-list') return { data: [room, other], error: null }
    if (name === 'join-game') return { data: { ...room, id: options.body.gameId }, error: null }
    if (name === 'ready-to-game') return { data: { isReady: options.body.isReady }, error: null }
    throw new Error('Unexpected function ' + name)
  })
})

async function openLobby(index = 0) {
  const wrapper = mount(App)
  await flushPromises()
  await wrapper.findAll('form')[index]!.trigger('submit')
  await flushPromises()
  return wrapper
}

describe('WEB-004: подтверждённая готовность участника', () => {
  it('начинает с неизвестной готовности, отправляет true, затем false', async () => {
    const wrapper = await openLobby()
    const lobby = wrapper.get(lobbySelector)
    expect(lobby.get('button').text()).toBe('Подтвердить готовность')
    expect(lobby.text()).toContain('Готовность неизвестна')
    await lobby.get('button').trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('ready-to-game', {
      body: { gameId: room.id, isReady: true },
    })
    expect(lobby.findAll('p').map((row) => row.text())).toContain('Готов')
    expect(lobby.get('button').text()).toBe('Снять готовность')
    await lobby.get('button').trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('ready-to-game', {
      body: { gameId: room.id, isReady: false },
    })
    expect(lobby.findAll('p').map((row) => row.text())).toContain('Не готов')
    expect(lobby.get('button').text()).toBe('Подтвердить готовность')
  })

  it('ждёт подтверждения, блокирует повтор и переход в другую комнату', async () => {
    const wrapper = await openLobby()
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const lobby = wrapper.get(lobbySelector)
    await lobby.get('button').trigger('click')
    expect(lobby.get('button').text()).toBe('Сохраняем…')
    expect(lobby.text()).toContain('Готовность неизвестна')
    expect(lobby.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('article').exists()).toBe(false)
    const callCount = api.invoke.mock.calls.length
    await lobby.get('button').trigger('click')
    expect(api.invoke).toHaveBeenCalledTimes(callCount)
    expect(lobby.text()).toContain(room.id)
    resolve({ data: { isReady: true }, error: null })
    await flushPromises()
    expect(lobby.findAll('p').map((row) => row.text())).toContain('Готов')
    expect(lobby.get('button').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('article').exists()).toBe(false)
  })

  it.each(['response', 'exception'])('сохраняет готовность при ошибке %s и позволяет повтор', async (kind) => {
    const wrapper = await openLobby()
    const lobby = wrapper.get(lobbySelector)
    await lobby.get('button').trigger('click')
    await flushPromises()
    if (kind === 'response') api.invoke.mockResolvedValueOnce({ data: null, error: new Error('Private diagnostic') })
    else api.invoke.mockRejectedValueOnce(new Error('Private diagnostic'))
    await lobby.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Что то пошло не так')
    expect(wrapper.text()).not.toContain('Private diagnostic')
    expect(lobby.findAll('p').map((row) => row.text())).toContain('Готов')
    expect(lobby.get('button').attributes('disabled')).toBeUndefined()
    await lobby.get('button').trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('ready-to-game', {
      body: { gameId: room.id, isReady: false },
    })
    expect(lobby.findAll('p').map((row) => row.text())).toContain('Не готов')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it.each([null, [], {}, true, { isReady: 'true' }, { isReady: false }])(
    'не подтверждает неверный или несовпадающий ответ %j', async (data) => {
      const wrapper = await openLobby()
      api.invoke.mockResolvedValueOnce({ data, error: null })
      const lobby = wrapper.get(lobbySelector)
      await lobby.get('button').trigger('click')
      await flushPromises()
      expect(lobby.text()).toContain('Готовность неизвестна')
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      expect(lobby.get('button').attributes('disabled')).toBeUndefined()
      await lobby.get('button').trigger('click')
      await flushPromises()
      expect(lobby.findAll('p').map((row) => row.text())).toContain('Готов')
    },
  )

  it('новое открытие не наследует готовность прежней комнаты', async () => {
    const previous = await openLobby()
    await previous.get(lobbySelector).get('button').trigger('click')
    await flushPromises()
    previous.unmount()
    const wrapper = await openLobby(1)
    const lobby = wrapper.get(lobbySelector)
    expect(lobby.text()).toContain(other.id)
    expect(lobby.text()).toContain('Готовность неизвестна')
    await lobby.get('button').trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('ready-to-game', {body: {gameId: other.id, isReady: true}})
  })
})
