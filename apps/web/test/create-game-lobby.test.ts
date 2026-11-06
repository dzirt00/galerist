import {passiveRealtime} from './helpers/passive-realtime'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils'
import App from '../app/app.vue'
import GameList from '../app/GameList.vue'
import CreateGameForm from '../app/CreateGameForm.vue'

const api = vi.hoisted(() => ({invoke: vi.fn(), authenticated: true}))
vi.mock('nuxt/app', () => ({useNuxtApp: () => ({$supabase: {...passiveRealtime,functions: {invoke: api.invoke}}})}))
vi.mock('../app/composable/auth', async () => {
  const {ref} = await import('vue')
  return {useProfile: () => ({
    profile: ref(api.authenticated ? {id: '11111111-1111-4111-8111-111111111111'} : null),
    isLoadingProfile: ref(false), hasProfileError: ref(false), profileMessage: ref(''), loadProfile: vi.fn(),
  })}
})
enableAutoUnmount(afterEach)

const game = {id: '22222222-2222-4222-8222-222222222222', seat_count: 3,
  occupiedSeatCount: 1, hasPassword: false, turnDurationMinutes: 7}
const dto = {id: game.id, creator_id: '11111111-1111-4111-8111-111111111111',
  seat_count: 3, occupiedSeats: [{user_id: '11111111-1111-4111-8111-111111111111'}],
  hasPassword: false, turnDurationMinutes: 7}

beforeEach(() => {
  vi.resetAllMocks()
  api.authenticated = true
  api.invoke.mockImplementation(async (name, options) => {
    if (name === 'create-game') return {data: dto, error: null}
    if (name === 'change-settings-game') return {data: {
      seat_count: options.body.seatCount, turnDurationMinutes: options.body.turnDurationMinutes,
    }, error: null}
    if (name === 'game-list') return {data: [game], error: null}
    throw new Error('Unexpected call ' + name)
  })
})

async function submit(view: ReturnType<typeof mount>) {
  await view.findAll('button').find(button => button.text().replace(/\s+/g, ' ') === 'Создать комнату')!.trigger('click')
  const form = view.getComponent(CreateGameForm)
  await form.get('input[type="number"]').setValue('3')
  await form.get('select').setValue('7')
  await form.get('form').trigger('submit')
  await flushPromises()
}

describe('WEB-004: созданная комната сразу открывает настройки', () => {
  it('показывает единственное лобби из create-game и позволяет менять таймер без повторного join', async () => {
    const view = mount(App)
    await submit(view)
    expect(api.invoke.mock.calls.map(([name]) => name)).toEqual(['game-list', 'create-game'])
    expect(view.findAll('[aria-label="Лобби"]')).toHaveLength(1)
    expect(view.findComponent(CreateGameForm).exists()).toBe(false)
    const lobby = view.get('[aria-label="Лобби"]')
    expect(lobby.text()).toContain(game.id)
    expect(lobby.text()).toContain('Количество минут на ход игрока 7')
    expect((lobby.get('#lobby-turn-duration').element as HTMLSelectElement).value).toBe('7')
    await lobby.get('#lobby-turn-duration').setValue('5')
    await lobby.findAll('button').find(button => button.text() === 'Изменить')!.trigger('click')
    await flushPromises()
    expect(api.invoke).toHaveBeenLastCalledWith('change-settings-game', {
      body: {gameId: game.id, seatCount: 3, turnDurationMinutes: 5},
    })
    expect(lobby.text()).toContain('Количество минут на ход игрока 5')
    expect(view.findComponent(GameList).exists()).toBe(false)
    expect(view.find('article').exists()).toBe(false)
    expect(api.invoke.mock.calls.map(([name]) => name)).toEqual(['game-list', 'create-game', 'change-settings-game'])
  })

  it.each(['error', 'invalid'])('после %s не открывает лобби, повтор открывает сохранённую комнату', async (kind) => {
    const view = mount(App)
    await flushPromises()
    api.invoke.mockResolvedValueOnce(kind === 'error'
      ? {data: null, error: new Error('offline')}
      : {data: {...dto, turnDurationMinutes: null}, error: null})
    await submit(view)
    expect(view.find('[aria-label="Лобби"]').exists()).toBe(false)
    const form = view.getComponent(CreateGameForm)
    expect(form.get('button[type="submit"]').text()).toBe('Повторить')
    const first = JSON.parse(JSON.stringify(api.invoke.mock.calls[1][1].body))
    await form.get('form').trigger('submit')
    await flushPromises()
    expect(api.invoke.mock.calls[2][1].body).toEqual(first)
    expect(view.get('[aria-label="Лобби"]').text()).toContain('Количество минут на ход игрока 7')
    expect(api.invoke.mock.calls.map(([name]) => name)).toEqual(['game-list', 'create-game', 'create-game'])
  })

  it('создание скрывает список, форму и кнопку создания', async () => {
    const view = mount(App)
    await submit(view)
    expect(view.findComponent(GameList).exists()).toBe(false)
    expect(view.findComponent(CreateGameForm).exists()).toBe(false)
    expect(view.findAll('[aria-label="Лобби"]')).toHaveLength(1)
    expect(view.findAll('button').some(button => button.text().replace(/\s+/g, ' ') === 'Создать комнату')).toBe(false)
  })

  it('запоздалый список, начатый до создания, не удаляет новую комнату', async () => {
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const view = mount(App)
    await view.getComponent(GameList).get('button').trigger('click')
    await submit(view)
    resolve({data: [], error: null})
    await flushPromises()
    expect(view.find('article').exists()).toBe(false)
    expect(view.get('[aria-label="Лобби"]').text()).toContain(game.id)
  })

  it('запоздалый вход в другую комнату не заменяет только что созданную', async () => {
    const other = {...game, id: '33333333-3333-4333-8333-333333333333'}
    api.invoke.mockResolvedValueOnce({data: [other], error: null})
    const view = mount(App)
    await view.getComponent(GameList).get('button').trigger('click')
    await flushPromises()
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise(done => { resolve = done }))
    await view.get('article form').trigger('submit')
    await submit(view)
    resolve({data: other, error: null})
    await flushPromises()
    expect(view.get('[aria-label="Лобби"]').text()).toContain(game.id)
  })


})


describe('WEB-006: открытие и отмена создания', () => {
  it('загружает список автоматически, открывает и отменяет форму без команды создания', async () => {
    const view = mount(App)
    await flushPromises()
    expect(view.findComponent(CreateGameForm).exists()).toBe(false)
    expect(view.get('article').text()).toContain(game.id)
    const open = () => view.findAll('button').find(button => button.text().replace(/\s+/g, ' ') === 'Создать комнату')!
    await open().trigger('click')
    const form = view.getComponent(CreateGameForm)
    await form.get('input[type="number"]').setValue('3')
    await form.findAll('button').find(button => button.text() === 'Отмена')!.trigger('click')
    expect(view.findComponent(CreateGameForm).exists()).toBe(false)
    expect(open()).toBeDefined()
    expect(view.get('article').text()).toContain(game.id)
    expect(api.invoke.mock.calls.map(([name]) => name)).toEqual(['game-list'])
    await open().trigger('click')
    expect((view.get('input[type="number"]').element as HTMLInputElement).value).toBe('')
  })

  it('запрещает отмену во время запроса и после сетевой ошибки, сохраняя повтор', async () => {
    const view = mount(App)
    await flushPromises()
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise(done => { resolve = done }))
    await view.findAll('button').find(button => button.text().replace(/\s+/g, ' ') === 'Создать комнату')!.trigger('click')
    const form = view.getComponent(CreateGameForm)
    await form.get('input[type="number"]').setValue('3')
    await form.get('form').trigger('submit')
    const cancel = form.findAll('button').find(button => button.text() === 'Отмена')!
    expect(cancel.attributes('disabled')).toBeDefined()
    await cancel.trigger('click')
    expect(view.findComponent(CreateGameForm).exists()).toBe(true)
    const original = {...api.invoke.mock.calls[1][1].body}
    resolve({data: null, error: new Error('offline')})
    await flushPromises()
    expect(cancel.attributes('disabled')).toBeDefined()
    expect(form.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    await cancel.trigger('click')
    expect(view.findComponent(CreateGameForm).exists()).toBe(true)
    await form.get('form').trigger('submit')
    await flushPromises()
    expect(api.invoke.mock.calls[2][1].body).toEqual(original)
    expect(view.get('[aria-label="Лобби"]').text()).toContain(game.id)
    expect(view.findComponent(CreateGameForm).exists()).toBe(false)
    expect(view.findAll('button').some(button => button.text().replace(/\s+/g, ' ') === 'Создать комнату')).toBe(false)
  })
})


describe('WEB-006: отдельный экран после входа', () => {
  it.each([false, true])('вход (пароль: %s) скрывает список и открытую форму', async (hasPassword) => {
    api.invoke.mockResolvedValueOnce({data: [{...game, hasPassword}], error: null})
    const view = mount(App)
    await flushPromises()
    await view.findAll('button').find(button => button.text().replace(/\s+/g, ' ') === 'Создать комнату')!.trigger('click')
    if (hasPassword) await view.get('article input').setValue('password')
    api.invoke.mockResolvedValueOnce({data: {...game, hasPassword, occupiedSeatCount: 2}, error: null})
    await view.get('article form').trigger('submit')
    await flushPromises()
    expect(view.findComponent(GameList).exists()).toBe(false)
    expect(view.findComponent(CreateGameForm).exists()).toBe(false)
    expect(view.findAll('[aria-label="Лобби"]')).toHaveLength(1)
    expect(view.get('[aria-label="Лобби"]').text()).toContain(game.id)
    expect(view.get('[aria-label="Лобби"]').text()).toContain('Занято: 2')
    expect(view.findAll('button').some(button => button.text().replace(/\s+/g, ' ') === 'Создать комнату')).toBe(false)
    expect(api.invoke.mock.calls.filter(([name]) => name === 'join-game')).toHaveLength(1)
    expect(api.invoke.mock.calls.some(([name]) => name === 'create-game')).toBe(false)
  })

  it.each(['error', 'wrong-room', 'invalid'])('отказ входа %s сохраняет список без ложного лобби и допускает повтор', async (kind) => {
    const view = mount(App)
    await flushPromises()
    api.invoke.mockResolvedValueOnce(kind === 'error'
      ? {data: null, error: new Error('offline')}
      : {data: {...game, ...(kind === 'wrong-room' ? {id: '33333333-3333-4333-8333-333333333333'} : {occupiedSeatCount: 0})}, error: null})
    await view.get('article form').trigger('submit')
    await flushPromises()
    expect(view.find('[aria-label="Лобби"]').exists()).toBe(false)
    expect(view.getComponent(GameList).text()).toContain('Не удалось присоединиться')
    expect(view.get('article').text()).toContain('Занято: 1')
    api.invoke.mockResolvedValueOnce({data: {...game, occupiedSeatCount: 2}, error: null})
    await view.get('article form').trigger('submit')
    await flushPromises()
    expect(view.findComponent(GameList).exists()).toBe(false)
    expect(view.get('[aria-label="Лобби"]').text()).toContain(game.id)
  })
})


it('до авторизации не монтирует список и не запрашивает комнаты', async () => {
  api.authenticated = false
  const view = mount(App, {global: {stubs: {SignInForm: true}}})
  await flushPromises()
  expect(view.findComponent(GameList).exists()).toBe(false)
  expect(view.findComponent(CreateGameForm).exists()).toBe(false)
  expect(view.find('[aria-label="Лобби"]').exists()).toBe(false)
  expect(api.invoke).not.toHaveBeenCalled()
})

it.each(['resolve', 'reject'])('чтение старой ошибки входа (%s) не меняет созданное лобби', async (outcome) => {
  const view = mount(App)
  await flushPromises()
  let resolve!: (value: unknown) => void
  let reject!: (reason: Error) => void
  const context = new Response('', {status: 409})
  const readBody = vi.fn(() => new Promise((done, fail) => {resolve = done; reject = fail}))
  context.json = readBody
  api.invoke.mockResolvedValueOnce({data: null, error: {context}})
  await view.get('article form').trigger('submit')
  await flushPromises()
  expect(readBody).toHaveBeenCalledOnce()
  const list = view.getComponent(GameList)
  await submit(view)
  expect(view.findComponent(GameList).exists()).toBe(false)
  if (outcome === 'resolve') resolve({error: 'Старый отказ', code: 'OWN_LOBBY_EXISTS', gameId: game.id})
  else reject(new Error('Private read diagnostic'))
  await flushPromises()
  expect(view.get('[aria-label="Лобби"]').text()).toContain(game.id)
  expect(view.text()).not.toContain('Старый отказ')
  expect(view.text()).not.toContain('Вернуться в своё лобби')
  expect(view.text()).not.toContain('Private read diagnostic')
  expect(list.emitted('gameJoined')).toBeUndefined()
  expect(list.emitted('lobbyReturned')).toBeUndefined()
})
