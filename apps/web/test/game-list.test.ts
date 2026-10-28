import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import GameList from '../app/GameList.vue'

const api = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('nuxt/app', () => ({
  useNuxtApp: () => ({ $supabase: { functions: { invoke: api.invoke } } }),
}))
enableAutoUnmount(afterEach)

const room = {
  id: '11111111-1111-4111-8111-111111111111',
  seat_count: 4, occupiedSeatCount: 2, hasPassword: true, turnDurationMinutes: 3,
}
const errorMessage = 'Не удалось загрузить комнаты. Попробуйте ещё раз'

beforeEach(() => {
  vi.resetAllMocks()
  api.invoke.mockResolvedValue({ data: [room], error: null })
})

describe('WEB-003: загрузка списка комнат', () => {
  it('до нажатия не запрашивает список и не сообщает об отсутствии комнат', () => {
    const wrapper = mount(GameList)
    expect(api.invoke).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Комнат пока нет')
    expect(wrapper.text()).not.toContain('Загружаем комнаты…')
    expect(wrapper.text()).not.toContain(errorMessage)
  })

  it('по кнопке отправляет GET и показывает отдельные данные каждой комнаты', async () => {
    const second = { ...room, id: '22222222-2222-4222-8222-222222222222',
      seat_count: 2, occupiedSeatCount: 2, hasPassword: false, turnDurationMinutes: 3 }
    api.invoke.mockResolvedValueOnce({ data: [room, second], error: null })
    const wrapper = mount(GameList)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenCalledExactlyOnceWith('game-list', { method: 'GET' })
    const rows = wrapper.findAll('p').filter((p) => p.text().startsWith('Комната '))
      .map((p) => p.element.parentElement!.textContent)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain(room.id)
    expect(rows[0]).toContain('Всего мест: 4')
    expect(rows[0]).toContain('Занято: 2')
    expect(rows[0]).toContain('Свободно: 2')
    expect(rows[0]).toContain('Пароль: требуется')
    expect(rows[1]).toContain(second.id)
    expect(rows[1]).toContain('Свободно: 0')
    expect(rows[1]).toContain('Пароль: не требуется')
    expect(wrapper.text()).not.toContain('Комнат пока нет')
    expect(wrapper.text()).not.toContain('Загружаем комнаты…')
  })

  it('показывает загрузку и блокирует повторный клик до ответа', async () => {
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const wrapper = mount(GameList)
    await wrapper.get('button').trigger('click')
    expect(wrapper.text()).toContain('Загружаем комнаты…')
    expect(wrapper.text()).not.toContain('Комнат пока нет')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('button').trigger('click')
    expect(api.invoke).toHaveBeenCalledTimes(1)
    resolve({ data: [], error: null })
    await flushPromises()
    expect(wrapper.text()).not.toContain('Загружаем комнаты…')
    expect(wrapper.text()).toContain('Комнат пока нет')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it.each(['response', 'exception'])('показывает ошибку (%s) и позволяет повторить запрос', async (kind) => {
    if (kind === 'response') api.invoke.mockResolvedValueOnce({ data: [room], error: new Error('Private diagnostic') })
    else api.invoke.mockRejectedValueOnce(new Error('Private diagnostic'))
    const wrapper = mount(GameList)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(errorMessage)
    expect(wrapper.text()).not.toContain('Private diagnostic')
    expect(wrapper.text()).not.toContain(room.id)
    expect(wrapper.text()).not.toContain('Комнат пока нет')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain(room.id)
    expect(wrapper.text()).not.toContain(errorMessage)
  })

  it('повторная загрузка заменяет прежний список актуальным пустым ответом', async () => {
    const wrapper = mount(GameList)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(room.id)
    api.invoke.mockResolvedValueOnce({ data: [], error: null })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain(room.id)
    expect(wrapper.text()).toContain('Комнат пока нет')
  })

  const malformed: [string, unknown][] = [
    ...[undefined, null, '3', 0, 11, 2.5].map((minutes): [string, unknown] =>
      ['неверные минуты ' + String(minutes), [{...room, turnDurationMinutes: minutes}]]),
    ['null', null], ['объект вместо списка', room], ['null внутри списка', [null]],
    ['строка внутри списка', ['room']], ['нет полей', [{}]],
    ['неверный ID', [{ ...room, id: 123 }]],
    ['вместимость строкой', [{ ...room, seat_count: '4' }]],
    ['недопустимая вместимость', [{ ...room, seat_count: 5 }]],
    ['дробная вместимость', [{ ...room, seat_count: 2.5 }]],
    ['отрицательная занятость', [{ ...room, occupiedSeatCount: -1 }]],
    ['дробная занятость', [{ ...room, occupiedSeatCount: 1.5 }]],
    ['занято больше вместимости', [{ ...room, occupiedSeatCount: 5 }]],
    ['NaN', [{ ...room, occupiedSeatCount: NaN }]],
    ['Infinity', [{ ...room, occupiedSeatCount: Infinity }]],
    ['флаг пароля строкой', [{ ...room, hasPassword: 'true' }]],
    ['неверная вторая комната', [room, { ...room, seat_count: 0 }]],
  ]
  it.each(malformed)('не отображает неверный ответ (%s), после повтора восстанавливается', async (_name, data) => {
    api.invoke.mockResolvedValueOnce({ data, error: null })
    const wrapper = mount(GameList)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(errorMessage)
    expect(wrapper.text()).not.toContain(room.id)
    expect(wrapper.text()).not.toContain('Комнат пока нет')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(room.id)
    expect(wrapper.text()).not.toContain(errorMessage)
  })
})
