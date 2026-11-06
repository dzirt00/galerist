import {passiveRealtime} from './helpers/passive-realtime'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils'
import App from '../app/app.vue'

const api = vi.hoisted(() => ({invoke: vi.fn()}))
vi.mock('nuxt/app', () => ({useNuxtApp: () => ({$supabase: {...passiveRealtime,functions: {invoke: api.invoke}}})}))
vi.mock('../app/composable/auth', async () => {
  const {ref} = await import('vue')
  return {useProfile: () => ({
    profile: ref({id: '11111111-1111-4111-8111-111111111111'}),
    isLoadingProfile: ref(false), hasProfileError: ref(false), profileMessage: ref(''), loadProfile: vi.fn(),
  })}
})
enableAutoUnmount(afterEach)

const room = {id: '11111111-1111-4111-8111-111111111111',
  seat_count: 3, occupiedSeatCount: 2, hasPassword: false, turnDurationMinutes: 3}
const otherRoom = {...room, id: '22222222-2222-4222-8222-222222222222'}
const userId = '33333333-3333-4333-8333-333333333333'
type View = ReturnType<typeof mount>
const lobby = (view: View) => view.get('[aria-label="Лобби"]')
const save = (view: View) => lobby(view).findAll('button').find((button) => button.text() === 'Изменить')!
const card = (view: View, id = room.id) => view.get('article[aria-label="Комната ' + id + '"]')
const capacity = (view: View, value: number, occupiedSeatCount = room.occupiedSeatCount) => {
  expect(lobby(view).text()).toContain('Всего мест: ' + value)
  expect(lobby(view).text()).toContain('Свободно: ' + (value - occupiedSeatCount))
  expect(view.find('article').exists()).toBe(false)
}

beforeEach(() => {
  vi.resetAllMocks()
  api.invoke.mockImplementation(async (name, options) => {
    if (name === 'game-list') return {data: [{...room}, {...otherRoom}], error: null}
    if (name === 'join-game') return {data: {...room, id: options.body.gameId}, error: null}
    if (name === 'change-settings-game') return {data: {seat_count: options.body.seatCount, turnDurationMinutes: options.body.turnDurationMinutes}, error: null}
    if (name === 'ready-to-game') return {data: {isReady: options.body.isReady}, error: null}
    if (name === 'get-game-players') return {data: {gameId: options.body.gameId,
      players: [{user_id: userId, isReady: true}]}, error: null}
    throw new Error('Unexpected function ' + name)
  })
})

async function openLobby(selectedId = room.id) {
  const view = mount(App)
  await flushPromises()
  await card(view, selectedId).get('form').trigger('submit')
  await flushPromises()
  return view
}

describe('WEB-004: изменение вместимости через UI', () => {
  it.each([1, 7, 10])('меняет только таймер на %i минут и показывает подтверждение в отдельном лобби', async (minutes) => {
    const view = await openLobby()
    expect(lobby(view).text()).toContain('Количество минут на ход игрока 3')
    await lobby(view).get('#lobby-turn-duration').setValue(String(minutes))
    expect(lobby(view).text()).toContain('Количество минут на ход игрока 3')
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await save(view).trigger('click')
    expect(api.invoke).toHaveBeenLastCalledWith('change-settings-game', {
      body: {gameId: room.id, seatCount: 3, turnDurationMinutes: minutes},
    })
    expect(lobby(view).text()).toContain('Количество минут на ход игрока 3')
    expect(lobby(view).get('#lobby-turn-duration').attributes('disabled')).toBeDefined()
    expect(view.get('button').attributes('disabled')).toBeDefined()
    resolve({data: {seat_count: 3, turnDurationMinutes: minutes}, error: null})
    await flushPromises()
    expect(lobby(view).text()).toContain('Количество минут на ход игрока ' + minutes)
    expect(view.find('article').exists()).toBe(false)
  })

  it('отказ сохраняет подтверждённые настройки и выбор для повтора', async () => {
    const view = await openLobby()
    await lobby(view).get('#lobby-turn-duration').setValue('7')
    await save(view).trigger('click')
    await flushPromises()
    await lobby(view).get('#lobby-turn-duration').setValue('5')
    await lobby(view).get('#lobby-seat-count').setValue('4')
    api.invoke.mockResolvedValueOnce({data: null, error: new Error('refused')})
    await save(view).trigger('click')
    await flushPromises()
    capacity(view, 3)
    expect(lobby(view).text()).toContain('Количество минут на ход игрока 7')
    expect((lobby(view).get('#lobby-turn-duration').element as HTMLSelectElement).value).toBe('5')
    await save(view).trigger('click')
    await flushPromises()
    capacity(view, 4)
    expect(lobby(view).text()).toContain('Количество минут на ход игрока 5')
  })

  it.each([null, '7', 0, 11, 2.5, 5])('не применяет обе настройки при неверных минутах ответа %j', async (minutes) => {
    const view = await openLobby()
    await lobby(view).get('#lobby-seat-count').setValue('4')
    await lobby(view).get('#lobby-turn-duration').setValue('7')
    api.invoke.mockResolvedValueOnce({data: {seat_count: 4, turnDurationMinutes: minutes}, error: null})
    await save(view).trigger('click')
    await flushPromises()
    capacity(view, 3)
    expect(lobby(view).text()).toContain('Количество минут на ход игрока 3')
    expect(view.find('[role="alert"]').exists()).toBe(true)
  })

  it('берёт длительность из подтверждённого ответа входа', async () => {
    api.invoke.mockImplementationOnce(async () => ({data: [otherRoom], error: null}))
    api.invoke.mockImplementationOnce(async () => ({data: {...otherRoom, turnDurationMinutes: 9}, error: null}))
    const view = await openLobby(otherRoom.id)
    expect(lobby(view).text()).toContain('Количество минут на ход игрока 9')
    expect((lobby(view).get('#lobby-turn-duration').element as HTMLSelectElement).value).toBe('9')
  })

  it.each([2, 3, 4])('сохраняет %i мест и обновляет отдельное лобби', async (seatCount) => {
    const view = await openLobby()
    await lobby(view).get('select').setValue(String(seatCount))
    capacity(view, 3)
    await save(view).trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('change-settings-game', {body: {gameId: room.id, seatCount, turnDurationMinutes: 3}})
    capacity(view, seatCount)
    expect(lobby(view).get('select').element.value).toBe(String(seatCount))
    expect(view.find('[role="alert"]').exists()).toBe(false)
  })

  it('без выбора не отправляет запрос и позволяет исправить выбор', async () => {
    const view = await openLobby()
    await lobby(view).get('select').setValue('')
    const calls = api.invoke.mock.calls.length
    await save(view).trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenCalledTimes(calls)
    expect(view.find('[role="alert"]').exists()).toBe(true)
    expect(view.find('article').exists()).toBe(false)
    expect(save(view).attributes('disabled')).toBeUndefined()
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
    expect(view.find('article').exists()).toBe(false)
    const calls = api.invoke.mock.calls.length
    for (const button of lobby(view).findAll('button')) await button.trigger('click')
    expect(api.invoke).toHaveBeenCalledTimes(calls)
    resolve({data: {seat_count: 4, turnDurationMinutes: 3}, error: null})
    await flushPromises()
    capacity(view, 4)
    expect(lobby(view).get('select').attributes('disabled')).toBeUndefined()
    expect(lobby(view).findAll('button').every((button) => button.attributes('disabled') === undefined)).toBe(true)
    expect(view.find('article').exists()).toBe(false)
  })

  it.each(['ready-to-game', 'get-game-players'])('не позволяет менять вместимость во время %s', async (operation) => {
    const view = await openLobby()
    await lobby(view).get('select').setValue('4')
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await lobby(view).findAll('button')[operation === 'ready-to-game' ? 0 : 1]!.trigger('click')
    expect(save(view).attributes('disabled')).toBeDefined()
    expect(lobby(view).get('select').attributes('disabled')).toBeDefined()
    await lobby(view).get('select').setValue('')
    const calls = api.invoke.mock.calls.length
    await save(view).trigger('click')
    expect(api.invoke).toHaveBeenCalledTimes(calls)
    resolve({data: operation === 'ready-to-game' ? {isReady: true} : {gameId: room.id, players: []}, error: null})
    await flushPromises()
    expect(save(view).attributes('disabled')).toBeUndefined()
    await save(view).trigger('click')
    await flushPromises()
    capacity(view, 4, operation === 'ready-to-game' ? room.occupiedSeatCount : 0)
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
    expect(view.find('article').exists()).toBe(false)
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
    capacity(view, 4, 1)
  })

  it('новое открытие приложения не наследует настройки прошлого лобби', async () => {
    const previous = await openLobby()
    await lobby(previous).get('select').setValue('4')
    await save(previous).trigger('click')
    await flushPromises()
    previous.unmount()
    const view = await openLobby(otherRoom.id)
    expect(lobby(view).text()).toContain(otherRoom.id)
    capacity(view, 3)
  })
})
