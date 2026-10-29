import {passiveRealtime} from './helpers/passive-realtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import CreateGameForm from '../app/CreateGameForm.vue'

const api = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('nuxt/app', () => ({
  useNuxtApp: () => ({ $supabase: {...passiveRealtime, functions: { invoke: api.invoke } } }),
}))
enableAutoUnmount(afterEach)

const userId = '11111111-1111-4111-8111-111111111111'
const gameId = '33333333-3333-4333-8333-333333333333'
const lobby = {
  id: gameId, creator_id: userId, seat_count: 3, hasPassword: false,
  occupiedSeats: [{ user_id: userId }], turnDurationMinutes: 3,
}
const errorMessage = 'Не удалось получить результат. Повторите запрос с прежними настройками'

beforeEach(() => {
  vi.resetAllMocks()
  api.invoke.mockResolvedValue({ data: lobby, error: null })
})

describe('WEB-002: форма создания комнаты и лобби', () => {
  it.each([1, 7, 10])('сохраняет выбранные %s минут и показывает подтверждённые минуты', async (minutes) => {
    api.invoke.mockResolvedValueOnce({ data: { ...lobby, turnDurationMinutes: minutes }, error: null })
    const wrapper = mount(CreateGameForm)
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('3')
    expect(wrapper.findAll('option').map(option => (option.element as HTMLOptionElement).value))
      .toEqual(Array.from({ length: 10 }, (_, i) => String(i + 1)))
    await wrapper.get('input[type="number"]').setValue('4')
    await wrapper.get('select').setValue(String(minutes))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.invoke.mock.calls[0][1].body.turnDurationMinutes).toBe(minutes)
    expect(wrapper.text()).toContain('Количество минут на ход игрока ' + minutes)
  })

  it('показывает минуты из ответа, даже если они отличаются от запроса', async () => {
    api.invoke.mockResolvedValueOnce({ data: { ...lobby, turnDurationMinutes: 7 }, error: null })
    const wrapper = mount(CreateGameForm)
    await wrapper.get('input[type="number"]').setValue('3')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.invoke.mock.calls[0][1].body.turnDurationMinutes).toBe(3)
    expect(wrapper.text()).toContain('Количество минут на ход игрока 7')
  })

  it.each([2, 3, 4])('отправляет %s места без пароля и показывает сохранённое лобби', async (seatCount) => {
    api.invoke.mockResolvedValueOnce({ data: { ...lobby, seat_count: seatCount }, error: null })
    const wrapper = mount(CreateGameForm)
    await wrapper.get('input[type="number"]').setValue(String(seatCount))
    const event = new Event('submit', { bubbles: true, cancelable: true })
    wrapper.get('form').element.dispatchEvent(event)
    await flushPromises()
    expect(event.defaultPrevented).toBe(true)
    expect(api.invoke).toHaveBeenCalledTimes(1)
    expect(api.invoke).toHaveBeenCalledWith('create-game', {
      body: { seatCount, turnDurationMinutes: 3, requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    })
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain(gameId)
    expect(wrapper.text()).toContain('Занятые места 1')
    expect(wrapper.text()).toContain('Свободные ' + (seatCount - 1))
    expect(wrapper.text()).toContain('Наличие пароля false')
  })

  it.each(['', '1', '5', '2.5'])('отклоняет недопустимое количество мест: "%s" без сервера', async (seatCount) => {
    const wrapper = mount(CreateGameForm)
    await wrapper.get('input[type="number"]').setValue(seatCount)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Укажите число игроков')
    expect(api.invoke).not.toHaveBeenCalled()
    for (const field of wrapper.findAll('input, select')) {
      expect(field.attributes('disabled')).toBeUndefined()
    }
    expect(wrapper.get('button').text()).toBe('Создать комнату')
  })

  it('сохраняет короткий пароль после ошибки и принимает исправление до 8 символов', async () => {
    const wrapper = mount(CreateGameForm)
    await wrapper.get('input[type="number"]').setValue('3')
    const password = wrapper.get('input[type="password"]')
    await password.setValue('1234567')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Минимальное количество символов пароля 8')
    expect((password.element as HTMLInputElement).value).toBe('1234567')
    expect(api.invoke).not.toHaveBeenCalled()
    expect(password.attributes('disabled')).toBeUndefined()
    await password.setValue('12345678')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.invoke).toHaveBeenCalledWith('create-game', {
      body: { seatCount: 3, turnDurationMinutes: 3, requestId: expect.any(String), password: '12345678' },
    })
  })

  it('позволяет очистить короткий пароль и отправить запрос без пароля', async () => {
    const wrapper = mount(CreateGameForm)
    await wrapper.get('input[type="number"]').setValue('2')
    await wrapper.get('input[type="password"]').setValue('1234567')
    await wrapper.get('form').trigger('submit')
    expect(api.invoke).not.toHaveBeenCalled()
    await wrapper.get('input[type="password"]').setValue('')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.invoke.mock.calls[0][1].body).not.toHaveProperty('password')
  })

  it('показывает ожидание, блокирует двойную отправку и завершает ожидание после успеха', async () => {
    let resolve!: (result: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const wrapper = mount(CreateGameForm)
    await wrapper.get('input[type="number"]').setValue('3')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Создаём комнату…')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    for (const field of wrapper.findAll('input, select')) {
      expect(field.attributes('disabled')).toBeDefined()
    }
    await wrapper.get('form').trigger('submit')
    expect(api.invoke).toHaveBeenCalledTimes(1)
    resolve({ data: lobby, error: null })
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain(gameId)
    expect(wrapper.text()).not.toContain('Создаём комнату…')
  })

  it.each(['response', 'exception'])('после ошибки (%s) повторяет исходный запрос и показывает ответ сервера', async (kind) => {
    if (kind === 'response') api.invoke.mockResolvedValueOnce({ data: null, error: new Error('offline') })
    else api.invoke.mockRejectedValueOnce(new Error('offline'))
    api.invoke.mockResolvedValueOnce({ data: { ...lobby, hasPassword: true }, error: null })
    const wrapper = mount(CreateGameForm)
    await wrapper.get('input[type="number"]').setValue('3')
    await wrapper.get('select').setValue('7')
    await wrapper.get('input[type="password"]').setValue(' original password ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain(errorMessage)
    expect(wrapper.text()).not.toContain(gameId)
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('button').text()).toBe('Повторить')
    for (const field of wrapper.findAll('input, select')) {
      expect(field.attributes('disabled')).toBeDefined()
    }
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('7')
    const firstRequest = JSON.parse(JSON.stringify(api.invoke.mock.calls[0][1].body))
    expect(firstRequest.turnDurationMinutes).toBe(7)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.invoke.mock.calls[1][1].body).toEqual(firstRequest)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Свободные 2')
    expect(wrapper.text()).toContain('Наличие пароля true')
    expect(wrapper.text()).not.toContain('original password')
    expect(wrapper.text()).not.toContain('changed password')
  })

  const malformed: [string, unknown][] = [
    ['null', null], ['массив', []], ['нет полей', {}],
    ...[undefined, null, '3', 0, 11, 2.5].map((minutes): [string, unknown] =>
      ['неверные минуты ' + String(minutes), { ...lobby, turnDurationMinutes: minutes }]),
    ['неверный id', { ...lobby, id: null }],
    ['неверный creator_id', { ...lobby, creator_id: null }],
    ['неверная вместимость', { ...lobby, seat_count: 5 }],
    ['строка вместо признака пароля', { ...lobby, hasPassword: 'true' }],
    ['нет массива мест', { ...lobby, occupiedSeats: null }],
    ['пустые места', { ...lobby, occupiedSeats: [] }],
    ['места строками', { ...lobby, occupiedSeats: [userId] }],
    ['один неверный элемент', { ...lobby, occupiedSeats: [{ user_id: userId }, null] }],
    ['неверный user_id', { ...lobby, occupiedSeats: [{ user_id: 123 }] }],
  ]
  it.each(malformed)('не показывает лобби при неверном DTO (%s) и разрешает повтор', async (_name, data) => {
    api.invoke.mockResolvedValueOnce({ data, error: null })
    const wrapper = mount(CreateGameForm)
    await wrapper.get('input[type="number"]').setValue('3')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain(errorMessage)
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Занятые места')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('button').text()).toBe('Повторить')
    for (const field of wrapper.findAll('input, select')) {
      expect(field.attributes('disabled')).toBeDefined()
    }
    const original = JSON.parse(JSON.stringify(api.invoke.mock.calls[0][1].body))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.invoke.mock.calls[1][1].body).toEqual(original)
    expect(wrapper.find('form').exists()).toBe(false)
  })
})
