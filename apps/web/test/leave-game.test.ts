import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils'
import App from '../app/app.vue'
import GameLobby from '../app/GameLobby.vue'

const api = vi.hoisted(() => ({invoke: vi.fn(), removeChannel: vi.fn(), signal: () => {}}))
vi.mock('nuxt/app', () => {
  const channel = {
    on: (_kind: string, _filter: unknown, callback: () => void) => { api.signal = callback; return channel },
    subscribe: () => channel,
  }
  return {useNuxtApp: () => ({$supabase: {functions: {invoke: api.invoke},
    channel: () => channel, removeChannel: api.removeChannel}})}
})
vi.mock('../app/composable/auth', async () => {
  const {ref} = await import('vue')
  return {useProfile: () => ({profile: ref({id: '22222222-2222-4222-8222-222222222222', display_name: 'boris'}),
    isLoadingProfile: ref(false), hasProfileError: ref(false), profileMessage: ref(''), loadProfile: vi.fn()})}
})
enableAutoUnmount(afterEach)
afterEach(() => vi.restoreAllMocks())
const anna = '11111111-1111-4111-8111-111111111111'
const boris = '22222222-2222-4222-8222-222222222222'
const room = {id: '33333333-3333-4333-8333-333333333333', display_name: 'anna',
  seat_count: 4, occupiedSeatCount: 2, hasPassword: false, turnDurationMinutes: 3}
const roster = (creator_id = anna) => ({data: {gameId: room.id, creator_id,
  seat_count: 4, turnDurationMinutes: 3, players: [anna, boris].map(user_id => ({
    user_id, display_name: user_id === anna ? 'anna' : 'boris', isReady: true, is_bot: false, seat_id: user_id,
  }))}, error: null})
type View = ReturnType<typeof mount>
const button = (view: View, text = 'Выйти из комнаты') => view.findAll('button').find(b => b.text() === text)!
const exits = () => api.invoke.mock.calls.filter(([name]) => name === 'leave-game')
function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise(done => { resolve = done })
  return {promise, resolve}
}
beforeEach(() => {
  vi.resetAllMocks()
  api.signal = () => {}
  api.invoke.mockImplementation(async name => {
    if (name === 'game-list') return {data: [room], error: null}
    if (name === 'join-game') return {data: room, error: null}
    if (name === 'get-game-players') return roster()
    if (name === 'leave-game') return {data: {gameId: room.id}, error: null}
    throw new Error('Unexpected function ' + name)
  })
})
async function open() {
  const view = mount(App)
  await flushPromises()
  await view.get('form').trigger('submit')
  await flushPromises()
  expect(button(view).attributes('disabled')).toBeDefined()
  await button(view, 'Обновить').trigger('click')
  await flushPromises()
  api.invoke.mockClear()
  return view
}
it('подтверждённый выход открывает список, сохраняет профиль и очищает подписку', async () => {
  const view = await open()
  const pending = deferred()
  api.invoke.mockReturnValueOnce(pending.promise)
  await button(view).trigger('click')
  expect(button(view).attributes('disabled')).toBeDefined()
  expect(view.find('[aria-label="Лобби"]').exists()).toBe(true)
  api.signal()
  pending.resolve({data: {gameId: room.id}, error: null})
  await flushPromises()
  expect(exits()).toHaveLength(1)
  expect(exits()[0]![1].body).toEqual({gameId: room.id, requestId: expect.any(String)})
  expect(view.find('[aria-label="Лобби"]').exists()).toBe(false)
  expect(view.text()).toContain('Мой профиль')
  expect(view.text()).toContain('boris')
  expect(button(view, 'Создать комнату').exists()).toBe(true)
  expect(api.removeChannel).toHaveBeenCalledTimes(1)
  expect(api.invoke.mock.calls.filter(([name]) => name === 'get-game-players')).toHaveLength(0)
})
it.each(['error', 'exception', 'invalid', 'wrong-room', 'unknown-code'])('при %s остаётся в лобби и повторяет тот же запрос', async kind => {
  const view = await open()
  if (kind === 'exception') api.invoke.mockRejectedValueOnce(new Error('network'))
  else api.invoke.mockResolvedValueOnce(kind === 'error' ? {data: null, error: {message: 'failed'}}
    : {data: kind === 'invalid' ? {} : kind === 'wrong-room' ? {gameId: anna} : {gameId: room.id, code: 'UNKNOWN'}, error: null})
  await button(view).trigger('click')
  await flushPromises()
  expect(view.find('[aria-label="Лобби"]').exists()).toBe(true)
  expect(button(view).attributes('disabled')).toBeUndefined()
  await button(view).trigger('click')
  await flushPromises()
  expect(exits()).toHaveLength(2)
  expect(exits()[1]![1].body).toEqual(exits()[0]![1].body)
  expect(view.find('[aria-label="Лобби"]').exists()).toBe(false)
})
it('создатель выходит из лобби после подтверждения команды', async () => {
  const view = await open()
  api.invoke.mockResolvedValueOnce(roster(boris))
  await button(view, 'Обновить').trigger('click')
  await flushPromises()
  expect(button(view).attributes('disabled')).toBeUndefined()
  await button(view).trigger('click')
  await flushPromises()
  expect(exits()).toHaveLength(1)
  expect(exits()[0]![1].body).toEqual({gameId: room.id, requestId: expect.any(String)})
  expect(view.find('[aria-label="Лобби"]').exists()).toBe(false)
  expect(api.removeChannel).toHaveBeenCalledTimes(1)
})
it('после сигнала показывает управление лобби новому создателю', async () => {
  const view = await open()
  expect(view.find('[aria-label="Управление лобби"]').exists()).toBe(false)
  const updatedRoster = roster(boris)
  updatedRoster.data.players = updatedRoster.data.players.filter(player => player.user_id === boris)
  api.invoke.mockResolvedValueOnce(updatedRoster)
  api.signal()
  await flushPromises()
  expect(view.find('[aria-label="Управление лобби"]').exists()).toBe(true)
  expect(view.get('[aria-label="Состав комнаты"]').text()).toContain('boris')
  expect(view.get('[aria-label="Состав комнаты"]').text()).not.toContain('anna')
  expect(view.get('[aria-label="Лобби"] h2').text()).toBe('Вы в комнате boris')
})
it('после потерянного ответа и отказа чтения позволяет повторить сохранённый выход', async () => {
  const view = await open()
  const pending = deferred()
  api.invoke.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({data: null, error: {message: 'membership removed'}})
  await button(view).trigger('click')
  api.signal()
  pending.resolve({data: null, error: {message: 'response lost'}})
  await flushPromises()
  expect(view.find('[aria-label="Лобби"]').exists()).toBe(true)
  expect(button(view).attributes('disabled')).toBeUndefined()
  await button(view).trigger('click')
  await flushPromises()
  expect(exits()).toHaveLength(2)
  expect(exits()[1]![1].body).toEqual(exits()[0]![1].body)
  expect(view.find('[aria-label="Лобби"]').exists()).toBe(false)
})

const accessError = (body: unknown) => ({data: null, error: {context: new Response(JSON.stringify(body), {
  status: 404, headers: {'Content-Type': 'application/json'},
})}})
it('сигнал и подтверждённая потеря доступа возвращают список, сохраняют профиль и очищают канал', async () => {
  const view = await open()
  api.invoke.mockResolvedValueOnce(accessError({error: 'Комната или участник не найдены', code: 'LOBBY_ACCESS_LOST', gameId: room.id}))
  api.signal()
  await flushPromises()
  expect(view.find('[aria-label="Лобби"]').exists()).toBe(false)
  expect(view.text()).toContain('Мой профиль')
  expect(view.text()).toContain('boris')
  expect(button(view, 'Создать комнату').exists()).toBe(true)
  expect(api.removeChannel).toHaveBeenCalledTimes(1)
  expect(exits()).toHaveLength(0)
})
it.each(['wrong-room', 'missing-code', 'unknown-code', 'network', 'invalid-body'])('чтение %s не закрывает лобби и допускает повтор', async kind => {
  const view = await open()
  if (kind === 'network') api.invoke.mockRejectedValueOnce(new Error('network'))
  else api.invoke.mockResolvedValueOnce(accessError(kind === 'invalid-body' ? null : {
    error: 'Попробуйте ещё раз',
    gameId: kind === 'wrong-room' ? anna : room.id,
    ...kind === 'missing-code' ? {} : {code: kind === 'unknown-code' ? 'UNKNOWN' : 'LOBBY_ACCESS_LOST'},
  }))
  api.signal()
  await flushPromises()
  expect(view.find('[aria-label="Лобби"]').exists()).toBe(true)
  expect(view.find('[role="alert"]').exists()).toBe(true)
  expect(button(view, 'Обновить').attributes('disabled')).toBeUndefined()
  await button(view, 'Обновить').trigger('click')
  await flushPromises()
  expect(view.text()).toContain('boris')
  expect(view.find('[aria-label="Лобби"]').exists()).toBe(true)
})
it('завершение чтения ошибки после размонтирования не отправляет leaveRoom', async () => {
  const pending = deferred()
  const response = new Response('', {status: 404})
  vi.spyOn(response, 'json').mockReturnValue(pending.promise)
  api.invoke.mockResolvedValueOnce({data: null, error: {context: response}})
  const view = mount(GameLobby, {props: {joinedGame: room, profileId: boris}})
  await button(view, 'Обновить').trigger('click')
  await flushPromises()
  view.unmount()
  pending.resolve({error: 'Нет доступа', code: 'LOBBY_ACCESS_LOST', gameId: room.id})
  await flushPromises()
  expect(view.emitted('leaveRoom')).toBeUndefined()
})
