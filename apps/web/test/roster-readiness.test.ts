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

const own = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const room = {id: '33333333-3333-4333-8333-333333333333', display_name: 'anna',
  seat_count: 4, occupiedSeatCount: 3, hasPassword: false, turnDurationMinutes: 5}
const player = (user_id: string, isReady: boolean) => ({user_id, isReady,
  display_name: 'Человек', seat_id: user_id, is_bot: false})
const roster = (isReady: boolean, includeOwn = true) => ({data: {
  gameId: room.id, creator_id: own, seat_count: 4, turnDurationMinutes: 5,
  players: [player(other, !isReady), {user_id: null, isReady: !isReady,
    display_name: 'Бот', seat_id: '44444444-4444-4444-8444-444444444444', is_bot: true},
  ...(includeOwn ? [player(own, isReady)] : [])],
}, error: null})
const open = () => mount(GameLobby, {props: {joinedGame: room, profileId: own}})
type View = ReturnType<typeof open>
const refresh = async (view: View) => {
  await view.findAll('button').find(b => b.text() === 'Обновить')!.trigger('click')
  await flushPromises()
}

it.each([true, false])('читает собственную готовность %s и отправляет обратное значение', async isReady => {
  api.invoke.mockResolvedValueOnce(roster(isReady))
    .mockResolvedValueOnce({data: {isReady: !isReady}, error: null})
  const view = open()
  await refresh(view)
  expect(view.findAll('p').map(p => p.text())).toContain(isReady ? 'Готов' : 'Не готов')
  expect(view.get('button').text()).toBe(isReady ? 'Снять готовность' : 'Подтвердить готовность')
  await view.get('button').trigger('click')
  await flushPromises()
  expect(api.invoke).toHaveBeenLastCalledWith('ready-to-game', {
    body: {gameId: room.id, isReady: !isReady},
  })
})

it('сбрасывает прежнюю готовность без собственной строки и восстанавливает при повторе', async () => {
  api.invoke.mockResolvedValueOnce(roster(true)).mockResolvedValueOnce(roster(true, false))
    .mockResolvedValueOnce(roster(false))
  const view = open()
  await refresh(view)
  expect(view.get('button').text()).toBe('Снять готовность')
  await refresh(view)
  expect(view.get('[role="alert"]').text()).toBe('Что то пошло не так')
  expect(view.text()).toContain('Готовность неизвестна')
  await refresh(view)
  expect(view.find('[role="alert"]').exists()).toBe(false)
  expect(view.findAll('p').map(p => p.text())).toContain('Не готов')
  expect(api.invoke.mock.calls.every(([name]) => name === 'get-game-players')).toBe(true)
})

it.each(['error', 'invalid', 'exception'])('чтение с %s не подменяет подтверждённую готовность; повтор работает', async kind => {
  api.invoke.mockResolvedValueOnce(roster(true))
  const view = open()
  await refresh(view)
  if (kind === 'exception') api.invoke.mockRejectedValueOnce(new Error('private'))
  else api.invoke.mockResolvedValueOnce(kind === 'error'
    ? {data: null, error: new Error('private')} : {data: {players: []}, error: null})
  await refresh(view)
  expect(view.find('[role="alert"]').exists()).toBe(true)
  expect(view.get('button').text()).toBe('Снять готовность')
  api.invoke.mockResolvedValueOnce(roster(false))
  await refresh(view)
  expect(view.get('button').text()).toBe('Подтвердить готовность')
})
