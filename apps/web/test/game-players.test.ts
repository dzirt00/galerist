import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils'
import GameList from '../app/GameList.vue'

const api = vi.hoisted(() => ({invoke: vi.fn()}))
vi.mock('nuxt/app', () => ({
  useNuxtApp: () => ({$supabase: {functions: {invoke: api.invoke}}}),
}))
enableAutoUnmount(afterEach)

const room = {id: '11111111-1111-4111-8111-111111111111',
  seat_count: 3, occupiedSeatCount: 2, hasPassword: false}
const otherRoom = {...room, id: '22222222-2222-4222-8222-222222222222'}
const firstUser = '33333333-3333-4333-8333-333333333333'
const secondUser = '44444444-4444-4444-8444-444444444444'
const players = [{user_id: firstUser, isReady: true}, {user_id: secondUser, isReady: false}]
const roster = {gameId: room.id, players}
const lobbySelector = '[aria-label="Лобби"]'
type View = ReturnType<typeof mount>
const refreshButton = (wrapper: View) => wrapper.get(lobbySelector).findAll('button')[1]!
const readyButton = (wrapper: View) => wrapper.get(lobbySelector).get('button')
const playerRows = (wrapper: View) => wrapper.get(lobbySelector).findAll('p').filter((row) => row.find('span').exists())

beforeEach(() => {
  vi.resetAllMocks()
  api.invoke.mockImplementation(async (name, options) => {
    if (name === 'game-list') return {data: [room, otherRoom], error: null}
    if (name === 'join-game') return {data: {...room, id: options.body.gameId}, error: null}
    if (name === 'get-game-players') return {data: {...roster, gameId: options.body.gameId}, error: null}
    if (name === 'ready-to-game') return {data: {isReady: options.body.isReady}, error: null}
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

describe('WEB-004: чтение состава лобби', () => {
  it('загружает состав выбранной комнаты по кнопке и показывает готовность каждого', async () => {
    const wrapper = await openLobby()
    expect(playerRows(wrapper)).toHaveLength(0)
    expect(api.invoke.mock.calls.some(([name]) => name === 'get-game-players')).toBe(false)
    await refreshButton(wrapper).trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('get-game-players', {body: {gameId: room.id}})
    expect(playerRows(wrapper).map((row) => row.findAll('span').map((span) => span.text())))
      .toEqual([[firstUser, 'готов'], [secondUser, 'не готов']])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('при новом чтении заменяет состав и сохранённые готовности', async () => {
    const wrapper = await openLobby()
    await refreshButton(wrapper).trigger('click')
    await flushPromises()
    api.invoke.mockResolvedValueOnce({data: {gameId: room.id,
      players: [{user_id: firstUser, isReady: false}]}, error: null})
    await refreshButton(wrapper).trigger('click')
    await flushPromises()
    expect(playerRows(wrapper)).toHaveLength(1)
    expect(playerRows(wrapper)[0]!.findAll('span').map((span) => span.text())).toEqual([firstUser, 'не готов'])
    expect(wrapper.get(lobbySelector).text()).not.toContain(secondUser)
  })

  it('скрывает прежний состав до ответа и блокирует повтор, готовность и смену комнаты', async () => {
    const wrapper = await openLobby()
    await refreshButton(wrapper).trigger('click')
    await flushPromises()
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await refreshButton(wrapper).trigger('click')
    expect(playerRows(wrapper)).toHaveLength(0)
    expect(refreshButton(wrapper).text()).toBe('Загружаем состав…')
    expect(refreshButton(wrapper).attributes('disabled')).toBeDefined()
    expect(readyButton(wrapper).attributes('disabled')).toBeDefined()
    expect(readyButton(wrapper).text()).not.toBe('Сохраняем…')
    expect(wrapper.findAll('form button').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
    const callCount = api.invoke.mock.calls.length
    await refreshButton(wrapper).trigger('click')
    await readyButton(wrapper).trigger('click')
    await wrapper.findAll('form')[1]!.trigger('submit')
    expect(api.invoke).toHaveBeenCalledTimes(callCount)
    resolve({data: roster, error: null})
    await flushPromises()
    expect(playerRows(wrapper)).toHaveLength(2)
    expect(refreshButton(wrapper).attributes('disabled')).toBeUndefined()
    expect(readyButton(wrapper).attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('form button').every((button) => button.attributes('disabled') === undefined)).toBe(true)
  })

  it('блокирует чтение во время сохранения готовности', async () => {
    const wrapper = await openLobby()
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await readyButton(wrapper).trigger('click')
    expect(refreshButton(wrapper).attributes('disabled')).toBeDefined()
    const callCount = api.invoke.mock.calls.length
    await refreshButton(wrapper).trigger('click')
    expect(api.invoke).toHaveBeenCalledTimes(callCount)
    resolve({data: {isReady: true}, error: null})
    await flushPromises()
    expect(refreshButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it.each(['response', 'exception'])('после отказа %s скрывает прежний состав и позволяет повтор', async (kind) => {
    const wrapper = await openLobby()
    await refreshButton(wrapper).trigger('click')
    await flushPromises()
    if (kind === 'response') api.invoke.mockResolvedValueOnce({data: roster, error: new Error('Private diagnostic')})
    else api.invoke.mockRejectedValueOnce(new Error('Private diagnostic'))
    await refreshButton(wrapper).trigger('click')
    await flushPromises()
    expect(playerRows(wrapper)).toHaveLength(0)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Private diagnostic')
    expect(refreshButton(wrapper).attributes('disabled')).toBeUndefined()
    await refreshButton(wrapper).trigger('click')
    await flushPromises()
    expect(playerRows(wrapper)).toHaveLength(2)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it.each([null, [], true, {}, {players}, {gameId: otherRoom.id, players},
    {gameId: room.id, players: null}, {gameId: room.id, players: [null]},
    {gameId: room.id, players: [7]}, {gameId: room.id, players: [[]]},
    {gameId: room.id, players: [{user_id: '', isReady: true}]},
    {gameId: room.id, players: [{user_id: firstUser, isReady: 'true'}]},
    {gameId: room.id, players: [players[0], {user_id: secondUser}]}])(
    'отклоняет неверный DTO целиком: %j', async (data) => {
      const wrapper = await openLobby()
      await refreshButton(wrapper).trigger('click')
      await flushPromises()
      api.invoke.mockResolvedValueOnce({data, error: null})
      await refreshButton(wrapper).trigger('click')
      await flushPromises()
      expect(playerRows(wrapper)).toHaveLength(0)
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      expect(refreshButton(wrapper).attributes('disabled')).toBeUndefined()
      await refreshButton(wrapper).trigger('click')
      await flushPromises()
      expect(playerRows(wrapper)).toHaveLength(2)
    },
  )

  it('сбрасывает состав при новом присоединении и читает уже новую комнату', async () => {
    const wrapper = await openLobby()
    await refreshButton(wrapper).trigger('click')
    await flushPromises()
    expect(playerRows(wrapper)).toHaveLength(2)
    await wrapper.findAll('form')[1]!.trigger('submit')
    await flushPromises()
    expect(wrapper.get(lobbySelector).text()).toContain(otherRoom.id)
    expect(playerRows(wrapper)).toHaveLength(0)
    await refreshButton(wrapper).trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('get-game-players', {body: {gameId: otherRoom.id}})
    expect(playerRows(wrapper)).toHaveLength(2)
  })
})
