import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import GameList from '../app/GameList.vue'

const api = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('nuxt/app', () => ({
  useNuxtApp: () => ({ $supabase: { functions: { invoke: api.invoke } } }),
}))
enableAutoUnmount(afterEach)

const room = { id: '11111111-1111-4111-8111-111111111111',
  seat_count: 3, occupiedSeatCount: 1, hasPassword: false }
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

async function openLobby() {
  const wrapper = mount(GameList)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  await wrapper.findAll('form')[0]!.trigger('submit')
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
    expect(wrapper.findAll('form button').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
    const callCount = api.invoke.mock.calls.length
    await lobby.get('button').trigger('click')
    await wrapper.findAll('form')[1]!.trigger('submit')
    expect(api.invoke).toHaveBeenCalledTimes(callCount)
    expect(lobby.text()).toContain(room.id)
    resolve({ data: { isReady: true }, error: null })
    await flushPromises()
    expect(lobby.findAll('p').map((row) => row.text())).toContain('Готов')
    expect(lobby.get('button').attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('form button').every((button) => button.attributes('disabled') === undefined)).toBe(true)
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

  it('после смены комнаты сбрасывает готовность и использует новый gameId', async () => {
    const wrapper = await openLobby()
    await wrapper.get(lobbySelector).get('button').trigger('click')
    await flushPromises()
    await wrapper.findAll('form')[1]!.trigger('submit')
    await flushPromises()
    const lobby = wrapper.get(lobbySelector)
    expect(lobby.text()).toContain(other.id)
    expect(lobby.text()).toContain('Готовность неизвестна')
    expect(lobby.get('button').text()).toBe('Подтвердить готовность')
    await lobby.get('button').trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('ready-to-game', {
      body: { gameId: other.id, isReady: true },
    })
  })
})
