import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils'
import {passiveRealtime} from './helpers/passive-realtime'
import App from '../app/app.vue'

const api = vi.hoisted(() => ({invoke: vi.fn()}))
vi.mock('nuxt/app', () => ({useNuxtApp: () => ({$supabase: {
  ...passiveRealtime, functions: {invoke: api.invoke},
}})}))
vi.mock('../app/composable/auth', async () => {
  const {ref} = await import('vue')
  return {useProfile: () => ({profile: ref({id: '11111111-1111-4111-8111-111111111111'}),
    isLoadingProfile: ref(false), hasProfileError: ref(false), profileMessage: ref(''), loadProfile: vi.fn()})}
})
enableAutoUnmount(afterEach)
afterEach(() => vi.restoreAllMocks())

const room = {id: '22222222-2222-4222-8222-222222222222', display_name: 'anna',
  seat_count: 4, occupiedSeatCount: 1, hasPassword: false, turnDurationMinutes: 3}
const human = {user_id: '11111111-1111-4111-8111-111111111111', display_name: 'anna',
  isReady: true, is_bot: false, seat_id: '33333333-3333-4333-8333-333333333333'}
const bot = {user_id: null, display_name: 'Бот', isReady: false,
  is_bot: true, seat_id: '44444444-4444-4444-8444-444444444444'}
const secondBot = {...bot, seat_id: '55555555-5555-4555-8555-555555555555'}
type View = ReturnType<typeof mount>
const lobby = (view: View) => view.get('[aria-label="Лобби"]')
const button = (view: View) => lobby(view).findAll('button').find(b => b.text() === 'Добавить бота')!
const rows = (view: View) => lobby(view).findAll('p').filter(p => p.find('span').exists())
const additions = () => api.invoke.mock.calls.filter(([name]) => name === 'add-bot')
const reads = () => api.invoke.mock.calls.filter(([name]) => name === 'get-game-players')
function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise(done => { resolve = done })
  return {promise, resolve}
}
const roster = (players = [human, bot]) => ({data: {gameId: room.id, creator_id: human.user_id,
  seat_count: 4, turnDurationMinutes: 3, players}, error: null})
let serverPlayers: Array<typeof human | typeof bot>
// The mocked command supplies confirmed replies, not an implementation of SQL idempotency.
beforeEach(() => {
  vi.resetAllMocks()
  serverPlayers = [human]
  api.invoke.mockImplementation(async (name) => {
    if (name === 'game-list') return {data: [room], error: null}
    if (name === 'join-game') return {data: room, error: null}
    if (name === 'add-bot') {
      const next = serverPlayers.length === 1 ? bot : secondBot
      serverPlayers = [...serverPlayers, next]
      return {data: {gameId: room.id, seat_id: next.seat_id}, error: null}
    }
    if (name === 'get-game-players') return roster(serverPlayers)
    throw new Error('Unexpected function ' + name)
  })
})
async function openLobby() {
  const view = mount(App)
  await flushPromises()
  await view.get('form').trigger('submit')
  await flushPromises()
  await lobby(view).findAll('button').find(b => b.text() === 'Обновить')!.trigger('click')
  await flushPromises()
  api.invoke.mockClear()
  return view
}

describe('WEB-004: добавление бота через подтверждённый ответ и чтение состава', () => {
  it('без Realtime перечитывает состав, показывает бота и обновляет занятость', async () => {
    const view = await openLobby()
    await button(view).trigger('click')
    await flushPromises()
    expect(additions()).toHaveLength(1)
    expect(additions()[0]![1].body).toEqual({gameId: room.id, requestId: expect.any(String)})
    expect(reads()).toHaveLength(1)
    expect(rows(view).map(row => row.find('span').text())).toEqual(['anna', 'Бот'])
    expect(lobby(view).text()).toContain('Занято: 2')
    expect(lobby(view).text()).toContain('Свободно: 2')
    expect(view.find('[role="alert"]').exists()).toBe(false)
  })

  it('блокирует повтор до ответа и не меняет занятость до завершения чтения', async () => {
    const view = await openLobby()
    const command = deferred()
    const read = deferred()
    api.invoke.mockReturnValueOnce(command.promise).mockReturnValueOnce(read.promise)
    await button(view).trigger('click')
    expect(button(view).attributes('disabled')).toBeDefined()
    await button(view).trigger('click')
    expect(additions()).toHaveLength(1)
    expect(reads()).toHaveLength(0)
    expect(lobby(view).text()).toContain('Занято: 1')
    command.resolve({data: {gameId: room.id, seat_id: bot.seat_id}, error: null})
    await flushPromises()
    expect(reads()).toHaveLength(1)
    expect(lobby(view).findAll('button').some(b => b.text() === 'Добавить бота')).toBe(false)
    expect(lobby(view).text()).toContain('Занято: 1')
    read.resolve(roster())
    await flushPromises()
    expect(button(view).attributes('disabled')).toBeUndefined()
    expect(lobby(view).text()).toContain('Занято: 2')
  })

  it('повтор после сетевого исключения сохраняет запрос, новое добавление после успеха меняет ID', async () => {
    const view = await openLobby()
    api.invoke.mockRejectedValueOnce(new Error('connection lost'))
    await button(view).trigger('click')
    await flushPromises()
    const first = {...additions()[0]![1].body}
    expect(view.find('[role="alert"]').exists()).toBe(true)
    expect(reads()).toHaveLength(0)
    expect(button(view).attributes('disabled')).toBeUndefined()
    await button(view).trigger('click')
    await flushPromises()
    expect(additions()[1]![1].body).toEqual(first)
    await button(view).trigger('click')
    await flushPromises()
    expect(additions()[2]![1].body.requestId).not.toBe(first.requestId)
    expect(rows(view).map(row => row.find('span').text())).toEqual(['anna', 'Бот', 'Бот'])
    expect(lobby(view).text()).toContain('Занято: 3')
  })

  it.each([null, {}, {gameId: room.id}, {gameId: room.id, seat_id: 'wrong'},
    {gameId: secondBot.seat_id, seat_id: bot.seat_id}])('неверный успех %j сохраняет запрос для повтора', async data => {
    const view = await openLobby()
    api.invoke.mockResolvedValueOnce({data, error: null})
    await button(view).trigger('click')
    await flushPromises()
    const first = {...additions()[0]![1].body}
    expect(view.find('[role="alert"]').exists()).toBe(true)
    expect(reads()).toHaveLength(0)
    expect(lobby(view).text()).toContain('Занято: 1')
    await button(view).trigger('click')
    await flushPromises()
    expect(additions()[1]![1].body).toEqual(first)
    expect(lobby(view).text()).toContain('Занято: 2')
  })

  it('ошибка Edge показывается текстом и не очищает запрос', async () => {
    const view = await openLobby()
    const message = '<b>Добавление запрещено</b>'
    api.invoke.mockResolvedValueOnce({data: null,
      error: {context: Response.json({error: message}, {status: 403})}})
    await button(view).trigger('click')
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toBe(message)
    expect(view.find('b').exists()).toBe(false)
    const first = {...additions()[0]![1].body}
    await button(view).trigger('click')
    await flushPromises()
    expect(additions()[1]![1].body).toEqual(first)
  })

  it('ошибка генерации ID снимает блокировку и позволяет повтор', async () => {
    const view = await openLobby()
    vi.spyOn(crypto, 'randomUUID').mockImplementationOnce(() => { throw new Error('UUID unavailable') })
    await button(view).trigger('click')
    await flushPromises()
    expect(additions()).toHaveLength(0)
    expect(view.find('[role="alert"]').exists()).toBe(true)
    expect(button(view).attributes('disabled')).toBeUndefined()
    await button(view).trigger('click')
    await flushPromises()
    expect(lobby(view).text()).toContain('Занято: 2')
  })

  it('ошибка чтения после успеха позволяет повторить только чтение без новой команды', async () => {
    const view = await openLobby()
    api.invoke.mockResolvedValueOnce({data: {gameId: room.id, seat_id: bot.seat_id}, error: null})
      .mockRejectedValueOnce(new Error('roster unavailable'))
    await button(view).trigger('click')
    await flushPromises()
    expect(view.find('[role="alert"]').exists()).toBe(true)
    api.invoke.mockResolvedValueOnce(roster())
    await lobby(view).findAll('button').find(b => b.text() === 'Обновить')!.trigger('click')
    await flushPromises()
    expect(additions()).toHaveLength(1)
    expect(lobby(view).text()).toContain('Занято: 2')
  })

  it('поздний успех после размонтирования не запускает чтение', async () => {
    const view = await openLobby()
    const pending = deferred()
    api.invoke.mockReturnValueOnce(pending.promise)
    await button(view).trigger('click')
    view.unmount()
    pending.resolve({data: {gameId: room.id, seat_id: bot.seat_id}, error: null})
    await flushPromises()
    expect(reads()).toHaveLength(0)
  })
})
