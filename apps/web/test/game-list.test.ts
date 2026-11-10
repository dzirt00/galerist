import {passiveRealtime} from './helpers/passive-realtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import GameList from '../app/GameList.vue'

const api = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('nuxt/app', () => ({
  useNuxtApp: () => ({ $supabase: {...passiveRealtime, functions: { invoke: api.invoke } } }),
}))
enableAutoUnmount(afterEach)

const room = {display_name: 'anna',
  id: '11111111-1111-4111-8111-111111111111',
  seat_count: 4, occupiedSeatCount: 2, hasPassword: true, turnDurationMinutes: 3,
}
const errorMessage = 'Не удалось загрузить комнаты. Попробуйте ещё раз'

beforeEach(() => {
  vi.resetAllMocks()
  api.invoke.mockResolvedValue({ data: [room], error: null })
})

describe('WEB-003: загрузка списка комнат', () => {
  it('WEB-009: показывает имя из DTO текстом, сохраняя UUID только в запросе входа', async () => {
    const named = {...room, display_name: '<b>anna</b>'}
    api.invoke.mockResolvedValueOnce({data: [named], error: null})
    const wrapper = mount(GameList)
    await flushPromises()
    const card = wrapper.get('article')
    expect(card.attributes('aria-label')).toBe('Комната <b>anna</b>')
    expect(card.text()).toContain('Комната <b>anna</b>')
    expect(card.text()).not.toContain(room.id)
    expect(card.find('b').exists()).toBe(false)
    api.invoke.mockResolvedValueOnce({data: named, error: null})
    await card.get('form').trigger('submit')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('join-game', {body: {gameId: room.id}})
    expect(wrapper.emitted('gameJoined')).toEqual([[named]])
  })

  it.each([undefined, null, '', '   ', 42])('WEB-009: отклоняет имя комнаты %s и разрешает повтор', async display_name => {
    api.invoke.mockResolvedValueOnce({data: [{...room, display_name}], error: null})
    const wrapper = mount(GameList)
    await flushPromises()
    expect(wrapper.find('article').exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toBe(errorMessage)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('article').text()).toContain(room.display_name)
  })

  it('WEB-009: сохраняет имя длиной 30 символов', async () => {
    const display_name = 'abcdefghijklmnopqrstuvwxyz1234'
    api.invoke.mockResolvedValueOnce({data: [{...room, display_name}], error: null})
    const wrapper = mount(GameList)
    await flushPromises()
    expect(wrapper.get('article').text()).toContain(display_name)
  })
  it('при монтировании запрашивает список и показывает ожидание без ложного пустого результата', async () => {
    const wrapper = mount(GameList)
    expect(api.invoke).toHaveBeenCalledExactlyOnceWith('game-list', { method: 'GET' })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('Комнат пока нет')
    expect(wrapper.text()).toContain('Загружаем комнаты…')
    expect(wrapper.text()).not.toContain(errorMessage)
  })

  it('при монтировании отправляет GET и показывает отдельные данные каждой комнаты', async () => {
    const second = { ...room, display_name: 'boris', id: '22222222-2222-4222-8222-222222222222',
      seat_count: 2, occupiedSeatCount: 2, hasPassword: false, turnDurationMinutes: 3 }
    api.invoke.mockResolvedValueOnce({ data: [room, second], error: null })
    const wrapper = mount(GameList)
    await flushPromises()
    expect(api.invoke).toHaveBeenCalledExactlyOnceWith('game-list', { method: 'GET' })
    const rows = wrapper.findAll('p').filter((p) => p.text().startsWith('Комната '))
      .map((p) => p.element.parentElement!.textContent)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain(room.display_name)
    expect(rows[0]).toContain('Всего мест: 4')
    expect(rows[0]).toContain('Занято: 2')
    expect(rows[0]).toContain('Свободно: 2')
    expect(rows[0]).toContain('Пароль: требуется')
    expect(rows[1]).toContain(second.display_name)
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
    await flushPromises()
    expect(wrapper.text()).toContain(errorMessage)
    expect(wrapper.text()).not.toContain('Private diagnostic')
    expect(wrapper.text()).not.toContain(room.display_name)
    expect(wrapper.text()).not.toContain('Комнат пока нет')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain(room.display_name)
    expect(wrapper.text()).not.toContain(errorMessage)
  })

  it('повторная загрузка заменяет прежний список актуальным пустым ответом', async () => {
    const wrapper = mount(GameList)
    await flushPromises()
    expect(wrapper.text()).toContain(room.display_name)
    api.invoke.mockResolvedValueOnce({ data: [], error: null })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain(room.display_name)
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
    await flushPromises()
    expect(wrapper.text()).toContain(errorMessage)
    expect(wrapper.text()).not.toContain(room.display_name)
    expect(wrapper.text()).not.toContain('Комнат пока нет')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(room.display_name)
    expect(wrapper.text()).not.toContain(errorMessage)
  })
})


describe('WEB-014: поиск и заполненные комнаты', () => {
  const noMatches = 'По вашему запросу ничего не найдено'
  const anna = {...room, display_name: 'анна'}
  const boris = {...room, id: '22222222-2222-4222-8222-222222222222',
    display_name: 'борис', seat_count: 2, occupiedSeatCount: 2}

  it('ищет по части имени без регистра и крайних пробелов, очистка возвращает все карточки без запроса', async () => {
    api.invoke.mockResolvedValueOnce({data: [anna, boris], error: null})
    const view = mount(GameList)
    await flushPromises()
    const search = view.get('#searchQuery')
    expect(view.get('label[for="searchQuery"]').text()).toContain('поиск')
    await search.setValue(' АН ')
    expect(view.findAll('article')).toHaveLength(1)
    expect(view.get('article').text()).toContain('анна')
    await search.setValue('неттакого')
    expect(view.findAll('article')).toHaveLength(0)
    expect(view.text()).toContain(noMatches)
    expect(view.text()).not.toContain('Комнат пока нет')
    expect(view.find('#searchQuery').exists()).toBe(true)
    await search.setValue('')
    expect(view.findAll('article')).toHaveLength(2)
    expect(view.text()).not.toContain(noMatches)
    expect(api.invoke).toHaveBeenCalledTimes(1)
  })

  it('отличает пустой список от отсутствия совпадений и оставляет поиск доступным', async () => {
    api.invoke.mockResolvedValueOnce({data: [], error: null})
    const view = mount(GameList)
    await flushPromises()
    await view.get('#searchQuery').setValue('анна')
    expect(view.text()).toContain('Комнат пока нет')
    expect(view.text()).not.toContain(noMatches)
  })

  it('скрывает отсутствие совпадений при обновлении и ошибке, повтор применяет сохранённый запрос', async () => {
    api.invoke.mockResolvedValueOnce({data: [anna], error: null})
    const view = mount(GameList)
    await flushPromises()
    await view.get('#searchQuery').setValue('бор')
    expect(view.text()).toContain(noMatches)
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise(done => {resolve = done}))
    await view.get('button').trigger('click')
    expect(view.text()).toContain('Загружаем комнаты…')
    expect(view.text()).not.toContain(noMatches)
    resolve({data: null, error: {context: Response.json({error: 'Ошибка списка'}, {status: 500})}})
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toBe('Ошибка списка')
    expect(view.text()).not.toContain(noMatches)
    api.invoke.mockResolvedValueOnce({data: [anna, boris], error: null})
    await view.get('button').trigger('click')
    await flushPromises()
    expect(view.findAll('article')).toHaveLength(1)
    expect(view.get('article').text()).toContain('борис')
    expect(view.text()).not.toContain('Ошибка списка')
  })

  it('показывает полную комнату и не отправляет её форму, свободная комната сохраняет серверную проверку', async () => {
    api.invoke.mockResolvedValueOnce({data: [anna, boris], error: null})
    const view = mount(GameList)
    await flushPromises()
    await view.get('#searchQuery').setValue('бор')
    const full = view.get('article')
    expect(full.text()).toContain('Нет свободных мест')
    expect(full.get('button').attributes('disabled')).toBeDefined()
    await full.get('form').trigger('submit')
    expect(api.invoke).toHaveBeenCalledTimes(1)
    expect(view.emitted('gameJoined')).toBeUndefined()
    await view.get('#searchQuery').setValue('ан')
    expect(view.get('article button').attributes('disabled')).toBeUndefined()
    api.invoke.mockResolvedValueOnce({data: null, error: {
      context: Response.json({error: 'В комнате больше нет мест'}, {status: 409}),
    }})
    await view.get('article form').trigger('submit')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('join-game', {body: {gameId: anna.id}})
    expect(view.text()).toContain('В комнате больше нет мест')
    expect(view.emitted('gameJoined')).toBeUndefined()
    expect(view.get('article').text()).toContain('Занято: 2')
  })
})

describe('WEB-006: ответ после размонтирования', () => {
  it('не читает тело поздней серверной ошибки после удаления списка', async () => {
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const view = mount(GameList)
    await view.vm.$nextTick()
    expect(view.text()).toContain('Загружаем комнаты…')
    view.unmount()
    const context = Response.json({error: 'Поздняя ошибка'}, {status: 500})
    const read = vi.spyOn(context, 'json')
    resolve({data: null, error: {context}})
    await flushPromises()
    expect(read).not.toHaveBeenCalled()
    expect(api.invoke).toHaveBeenCalledTimes(1)
  })
})
