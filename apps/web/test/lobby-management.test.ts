import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils'
import GameLobby from '../app/GameLobby.vue'
import {passiveRealtime} from './helpers/passive-realtime'

const api = vi.hoisted(() => ({invoke: vi.fn()}))
vi.mock('nuxt/app', () => ({useNuxtApp: () => ({$supabase: {
  ...passiveRealtime, functions: {invoke: api.invoke},
}})}))
enableAutoUnmount(afterEach)
beforeEach(() => vi.resetAllMocks())

const anna = '11111111-1111-4111-8111-111111111111'
const boris = '22222222-2222-4222-8222-222222222222'
const room = {id: '33333333-3333-4333-8333-333333333333', display_name: 'anna',
  seat_count: 4, occupiedSeatCount: 2, hasPassword: false, turnDurationMinutes: 5}
const roster = (creator_id = anna) => ({data: {gameId: room.id, creator_id,
  seat_count: 4, turnDurationMinutes: 5, players: [anna, boris].map(user_id => ({
    user_id, display_name: user_id === anna ? 'anna' : 'boris', isReady: true,
    is_bot: false, seat_id: user_id,
  }))}, error: null})
type View = ReturnType<typeof mount>
const button = (view: View, label: string) => view.findAll('button').find(b => b.text() === label)!
const management = (view: View) => view.find('#lobby-seat-count').exists()
const refresh = async (view: View) => {
  await button(view, 'Обновить').trigger('click')
  await flushPromises()
}
function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise(done => { resolve = done })
  return {promise, resolve}
}

it.each([anna, boris])('показывает управление только подтверждённому создателю %s', async profileId => {
  api.invoke.mockResolvedValue(roster())
  const view = mount(GameLobby, {props: {joinedGame: room, profileId}})
  expect(management(view)).toBe(false)
  await refresh(view)
  expect(management(view)).toBe(profileId === anna)
  expect(view.findAll('button').some(b => b.text() === 'Добавить бота')).toBe(profileId === anna)
  expect(view.text()).toContain('Количество минут на ход игрока 5')
  expect(view.text()).toContain('Всего мест: 4')
  expect(button(view, 'Подтвердить готовность').exists()).toBe(true)
})

it('последующий ответ с другим создателем скрывает управление', async () => {
  api.invoke.mockResolvedValueOnce(roster()).mockResolvedValueOnce(roster(boris))
  const view = mount(GameLobby, {props: {joinedGame: room, profileId: anna}})
  await refresh(view)
  expect(management(view)).toBe(true)
  await refresh(view)
  expect(management(view)).toBe(false)
})

it('изменение текущего пользователя пересчитывает управление без нового чтения', async () => {
  api.invoke.mockResolvedValue(roster())
  const view = mount(GameLobby, {props: {joinedGame: room, profileId: anna}})
  await refresh(view)
  await view.setProps({profileId: boris})
  expect(management(view)).toBe(false)
  await view.setProps({profileId: anna})
  expect(management(view)).toBe(true)
  expect(api.invoke).toHaveBeenCalledTimes(1)
})

it.each(['error', 'exception', 'missing', 'invalid', 'wrong-room'])('при %s скрывает управление, успешный повтор сохраняет черновик', async kind => {
  api.invoke.mockResolvedValueOnce(roster())
  const view = mount(GameLobby, {props: {joinedGame: room, profileId: anna}})
  await refresh(view)
  await view.get('#lobby-seat-count').setValue('3')
  await view.get('#lobby-turn-duration').setValue('7')
  const pending = deferred()
  api.invoke.mockReturnValueOnce(pending.promise)
  await button(view, 'Обновить').trigger('click')
  expect(management(view)).toBe(false)
  const data = {...roster().data} as Record<string, unknown>
  if (kind === 'missing') delete data.creator_id
  if (kind === 'invalid') data.creator_id = 'wrong'
  if (kind === 'wrong-room') data.gameId = boris
  pending.resolve(kind === 'error' ? {data: null, error: new Error('read refused')}
    : kind === 'exception' ? Promise.reject(new Error('network')) : {data, error: null})
  await flushPromises()
  expect(management(view)).toBe(false)
  expect(view.find('[role="alert"]').exists()).toBe(true)
  api.invoke.mockResolvedValueOnce(roster())
  await refresh(view)
  expect(management(view)).toBe(true)
  expect((view.get('#lobby-seat-count').element as HTMLSelectElement).value).toBe('3')
  expect((view.get('#lobby-turn-duration').element as HTMLSelectElement).value).toBe('7')
  expect(view.find('[role="alert"]').exists()).toBe(false)
})

it('игнорирует подтверждение создателя после размонтирования', async () => {
  const pending = deferred()
  api.invoke.mockReturnValueOnce(pending.promise)
  const onChangeData = vi.fn()
  const view = mount(GameLobby, {props: {joinedGame: room, profileId: anna}, attrs: {onChangeData}})
  await button(view, 'Обновить').trigger('click')
  view.unmount()
  pending.resolve(roster())
  await flushPromises()
  expect(onChangeData).not.toHaveBeenCalled()
})
