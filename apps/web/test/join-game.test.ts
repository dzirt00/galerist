import {passiveRealtime} from './helpers/passive-realtime'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils'
import GameList from '../app/GameList.vue'

const api = vi.hoisted(() => ({invoke: vi.fn()}))
vi.mock('nuxt/app', () => ({
  useNuxtApp: () => ({$supabase: {...passiveRealtime,functions: {invoke: api.invoke}}}),
}))
enableAutoUnmount(afterEach)

const room = {id: '11111111-1111-4111-8111-111111111111', seat_count: 3,
  occupiedSeatCount: 1, hasPassword: false, turnDurationMinutes: 3}
const protectedRoom = {...room, id: '22222222-2222-4222-8222-222222222222', hasPassword: true, turnDurationMinutes: 3}
const failureMessage = 'Не удалось присоединиться к комнате. Попробуйте ещё раз'

beforeEach(() => {
  vi.resetAllMocks()
  api.invoke.mockResolvedValue({data: [room, protectedRoom], error: null})
})

async function openList() {
  const wrapper = mount(GameList)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  return wrapper
}

describe('WEB-003: присоединение из списка', () => {
  it.each([false, true])('передаёт выбранную комнату (пароль: %s), показывает подтверждённое лобби', async (protectedEntry) => {
    const wrapper = await openList()
    const selected = protectedEntry ? protectedRoom : room
    const article = wrapper.findAll('article')[protectedEntry ? 1 : 0]
    if (protectedEntry) await article.get('input').setValue('  пароль 🎨  ')
    api.invoke.mockResolvedValueOnce({data: {...selected, occupiedSeatCount: 2}, error: null})
    await article.get('form').trigger('submit')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('join-game', {
      body: {gameId: selected.id, ...(protectedEntry && {password: '  пароль 🎨  '})},
    })
    expect(wrapper.get('[aria-label="Лобби"]').text()).toContain('Вы в комнате ' + selected.id)
    expect(wrapper.get('[aria-label="Лобби"]').text()).toContain('Занято: 2')
    expect(wrapper.get('[aria-label="Лобби"]').text()).toContain('Свободно: 1')
    expect(article.text()).toContain('Занято: 2')
    if (protectedEntry) expect((article.get('input').element as HTMLInputElement).value).toBe('')
  })

  it('ожидает подтверждения, блокирует двойной submit и обновление списка', async () => {
    const wrapper = await openList()
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await wrapper.findAll('form')[0].trigger('submit')
    expect(wrapper.text()).toContain('Присоединяемся…')
    expect(wrapper.find('[aria-label="Лобби"]').exists()).toBe(false)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.findAll('form')[1].trigger('submit')
    expect(api.invoke).toHaveBeenCalledTimes(2)
    resolve({data: {...room, occupiedSeatCount: 2}, error: null})
    await flushPromises()
    expect(wrapper.find('[aria-label="Лобби"]').exists()).toBe(true)
  })

  it.each([
    [401, 'Сессия недействительна'],
    [403, 'Неверный пароль'],
    [404, 'Комната не найдена'],
    [409, 'Свободных мест нет'],
    [500, failureMessage],
  ])('отказ %s не показывает успех, разрешает повтор', async (status, message) => {
    const wrapper = await openList()
    const article = wrapper.findAll('article')[1]
    await article.get('input').setValue('password')
    api.invoke.mockResolvedValueOnce({data: null, error: {context: new Response('{}', {status: Number(status)})}})
    await article.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(String(message))
    expect(wrapper.find('[aria-label="Лобби"]').exists()).toBe(false)
    expect(article.text()).toContain('Занято: 1')
    expect((article.get('input').element as HTMLInputElement).value).toBe('password')
    api.invoke.mockResolvedValueOnce({data: {...protectedRoom, occupiedSeatCount: 2}, error: null})
    await article.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Лобби"]').exists()).toBe(true)
  })

  it.each(['exception', 'wrong-room', 'invalid-count'])('не подтверждает вход при %s', async (kind) => {
    const wrapper = await openList()
    if (kind === 'exception') api.invoke.mockRejectedValueOnce(new Error('private diagnostic'))
    else api.invoke.mockResolvedValueOnce({
      data: {...room, ...(kind === 'wrong-room' ? {id: protectedRoom.id} : {occupiedSeatCount: 4})}, error: null,
    })
    await wrapper.findAll('form')[0].trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe(failureMessage)
    expect(wrapper.find('[aria-label="Лобби"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('private diagnostic')
  })
})