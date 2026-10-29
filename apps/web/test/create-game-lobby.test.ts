import {passiveRealtime} from './helpers/passive-realtime'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils'
import App from '../app/app.vue'
import GameList from '../app/GameList.vue'
import CreateGameForm from '../app/CreateGameForm.vue'

const api = vi.hoisted(() => ({invoke: vi.fn()}))
vi.mock('nuxt/app', () => ({useNuxtApp: () => ({$supabase: {...passiveRealtime,functions: {invoke: api.invoke}}})}))
vi.mock('../app/composable/auth', () => ({useProfile: () => ({
  profile: {id: '11111111-1111-4111-8111-111111111111'},
  isLoadingProfile: false, hasProfileError: false, profileMessage: '', loadProfile: vi.fn(),
})}))
enableAutoUnmount(afterEach)

const game = {id: '22222222-2222-4222-8222-222222222222', seat_count: 3,
  occupiedSeatCount: 1, hasPassword: false, turnDurationMinutes: 7}
const dto = {id: game.id, creator_id: '11111111-1111-4111-8111-111111111111',
  seat_count: 3, occupiedSeats: [{user_id: '11111111-1111-4111-8111-111111111111'}],
  hasPassword: false, turnDurationMinutes: 7}

beforeEach(() => {
  vi.resetAllMocks()
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
  const form = view.getComponent(CreateGameForm)
  await form.get('input[type="number"]').setValue('3')
  await form.get('select').setValue('7')
  await form.get('form').trigger('submit')
  await flushPromises()
}

describe('WEB-004: созданная комната сразу открывает настройки', () => {
  it('показывает единственное лобби из create-game и позволяет менять таймер без join/list', async () => {
    const view = mount(App)
    await submit(view)
    expect(api.invoke.mock.calls.map(([name]) => name)).toEqual(['create-game'])
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
    expect(view.get('article').text()).toContain('Количество минут на ход игрока 5')
    expect(api.invoke.mock.calls.map(([name]) => name)).toEqual(['create-game', 'change-settings-game'])
  })

  it.each(['error', 'invalid'])('после %s не открывает лобби, повтор открывает сохранённую комнату', async (kind) => {
    api.invoke.mockResolvedValueOnce(kind === 'error'
      ? {data: null, error: new Error('offline')}
      : {data: {...dto, turnDurationMinutes: null}, error: null})
    const view = mount(App)
    await submit(view)
    expect(view.find('[aria-label="Лобби"]').exists()).toBe(false)
    const form = view.getComponent(CreateGameForm)
    expect(form.get('button').text()).toBe('Повторить')
    const first = JSON.parse(JSON.stringify(api.invoke.mock.calls[0][1].body))
    await form.get('form').trigger('submit')
    await flushPromises()
    expect(api.invoke.mock.calls[1][1].body).toEqual(first)
    expect(view.get('[aria-label="Лобби"]').text()).toContain('Количество минут на ход игрока 7')
    expect(api.invoke.mock.calls.map(([name]) => name)).toEqual(['create-game', 'create-game'])
  })

  it('обновление списка не сбрасывает лобби созданной комнаты и не дублирует карточку', async () => {
    const view = mount(App)
    await submit(view)
    await view.getComponent(GameList).get('button').trigger('click')
    await flushPromises()
    expect(view.findAll('article')).toHaveLength(1)
    expect(view.findAll('[aria-label="Лобби"]')).toHaveLength(1)
    expect(view.get('[aria-label="Лобби"]').text()).toContain('Количество минут на ход игрока 7')
  })

  it('запоздалый список, начатый до создания, не удаляет новую комнату', async () => {
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const view = mount(App)
    await view.getComponent(GameList).get('button').trigger('click')
    await submit(view)
    resolve({data: [], error: null})
    await flushPromises()
    expect(view.get('article').text()).toContain(game.id)
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

  it('ответ настроек прежней комнаты не изменяет созданную комнату', async () => {
    const other = {...game, id: '33333333-3333-4333-8333-333333333333'}
    api.invoke.mockResolvedValueOnce({data: [other], error: null})
    const view = mount(App)
    await view.getComponent(GameList).get('button').trigger('click')
    await flushPromises()
    api.invoke.mockResolvedValueOnce({data: other, error: null})
    await view.get('article form').trigger('submit')
    await flushPromises()
    const oldLobby = view.get('[aria-label="Лобби"]')
    await oldLobby.get('#lobby-turn-duration').setValue('10')
    let resolve!: (value: unknown) => void
    api.invoke.mockReturnValueOnce(new Promise(done => { resolve = done }))
    await oldLobby.findAll('button').find(button => button.text() === 'Изменить')!.trigger('click')
    await submit(view)
    resolve({data: {seat_count: 3, turnDurationMinutes: 10}, error: null})
    await flushPromises()
    expect(view.get('[aria-label="Лобби"]').text()).toContain(game.id)
    expect(view.get('[aria-label="Лобби"]').text()).toContain('Количество минут на ход игрока 7')
    expect(view.getComponent(GameList).get('button').attributes('disabled')).toBeUndefined()
  })
})
