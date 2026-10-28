import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils'
import GameList from '../app/GameList.vue'

const api = vi.hoisted(() => ({invoke: vi.fn()}))
vi.mock('nuxt/app', () => ({useNuxtApp: () => ({$supabase: {functions: {invoke: api.invoke}}})}))
enableAutoUnmount(afterEach)

const room = {id: '11111111-1111-4111-8111-111111111111',
  seat_count: 3, occupiedSeatCount: 2, hasPassword: false}
const otherRoom = {...room, id: '22222222-2222-4222-8222-222222222222'}
const userId = '33333333-3333-4333-8333-333333333333'
type View = ReturnType<typeof mount>
const lobby = (view: View) => view.get('[aria-label="Лобби"]')
const save = (view: View) => lobby(view).findAll('button').find((button) => button.text() === 'Изменить')!
const card = (view: View, id = room.id) => view.get('article[aria-label="Комната ' + id + '"]')
const capacity = (view: View, value: number) => {
  expect(lobby(view).text()).toContain('Всего мест: ' + value)
  expect(card(view).text()).toContain('Всего мест: ' + value)
  expect(lobby(view).text()).toContain('Свободно: ' + (value - room.occupiedSeatCount))
  expect(card(view, otherRoom.id).text()).toContain('Всего мест: 3')
}

beforeEach(() => {
  vi.resetAllMocks()
  api.invoke.mockImplementation(async (name, options) => {
    if (name === 'game-list') return {data: [{...room}, {...otherRoom}], error: null}
    if (name === 'join-game') return {data: {...room, id: options.body.gameId}, error: null}
    if (name === 'change-seat-count') return {data: {seat_count: options.body.seatCount}, error: null}
    if (name === 'ready-to-game') return {data: {isReady: options.body.isReady}, error: null}
    if (name === 'get-game-players') return {data: {gameId: options.body.gameId,
      players: [{user_id: userId, isReady: true}]}, error: null}
    throw new Error('Unexpected function ' + name)
  })
})

async function openLobby() {
  const view = mount(GameList)
  await view.get('button').trigger('click')
  await flushPromises()
  await card(view).get('form').trigger('submit')
  await flushPromises()
  return view
}

describe('WEB-004: изменение вместимости через UI', () => {
  it.each([2, 3, 4])('сохраняет %i мест и обновляет лобби и карточку даже после обновления списка', async (seatCount) => {
    const view = await openLobby()
    // Replace list objects: success must not depend on shared references.
    await view.get('button').trigger('click')
    await flushPromises()
    await lobby(view).get('select').setValue(String(seatCount))
    capacity(view, 3)
    await save(view).trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('change-seat-count', {body: {gameId: room.id, seatCount}})
    capacity(view, seatCount)
    expect(lobby(view).get('select').element.value).toBe(String(seatCount))
    expect(view.find('[role="alert"]').exists()).toBe(false)
  })

  it('без выбора не отправляет запрос и не блокирует смену комнаты', async () => {
    const view = await openLobby()
    const calls = api.invoke.mock.calls.length
    await save(view).trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenCalledTimes(calls)
    expect(view.find('[role="alert"]').exists()).toBe(true)
    expect(card(view, otherRoom.id).get('button').attributes('disabled')).toBeUndefined()
    await card(view, otherRoom.id).get('form').trigger('submit')
    await flushPromises()
    expect(lobby(view).text()).toContain(otherRoom.id)
  })

  it('до ответа сохраняет прежнюю вместимость и блокирует выбор, действия и смену комнаты', async () => {
    const view = await openLobby()
    await lobby(view).get('select').setValue('4')
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await save(view).trigger('click')
    capacity(view, 3)
    expect(lobby(view).get('select').attributes('disabled')).toBeDefined()
    expect(lobby(view).findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
    expect(view.findAll('form button').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
    const calls = api.invoke.mock.calls.length
    for (const button of lobby(view).findAll('button')) await button.trigger('click')
    await card(view, otherRoom.id).get('form').trigger('submit')
    expect(api.invoke).toHaveBeenCalledTimes(calls)
    resolve({data: {seat_count: 4}, error: null})
    await flushPromises()
    capacity(view, 4)
    expect(lobby(view).get('select').attributes('disabled')).toBeUndefined()
    expect(lobby(view).findAll('button').every((button) => button.attributes('disabled') === undefined)).toBe(true)
    expect(view.findAll('form button').every((button) => button.attributes('disabled') === undefined)).toBe(true)
  })

  it.each(['ready-to-game', 'get-game-players'])('не позволяет менять вместимость во время %s', async (operation) => {
    const view = await openLobby()
    await lobby(view).get('select').setValue('4')
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await lobby(view).findAll('button')[operation === 'ready-to-game' ? 0 : 1]!.trigger('click')
    expect(save(view).attributes('disabled')).toBeDefined()
    expect(lobby(view).get('select').attributes('disabled')).toBeDefined()
    const calls = api.invoke.mock.calls.length
    await save(view).trigger('click')
    expect(api.invoke).toHaveBeenCalledTimes(calls)
    resolve({data: operation === 'ready-to-game' ? {isReady: true} : {gameId: room.id, players: []}, error: null})
    await flushPromises()
    expect(save(view).attributes('disabled')).toBeUndefined()
    await save(view).trigger('click')
    await flushPromises()
    capacity(view, 4)
  })

  it.each(['response', 'exception'])('при отказе %s сохраняет выбор и прежнюю вместимость, разрешает повтор', async (kind) => {
    const view = await openLobby()
    await lobby(view).get('select').setValue('4')
    if (kind === 'response') api.invoke.mockResolvedValueOnce({data: {seat_count: 4}, error: new Error('Private diagnostic')})
    else api.invoke.mockRejectedValueOnce(new Error('Private diagnostic'))
    await save(view).trigger('click')
    await flushPromises()
    capacity(view, 3)
    expect(lobby(view).get('select').element.value).toBe('4')
    expect(view.find('[role="alert"]').exists()).toBe(true)
    expect(view.text()).not.toContain('Private diagnostic')
    expect(save(view).attributes('disabled')).toBeUndefined()
    expect(card(view, otherRoom.id).get('button').attributes('disabled')).toBeUndefined()
    await save(view).trigger('click')
    await flushPromises()
    capacity(view, 4)
    expect(view.find('[role="alert"]').exists()).toBe(false)
  })

  it.each([null, [], {}, true, {seat_count: '4'}, {seat_count: 2}, {seat_count: null}])(
    'не подтверждает неверный или несовпадающий ответ %j', async (data) => {
      const view = await openLobby()
      await lobby(view).get('select').setValue('4')
      api.invoke.mockResolvedValueOnce({data, error: null})
      await save(view).trigger('click')
      await flushPromises()
      capacity(view, 3)
      expect(view.find('[role="alert"]').exists()).toBe(true)
      expect(lobby(view).get('select').element.value).toBe('4')
      expect(save(view).attributes('disabled')).toBeUndefined()
    },
  )

  it('успех сохраняет готовность и состав без пересоздания лобби', async () => {
    const view = await openLobby()
    await lobby(view).get('button').trigger('click')
    await flushPromises()
    await lobby(view).findAll('button')[1]!.trigger('click')
    await flushPromises()
    await lobby(view).get('select').setValue('4')
    await save(view).trigger('click')
    await flushPromises()
    expect(lobby(view).get('button').text()).toBe('Снять готовность')
    expect(lobby(view).text()).toContain(userId)
    expect(lobby(view).get('select').element.value).toBe('4')
    capacity(view, 4)
  })

  it('новая комната не наследует выбранную или подтверждённую вместимость предыдущей', async () => {
    const view = await openLobby()
    await lobby(view).get('select').setValue('4')
    await save(view).trigger('click')
    await flushPromises()
    await card(view, otherRoom.id).get('form').trigger('submit')
    await flushPromises()
    expect(lobby(view).text()).toContain(otherRoom.id)
    expect(lobby(view).text()).toContain('Всего мест: 3')
    const calls = api.invoke.mock.calls.length
    await save(view).trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenCalledTimes(calls)
    expect(view.find('[role="alert"]').exists()).toBe(true)
  })
})
