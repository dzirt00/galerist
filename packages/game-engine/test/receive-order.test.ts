import { describe, expect, it } from 'vitest'
import * as engine from '../src/index.js'
import { receiveOrder, restoreGameState, projectGameForViewer, projectEventsForViewer,
  type GameState, type StatusPlayer } from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function scenario() {
  return startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
}
function withStatus(state: GameState, playerId: string, status: StatusPlayer): GameState {
  return { ...state, players: state.players.map(player => player.id === playerId
    ? { ...player, status } : player) }
}

describe('ORDER-001/002: receiveOrder через публичный API', () => {
  it('экспортирует оркестратор и исключает три обходных входа', () => {
    expect(engine.receiveOrder).toBeTypeOf('function')
    for (const name of ['changeStatusPlayer', 'actionOrderMarket', 'refreshOrderMarket']) {
      expect(engine).not.toHaveProperty(name)
    }
  })

  it('из WAITING обновляет один раз и сохраняет область после DECLINE', () => {
    const input = structuredClone(scenario())
    const before = structuredClone(input)
    const playerId = input.activePlayerId
    const refreshed = receiveOrder(input, playerId, 'REFRESH')
    expect(refreshed.state.players.find(player => player.id === playerId)!.status).toBe('REFRESH')
    expect(Object.values(refreshed.state.orderMarket.visibleOrders))
      .toEqual(input.orderMarket.remainingOrderIds.slice(0, 4))
    expect(refreshed.state.orderMarket.remainingOrderIds).toEqual(input.orderMarket.remainingOrderIds.slice(4))
    for (const key of [1, 2, 3, 4] as const) {
      const previous = input.orderMarket.visibleOrders[key]
      expect(refreshed.state.orderMarket.orderMarket[key]).toEqual([
        ...input.orderMarket.orderMarket[key], ...(previous === null ? [] : [previous]),
      ])
    }
    expect(refreshed.events).toEqual([{ type: 'OrderMarketRefreshed', playerId }])
    expect(refreshed.state.runtimeRng).toEqual(input.runtimeRng)
    expect(refreshed.state.playerBoards).toEqual(input.playerBoards)
    expect(refreshed.state.ticketOffice).toEqual(input.ticketOffice)
    expect(refreshed.state.players.filter(player => player.id !== playerId))
      .toEqual(input.players.filter(player => player.id !== playerId))
    const frozenBefore = structuredClone(refreshed.state)
    expect(() => receiveOrder(refreshed.state, playerId, 'REFRESH')).toThrow()
    expect(refreshed.state).toEqual(frozenBefore)
    const declined = receiveOrder(refreshed.state, playerId, 'DECLINE')
    expect(declined.state).toEqual(withStatus(refreshed.state, playerId, 'REFUSAL'))
    expect(declined.events).toEqual([])
    expect(() => receiveOrder(declined.state, playerId, 'REFRESH')).toThrow()
    expect(input).toEqual(before)
    expect(Object.isFrozen(input.orderMarket)).toBe(false)
    expect(Object.isFrozen(input.players[0]!.ticketsByColor)).toBe(false)
    expect(Object.isFrozen(refreshed.state.orderMarket)).toBe(true)
    expect(Object.isFrozen(refreshed.events[0])).toBe(true)
  })

  it('продолжает восстановленный PENDING и REFRESH из схемы 12', () => {
    const initial = scenario()
    const playerId = initial.activePlayerId
    const pending = restoreGameState(JSON.parse(JSON.stringify(withStatus(initial, playerId, 'PENDING'))))
    const refreshed = receiveOrder(pending, playerId, 'REFRESH')
    expect(refreshed).toEqual(receiveOrder(initial, playerId, 'REFRESH'))
    const restored = restoreGameState(JSON.parse(JSON.stringify(refreshed.state)))
    expect(restored.stateSchemaVersion).toBe(12)
    expect(() => receiveOrder(restored, playerId, 'REFRESH')).toThrow()
    const declined = receiveOrder(restored, playerId, 'DECLINE')
    expect(declined).toEqual(receiveOrder(refreshed.state, playerId, 'DECLINE'))
    expect(restoreGameState(JSON.parse(JSON.stringify(declined.state)))).toEqual(declined.state)
  })

  it.each([0, 1, 2, 3])('при остатке %s карт передаёт переработку, RNG и скрытую проекцию', remaining => {
    const input = structuredClone(scenario())
    const playerId = input.activePlayerId
    const cards = input.orderMarket.remainingOrderIds
    const source = { ...input, orderMarket: { ...input.orderMarket,
      remainingOrderIds: cards.slice(0, remaining), orderDiscard: cards.slice(remaining),
    } }
    const before = structuredClone(source)
    const refreshed = receiveOrder(source, playerId, 'REFRESH')
    expect(refreshed.events).toEqual([
      { type: 'OrderDeckRecycled', playerId }, { type: 'OrderMarketRefreshed', playerId },
    ])
    expect(refreshed.state.runtimeRng.runtimeRngCounters['orders/recycle']).toBeGreaterThan(0)
    expect(refreshed.state.orderMarket.orderDiscard).toEqual([])
    expect(Object.values(refreshed.state.orderMarket.orderMarket)).toEqual([[], [], [], []])
    expect(receiveOrder(restoreGameState(JSON.parse(JSON.stringify(source))), playerId, 'REFRESH'))
      .toEqual(refreshed)
    const declined = receiveOrder(refreshed.state, playerId, 'DECLINE')
    expect(declined.state).toEqual(withStatus(refreshed.state, playerId, 'REFUSAL'))
    expect(declined.events).toEqual([])
    for (const viewer of [null, ...input.players.map(player => player.id)]) {
      const projection = projectGameForViewer(declined.state, viewer)
      expect(projection).not.toHaveProperty('runtimeRng')
      expect(projection.orderMarket).toEqual({ visibleOrders: refreshed.state.orderMarket.visibleOrders,
        remainingOrderCount: refreshed.state.orderMarket.remainingOrderIds.length })
      expect(projectEventsForViewer(refreshed.events, refreshed.state, viewer)).toEqual(refreshed.events)
    }
    expect(source).toEqual(before)
  })

  it.each(['WAITING', 'PENDING'] as const)('недостаток карт сохраняет %s без частичного начала', status => {
    const initial = scenario()
    const input = structuredClone(withStatus({ ...initial, orderMarket: {
      visibleOrders: { 1: initial.orderMarket.visibleOrders[1], 2: null, 3: null, 4: null },
      orderMarket: { 1: [], 2: [], 3: [], 4: [] }, orderDiscard: [], remainingOrderIds: [],
    } }, initial.activePlayerId, status))
    const before = structuredClone(input)
    expect(() => receiveOrder(input, initial.activePlayerId, 'REFRESH')).toThrow()
    expect(input).toEqual(before)
    expect(Object.isFrozen(input.runtimeRng.runtimeRngCounters)).toBe(false)
  })

  it.each(['REFRESH', 'REFUSAL', 'SUCCESS'] as const)('отклоняет обновление из %s атомарно', status => {
    const initial = scenario()
    const input = structuredClone(withStatus(initial, initial.activePlayerId, status))
    const before = structuredClone(input)
    expect(() => receiveOrder(input, initial.activePlayerId, 'REFRESH')).toThrow()
    expect(input).toEqual(before)
    expect(Object.isFrozen(input.orderMarket)).toBe(false)
  })

  it.each(['WAITING', 'PENDING', 'REFUSAL', 'SUCCESS'] as const)('отклоняет DECLINE из %s атомарно', status => {
    const initial = scenario()
    const input = structuredClone(withStatus(initial, initial.activePlayerId, status))
    const before = structuredClone(input)
    expect(() => receiveOrder(input, initial.activePlayerId, 'DECLINE')).toThrow()
    expect(input).toEqual(before)
  })

  it.each(['WAITING', 'PENDING', 'REFRESH', 'REFUSAL', 'SUCCESS'] as const)('ACCEPT_ORDER без выбора отклоняется из %s', status => {
    const initial = scenario()
    const input = structuredClone(withStatus(initial, initial.activePlayerId, status))
    const before = structuredClone(input)
    expect(() => receiveOrder(input, initial.activePlayerId, 'ACCEPT_ORDER')).toThrow()
    expect(input).toEqual(before)
  })

  it.each([0, 1, 2, 3])('лимит %s невыполненных заказов проверяется до обновления', count => {
    const base = scenario()
    const playerId = base.activePlayerId
    const ids = base.orderMarket.remainingOrderIds.slice(0, 3)
    const slot = (index: number) => ({ orderId: ids[index]!,
      orderStatus: index < count ? 'unfulfilled' as const : 'completed' as const })
    const input = { ...base, orderMarket: { ...base.orderMarket,
      remainingOrderIds: base.orderMarket.remainingOrderIds.slice(3),
    }, playerBoards: base.playerBoards.map(board => board.playerId === playerId
      ? { ...board, boardOrders: { 1: slot(0), 2: slot(1), 3: slot(2) } } : board) }
    const before = structuredClone(input)
    if (count === 3) {
      expect(() => receiveOrder(input, playerId, 'REFRESH')).toThrow('invalid slots')
    } else {
      const result = receiveOrder(input, playerId, 'REFRESH')
      expect(result.state.players.find(player => player.id === playerId)!.status).toBe('REFRESH')
      expect(result.state.playerBoards).toEqual(input.playerBoards)
    }
    expect(input).toEqual(before)
  })

  it('атомарно отклоняет setup, отсутствующего игрока и неизвестную команду', () => {
    const input = structuredClone(scenario())
    const before = structuredClone(input)
    expect(() => receiveOrder(input, 'missing', 'REFRESH')).toThrow()
    expect(() => receiveOrder(input, input.activePlayerId, 'UNKNOWN' as 'REFRESH')).toThrow()
    expect(input).toEqual(before)
    const setup = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    expect(() => receiveOrder(setup, setup.players[0]!.id, 'REFRESH')).toThrow()
  })
})
