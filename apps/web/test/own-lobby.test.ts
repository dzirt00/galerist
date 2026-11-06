import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils'
import {passiveRealtime} from './helpers/passive-realtime'
import App from '../app/app.vue'
import CreateGameForm from '../app/CreateGameForm.vue'
import GameList from '../app/GameList.vue'

const api = vi.hoisted(() => ({invoke: vi.fn()}))
vi.mock('nuxt/app', () => ({useNuxtApp: () => ({$supabase: {...passiveRealtime, functions: {invoke: api.invoke}}})}))
vi.mock('../app/composable/auth', async () => {
  const {ref} = await import('vue')
  return {useProfile: () => ({
    profile: ref({id: '11111111-1111-4111-8111-111111111111'}),
    isLoadingProfile: ref(false), hasProfileError: ref(false), profileMessage: ref(''), loadProfile: vi.fn(),
  })}
})
enableAutoUnmount(afterEach)
const ownId = '22222222-2222-4222-8222-222222222222'
const foreign = {id: '33333333-3333-4333-8333-333333333333', seat_count: 4,
  occupiedSeatCount: 1, hasPassword: false, turnDurationMinutes: 3}
const own = {...foreign, id: ownId, seat_count: 2, occupiedSeatCount: 2, hasPassword: true, turnDurationMinutes: 7}
function denied(code = 'OWN_LOBBY_EXISTS', gameId: unknown = ownId, status = 409) {
  return {data: null, error: {context: Response.json({error: 'Сообщение сервера', code, gameId}, {status})}}
}
beforeEach(() => {
  vi.resetAllMocks()
  api.invoke.mockImplementation(async (name) => {
    if (name === 'game-list') return {data: [foreign], error: null}
    if (name === 'get-own-lobby') return {data: {...own, password_hash: 'Private hash'}, error: null}
    return denied()
  })
})
type View = ReturnType<typeof mount>
const returnButton = (view: View) => view.findAll('button').find(button => button.text() === 'Вернуться в своё лобби')
async function refuse(view: View, path: string) {
  await flushPromises()
  if (path === 'create') {
    await view.findAll('button').find(button => button.text().replace(/\s+/g, ' ') === 'Создать комнату')!.trigger('click')
    const form = view.getComponent(CreateGameForm)
    await form.get('input[type="number"]').setValue('3')
    await form.get('form').trigger('submit')
  } else {
    const list = view.getComponent(GameList)
    await list.get('button').trigger('click')
    await flushPromises()
    await list.get('form').trigger('submit')
  }
  await flushPromises()
}

describe('WEB-018: возврат в своё лобби', () => {
  it.each(['create', 'join'])('полный путь %s → отказ → кнопка → актуальное единственное лобби', async (path) => {
    const view = mount(App)
    await refuse(view, path)
    expect(view.text()).toContain('Сообщение сервера')
    expect(view.find('[aria-label="Лобби"]').exists()).toBe(false)
    expect(api.invoke.mock.calls.some(([name]) => name === 'get-own-lobby')).toBe(false)
    await returnButton(view)!.trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('get-own-lobby', {body: {gameId: ownId}})
    expect(view.findAll('[aria-label="Лобби"]')).toHaveLength(1)
    expect(view.get('[aria-label="Лобби"]').text()).toContain(ownId)
    expect(view.get('[aria-label="Лобби"]').text()).toContain('Количество минут на ход игрока 7')
    expect(view.get('[aria-label="Лобби"]').text()).toContain('Занято: 2')
    expect(view.get('[aria-label="Лобби"]').text()).toContain('Пароль: требуется')
    expect(view.findComponent(CreateGameForm).exists()).toBe(false)
    expect(returnButton(view)).toBeUndefined()
    expect(view.text()).not.toContain('Private hash')
    expect(api.invoke.mock.calls.filter(([name]) => name === 'join-game')).toHaveLength(path === 'join' ? 1 : 0)
  })
  it.each([
    ['GAME_IN_PROGRESS', ownId, 409], ['LOBBY_MEMBERSHIP_EXISTS', ownId, 409],
    ['LOBBY_NOT_OPEN', ownId, 409], ['UNKNOWN', ownId, 409],
    ['OWN_LOBBY_EXISTS', 'invalid', 409], ['OWN_LOBBY_EXISTS', ownId, 500],
  ])('не предлагает возврат для %s / %s / %s', async (code, gameId, status) => {
    api.invoke.mockImplementation(async () => denied(String(code), gameId, Number(status)))
    const view = mount(App)
    await refuse(view, 'create')
    expect(returnButton(view)).toBeUndefined()
  })
  it('блокирует двойное нажатие, при сетевой ошибке разрешает повтор', async () => {
    const view = mount(App)
    await refuse(view, 'create')
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const button = returnButton(view)!
    await button.trigger('click')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(api.invoke.mock.calls.filter(([name]) => name === 'get-own-lobby')).toHaveLength(1)
    resolve({data: null, error: new Error('Private SDK diagnostic')})
    await flushPromises()
    expect(returnButton(view)!.attributes('disabled')).toBeUndefined()
    expect(view.find('[aria-label="Лобби"]').exists()).toBe(false)
    await returnButton(view)!.trigger('click')
    await flushPromises()
    expect(view.find('[aria-label="Лобби"]').exists()).toBe(true)
  })
  it('показывает серверный отказ, убирает кнопку после закрытия/смены владельца', async () => {
    const view = mount(App)
    await refuse(view, 'create')
    api.invoke.mockResolvedValueOnce({data: null, error: {context: Response.json({error: 'Лобби уже недоступно'}, {status: 404})}})
    await returnButton(view)!.trigger('click')
    await flushPromises()
    expect(view.text()).toContain('Лобби уже недоступно')
    expect(returnButton(view)).toBeUndefined()
    expect(view.find('[aria-label="Лобби"]').exists()).toBe(false)
  })
  it.each([null, {...own, id: foreign.id}, {...own, occupiedSeatCount: 0}, {...own, occupiedSeatCount: 3}])('не открывает лобби по неверному DTO %j', async (data) => {
    const view = mount(App)
    await refuse(view, 'create')
    api.invoke.mockResolvedValueOnce({data, error: null})
    await returnButton(view)!.trigger('click')
    await flushPromises()
    expect(view.text()).toContain('Некорректный ответ сервера')
    expect(view.find('[aria-label="Лобби"]').exists()).toBe(false)
  })
  it('возврат после размонтирования не отправляет событие', async () => {
    const view = mount(GameList)
    await view.get('button').trigger('click')
    await flushPromises()
    await view.get('form').trigger('submit')
    await flushPromises()
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise(done => { resolve = done }))
    await returnButton(view)!.trigger('click')
    view.unmount()
    resolve({data: own, error: null})
    await flushPromises()
    expect(view.emitted('lobbyReturned')).toBeUndefined()
  })
})
