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

const owner = '11111111-1111-4111-8111-111111111111'
const bot = '22222222-2222-4222-8222-222222222222'
const room = {id: '33333333-3333-4333-8333-333333333333', display_name: 'anna',
  seat_count: 4, occupiedSeatCount: 2, hasPassword: false, turnDurationMinutes: 3}

it('создатель отправляет удаление выбранного бота с gameId, seat_id и requestId', async () => {
  api.invoke.mockImplementation(async name => {
    if (name === 'get-game-players') return {data: {gameId: room.id, creator_id: owner,
      seat_count: 4, turnDurationMinutes: 3, players: [
        {user_id: owner, seat_id: owner, display_name: 'anna', isReady: true, is_bot: false},
        {user_id: null, seat_id: bot, display_name: 'Бот', isReady: true, is_bot: true},
      ]}, error: null}
    if (name === 'remove-bot') return {data: null, error: {message: 'network failure'}}
    throw new Error('Unexpected function ' + name)
  })
  const view = mount(GameLobby, {props: {joinedGame: room, profileId: owner}})
  await view.findAll('button').find(button => button.text() === 'Обновить')!.trigger('click')
  await flushPromises()
  const remove = view.findAll('button').find(button => button.text() === 'удалить бота')!
  expect(remove.exists()).toBe(true)
  await remove.trigger('click')
  await flushPromises()
  const calls = api.invoke.mock.calls.filter(([name]) => name === 'remove-bot')
  expect(calls).toHaveLength(1)
  expect(calls[0]![1].body).toEqual({gameId: room.id, seat_id: bot, requestId: expect.any(String)})
})

it('подтверждённое удаление перечитывает состав без ожидания Realtime и убирает бота', async () => {
  let removed = false
  api.invoke.mockImplementation(async name => {
    if (name === 'remove-bot') {
      removed = true
      return {data: {gameId: room.id}, error: null}
    }
    if (name === 'get-game-players') return {data: {gameId: room.id, creator_id: owner,
      seat_count: 4, turnDurationMinutes: 3, players: [
        {user_id: owner, seat_id: owner, display_name: 'anna', isReady: true, is_bot: false},
        ...removed ? [] : [{user_id: null, seat_id: bot, display_name: 'Бот', isReady: true, is_bot: true}],
      ]}, error: null}
    throw new Error('Unexpected function ' + name)
  })
  const view = mount(GameLobby, {props: {joinedGame: room, profileId: owner}})
  await view.findAll('button').find(button => button.text() === 'Обновить')!.trigger('click')
  await flushPromises()
  await view.findAll('button').find(button => button.text() === 'удалить бота')!.trigger('click')
  await flushPromises()
  expect(api.invoke.mock.calls.filter(([name]) => name === 'get-game-players')).toHaveLength(2)
  expect(view.findAll('button').some(button => button.text() === 'удалить бота')).toBe(false)
  expect(view.text()).toContain('Для запуска нужны минимум два участника')
  expect(view.emitted('occupiedSeatCountChange')?.at(-1)).toEqual([1])
})

it('подтверждённое отсутствие бота после потери ответа позволяет удалить следующего новым запросом', async () => {
  const nextBot = '44444444-4444-4444-8444-444444444444'
  let firstRemoved = false
  api.invoke.mockImplementation(async name => {
    if (name === 'remove-bot') {
      firstRemoved = true
      return {data: null, error: {message: 'response lost'}}
    }
    if (name === 'get-game-players') return {data: {gameId: room.id, creator_id: owner,
      seat_count: 4, turnDurationMinutes: 3, players: [
        {user_id: owner, seat_id: owner, display_name: 'anna', isReady: true, is_bot: false},
        ...firstRemoved ? [] : [{user_id: null, seat_id: bot, display_name: 'Бот', isReady: true, is_bot: true}],
        {user_id: null, seat_id: nextBot, display_name: 'Бот', isReady: true, is_bot: true},
      ]}, error: null}
    throw new Error('Unexpected function ' + name)
  })
  const view = mount(GameLobby, {props: {joinedGame: {...room, occupiedSeatCount: 3}, profileId: owner}})
  const refresh = async () => {
    await view.findAll('button').find(button => button.text() === 'Обновить')!.trigger('click')
    await flushPromises()
  }
  await refresh()
  await view.findAll('button').find(button => button.text() === 'удалить бота')!.trigger('click')
  await flushPromises()
  await refresh()
  const buttons = view.findAll('button').filter(button => button.text() === 'удалить бота')
  expect(buttons).toHaveLength(1)
  await buttons[0]!.trigger('click')
  await flushPromises()
  const calls = api.invoke.mock.calls.filter(([name]) => name === 'remove-bot')
  expect(calls).toHaveLength(2)
  expect(calls[1]![1].body.seat_id).toBe(nextBot)
  expect(calls[1]![1].body.requestId).not.toBe(calls[0]![1].body.requestId)
})

it('после потери ответа и ошибки чтения восстанавливает состав и повторяет сохранённое удаление', async () => {
  let rosterUnavailable = false
  api.invoke.mockImplementation(async name => {
    if (name === 'remove-bot') {
      rosterUnavailable = true
      return {data: null, error: {message: 'response lost'}}
    }
    if (name === 'get-game-players') {
      if (rosterUnavailable) return {data: null, error: {message: 'roster unavailable'}}
      return {data: {gameId: room.id, creator_id: owner, seat_count: 4, turnDurationMinutes: 3, players: [
        {user_id: owner, seat_id: owner, display_name: 'anna', isReady: true, is_bot: false},
        {user_id: null, seat_id: bot, display_name: 'Бот', isReady: true, is_bot: true},
      ]}, error: null}
    }
    throw new Error('Unexpected function ' + name)
  })
  const view = mount(GameLobby, {props: {joinedGame: room, profileId: owner}})
  const refresh = async () => {
    await view.findAll('button').find(button => button.text() === 'Обновить')!.trigger('click')
    await flushPromises()
  }
  await refresh()
  await view.findAll('button').find(button => button.text() === 'удалить бота')!.trigger('click')
  await flushPromises()
  await refresh()
  expect(view.findAll('button').some(button => button.text() === 'Обновить'
    && button.attributes('disabled') === undefined)).toBe(true)
  expect(api.invoke.mock.calls.filter(([name]) => name === 'remove-bot')).toHaveLength(1)
  rosterUnavailable = false
  await refresh()
  await view.findAll('button').find(button => button.text() === 'удалить бота')!.trigger('click')
  await flushPromises()
  const calls = api.invoke.mock.calls.filter(([name]) => name === 'remove-bot')
  expect(calls).toHaveLength(2)
  expect(calls[1]![1].body).toEqual(calls[0]![1].body)
})

it('не отправляет сохранённое удаление B при клике на другого бота C', async () => {
  const nextBot = '44444444-4444-4444-8444-444444444444'
  api.invoke.mockImplementation(async name => {
    if (name === 'remove-bot') return {data: null, error: {message: 'response lost'}}
    if (name === 'get-game-players') return {data: {gameId: room.id, creator_id: owner,
      seat_count: 4, turnDurationMinutes: 3, players: [
        {user_id: owner, seat_id: owner, display_name: 'anna', isReady: true, is_bot: false},
        ...[bot, nextBot].map(seat_id => ({user_id: null, seat_id, display_name: 'Бот', isReady: true, is_bot: true})),
      ]}, error: null}
    throw new Error('Unexpected function ' + name)
  })
  const view = mount(GameLobby, {props: {joinedGame: {...room, occupiedSeatCount: 3}, profileId: owner}})
  await view.findAll('button').find(button => button.text() === 'Обновить')!.trigger('click')
  await flushPromises()
  const buttons = view.findAll('button').filter(button => button.text() === 'удалить бота')
  await buttons[0]!.trigger('click')
  await flushPromises()
  await buttons[1]!.trigger('click')
  await flushPromises()
  expect(api.invoke.mock.calls.filter(([name]) => name === 'remove-bot')).toHaveLength(1)
})
