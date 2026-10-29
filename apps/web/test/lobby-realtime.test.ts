import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils'
import GameLobby from '../app/GameLobby.vue'
import GameList from '../app/GameList.vue'

const api = vi.hoisted(() => ({invoke: vi.fn(), channel: vi.fn(), removeChannel: vi.fn()}))
vi.mock('nuxt/app', () => ({useNuxtApp: () => ({$supabase: {
  functions: {invoke: api.invoke}, channel: api.channel, removeChannel: api.removeChannel,
}})}))
enableAutoUnmount(afterEach)

const room = {id: '11111111-1111-4111-8111-111111111111', seat_count: 3,
  occupiedSeatCount: 2, hasPassword: false, turnDurationMinutes: 3}
const user = '22222222-2222-4222-8222-222222222222'
const roster = (isReady: boolean) => ({data: {gameId: room.id,
  players: [{user_id: user, isReady}]}, error: null})
type Connection = {
  topic: string
  options: unknown
  event: string
  receive: () => void
  status: (value: string) => void
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}
let connections: Connection[]

function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise((done) => { resolve = done })
  return {promise, resolve}
}
const reads = () => api.invoke.mock.calls.filter(([name]) => name === 'get-game-players')
const rows = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('p')
  .filter((row) => row.find('span').exists()).map((row) => row.text())

beforeEach(() => {
  vi.resetAllMocks()
  connections = []
  api.removeChannel.mockResolvedValue('ok')
  api.channel.mockImplementation((topic, options) => {
    const connection = {topic, options} as Connection
    connection.on = vi.fn((type, filter, handler) => {
      expect(type).toBe('broadcast')
      connection.event = filter.event
      connection.receive = handler
      return connection
    })
    connection.subscribe = vi.fn((handler) => {
      connection.status = handler
      return connection
    })
    connections.push(connection)
    return connection
  })
  api.invoke.mockImplementation(async (name, options) => {
    if (name === 'game-list') return {data: [room, {...room, id: 'other-room'}], error: null}
    if (name === 'join-game') return {data: {...room, id: options.body.gameId}, error: null}
    if (name === 'get-game-players') return roster(false)
    if (name === 'ready-to-game') return {data: {isReady: options.body.isReady}, error: null}
    if (name === 'change-settings-game') return {data: {seat_count: 3, turnDurationMinutes: 3}, error: null}
    throw new Error('Unexpected endpoint')
  })
})

describe('WEB-004: уведомление Realtime → подтверждённый состав', () => {
  it('подписывается на приватную комнату и читает состав только после подключения', async () => {
    const wrapper = mount(GameLobby, {props: {joinedGame: room}})
    expect(api.channel).toHaveBeenCalledWith(`lobby:${room.id}`, {config: {private: true}})
    expect(connections[0]!.event).toBe('data is changed')
    expect(reads()).toHaveLength(0)
    connections[0]!.status('SUBSCRIBED')
    await flushPromises()
    expect(reads()).toEqual([['get-game-players', {body: {gameId: room.id}}]])
    expect(rows(wrapper)).toEqual([`${user}не готов`])
    expect(wrapper.emitted('busyChange')?.at(-1)).toEqual([false])
  })

  it('по сигналам показывает подтверждение и снятие готовности другого участника', async () => {
    const wrapper = mount(GameLobby, {props: {joinedGame: room}})
    connections[0]!.status('SUBSCRIBED')
    await flushPromises()
    api.invoke.mockResolvedValueOnce(roster(true))
    connections[0]!.receive()
    await flushPromises()
    expect(rows(wrapper)).toEqual([`${user}готов`])
    connections[0]!.receive()
    await flushPromises()
    expect(rows(wrapper)).toEqual([`${user}не готов`])
    expect(reads()).toHaveLength(3)
  })

  it('объединяет сигналы во время чтения в один запрос после текущего', async () => {
    const wrapper = mount(GameLobby, {props: {joinedGame: room}})
    const pending = deferred()
    api.invoke.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(roster(true))
    connections[0]!.status('SUBSCRIBED')
    connections[0]!.receive()
    connections[0]!.receive()
    expect(reads()).toHaveLength(1)
    pending.resolve(roster(false))
    await flushPromises()
    expect(reads()).toHaveLength(2)
    expect(rows(wrapper)).toEqual([`${user}готов`])
  })

  it.each(['ready', 'settings'])('откладывает сигнал до завершения %s', async (operation) => {
    const wrapper = mount(GameLobby, {props: {joinedGame: room}})
    const pending = deferred()
    api.invoke.mockReturnValueOnce(pending.promise)
    const buttons = wrapper.findAll('button')
    await buttons[operation === 'ready' ? 0 : 2]!.trigger('click')
    connections[0]!.receive()
    connections[0]!.receive()
    expect(reads()).toHaveLength(0)
    pending.resolve({data: operation === 'ready' ? {isReady: true}
      : {seat_count: 3, turnDurationMinutes: 3}, error: null})
    await flushPromises()
    expect(reads()).toHaveLength(1)
    expect(wrapper.emitted('busyChange')?.at(-1)).toEqual([false])
  })

  it.each(['CHANNEL_ERROR', 'TIMED_OUT'])('показывает %s и позволяет ручное чтение', async (status) => {
    const wrapper = mount(GameLobby, {props: {joinedGame: room}})
    connections[0]!.status(status)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Не удалось подключить')
    await wrapper.findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(rows(wrapper)).toEqual([`${user}не готов`])
  })

  it('отклоняет состав другой комнаты и позволяет повтор по сигналу', async () => {
    const wrapper = mount(GameLobby, {props: {joinedGame: room}})
    api.invoke.mockResolvedValueOnce({data: {gameId: 'other', players: roster(true).data.players}, error: null})
    connections[0]!.status('SUBSCRIBED')
    await flushPromises()
    expect(rows(wrapper)).toEqual([])
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    connections[0]!.receive()
    await flushPromises()
    expect(rows(wrapper)).toEqual([`${user}не готов`])
  })

  it('после закрытия удаляет канал, игнорирует старые сигналы и не запускает отложенный запрос', async () => {
    const onBusyChange = vi.fn()
    const wrapper = mount(GameLobby, {props: {joinedGame: room}, attrs: {onBusyChange}})
    const pending = deferred()
    api.invoke.mockReturnValueOnce(pending.promise)
    connections[0]!.status('SUBSCRIBED')
    connections[0]!.receive()
    wrapper.unmount()
    expect(api.removeChannel).toHaveBeenCalledWith(connections[0])
    const busy = onBusyChange.mock.calls.length
    connections[0]!.receive()
    connections[0]!.status('CHANNEL_ERROR')
    connections[0]!.status('SUBSCRIBED')
    pending.resolve(roster(true))
    await flushPromises()
    expect(reads()).toHaveLength(1)
    expect(onBusyChange).toHaveBeenCalledTimes(busy)
  })

  it('без комнаты не создаёт подписку', () => {
    mount(GameLobby, {props: {joinedGame: null}})
    expect(api.channel).not.toHaveBeenCalled()
  })

  it('после входа участника обновляет состав и оба счётчика только выбранной комнаты', async () => {
    const wrapper = mount(GameList)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    await wrapper.findAll('form')[0]!.trigger('submit')
    await flushPromises()
    connections[0]!.status('SUBSCRIBED')
    await flushPromises()
    const lobby = wrapper.get('[aria-label="Лобби"]')
    const card = wrapper.get(`[aria-label="Комната ${room.id}"]`)
    const other = wrapper.get('[aria-label="Комната other-room"]')
    expect(lobby.text()).toContain('Занято: 1')
    expect(card.text()).toContain('Свободно: 2')
    const otherBefore = other.text()
    const pending = deferred()
    api.invoke.mockReturnValueOnce(pending.promise)
    connections[0]!.receive()
    await flushPromises()
    expect(lobby.text()).toContain('Занято: 1')
    pending.resolve({data: {gameId: room.id, players: [
      {user_id: user, isReady: false}, {user_id: 'new-participant', isReady: false},
    ]}, error: null})
    await flushPromises()
    for (const view of [lobby, card]) {
      expect(view.text()).toContain('Занято: 2')
      expect(view.text()).toContain('Свободно: 1')
      expect(view.text()).toContain('Всего мест: 3')
    }
    expect(lobby.text()).toContain('new-participant')
    expect(other.text()).toBe(otherBefore)
    // Readiness notification still uses the same roster path and does not add seats.
    api.invoke.mockResolvedValueOnce({data: {gameId: room.id, players: [
      {user_id: user, isReady: true}, {user_id: 'new-participant', isReady: false},
    ]}, error: null})
    connections[0]!.receive()
    await flushPromises()
    expect(rows(wrapper)[0]).toBe(`${user}готов`)
    expect(lobby.text()).toContain('Занято: 2')
  })

  it.each(['error', 'wrong-room'])('не меняет занятость по %s, повтор обновляет оба представления', async (kind) => {
    const wrapper = mount(GameList)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    await wrapper.findAll('form')[0]!.trigger('submit')
    await flushPromises()
    connections[0]!.status('SUBSCRIBED')
    await flushPromises()
    api.invoke.mockResolvedValueOnce(kind === 'error'
      ? {data: null, error: new Error('network')}
      : {data: {gameId: 'other-room', players: []}, error: null})
    connections[0]!.receive()
    await flushPromises()
    for (const selector of ['[aria-label="Лобби"]', `[aria-label="Комната ${room.id}"]`]) {
      expect(wrapper.get(selector).text()).toContain('Занято: 1')
    }
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    api.invoke.mockResolvedValueOnce({data: {gameId: room.id, players: [
      {user_id: user, isReady: false}, {user_id: 'new-participant', isReady: false},
    ]}, error: null})
    connections[0]!.receive()
    await flushPromises()
    expect(wrapper.get('[aria-label="Лобби"]').text()).toContain('Занято: 2')
    expect(wrapper.get(`[aria-label="Комната ${room.id}"]`).text()).toContain('Занято: 2')
  })
})
