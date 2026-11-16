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
  seat_count: 4, occupiedSeatCount: 2, hasPassword: false, turnDurationMinutes: 5}
const human = (user_id: string, isReady = true) => ({user_id, isReady,
  display_name: 'Человек', seat_id: user_id, is_bot: false})
const bot = {user_id: null, isReady: true, display_name: 'Бот',
  seat_id: '44444444-4444-4444-8444-444444444444', is_bot: true}
const roster = (players: Array<ReturnType<typeof human> | typeof bot>) => ({data: {
  gameId: room.id, creator_id: own, seat_count: 4, turnDurationMinutes: 5, players,
}, error: null})
const open = () => mount(GameLobby, {props: {joinedGame: room, profileId: own}})
type View = ReturnType<typeof open>
const refresh = async (view: View) => {
  await view.findAll('button').find(b => b.text() === 'Обновить')!.trigger('click')
  await flushPromises()
}
const readyText = 'Комната готова к запуску'

it.each([true, false])('один участник с готовностью %s требует второго участника', async isReady => {
  api.invoke.mockResolvedValueOnce(roster([human(own, isReady)]))
  const view = open()
  await refresh(view)
  expect(view.text()).toContain('Для запуска нужны минимум два участника')
  expect(view.text()).not.toContain(readyText)
})

it.each(['human', 'bot'])('два готовых участника (%s) могут начать при четырёх местах', async kind => {
  api.invoke.mockResolvedValueOnce(roster([human(own), kind === 'bot' ? bot : human(other)]))
  const view = open()
  await refresh(view)
  expect(view.text()).toContain(readyText)
})

it('перечитывание готовности меняет объяснение', async () => {
  api.invoke.mockResolvedValueOnce(roster([human(own), human(other, false)]))
    .mockResolvedValueOnce(roster([human(own), human(other)]))
  const view = open()
  await refresh(view)
  expect(view.text()).toContain('Не все участники готовы')
  await refresh(view)
  expect(view.text()).toContain(readyText)
})

it('при чтении и его ошибке убирает прежнюю готовность, повтор восстанавливает статус', async () => {
  api.invoke.mockResolvedValueOnce(roster([human(own), human(other)]))
  const view = open()
  await refresh(view)
  expect(view.text()).toContain(readyText)
  let resolve!: (value: unknown) => void
  api.invoke.mockReturnValueOnce(new Promise(done => { resolve = done }))
  await view.findAll('button').find(b => b.text() === 'Обновить')!.trigger('click')
  expect(view.text()).toContain('Идет обновление данных')
  expect(view.text()).not.toContain(readyText)
  resolve({data: null, error: new Error('network')})
  await flushPromises()
  expect(view.text()).toContain('неизвестная готовность')
  expect(view.text()).not.toContain(readyText)
  api.invoke.mockResolvedValueOnce(roster([human(own), bot]))
  await refresh(view)
  expect(view.text()).toContain(readyText)
})

it('ответ без собственной строки не объявляет комнату готовой', async () => {
  api.invoke.mockResolvedValueOnce(roster([human(other), bot]))
  const view = open()
  await refresh(view)
  expect(view.find('[role="alert"]').exists()).toBe(true)
  expect(view.text()).toContain('неизвестная готовность')
  expect(view.text()).not.toContain(readyText)
})
