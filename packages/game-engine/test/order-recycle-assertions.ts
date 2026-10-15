import { expect } from 'vitest'
import {
  receiveOrder, createRuntimeRng, restoreGameState, projectGameForViewer, projectEventsForViewer,
  type GameState,
} from '../src/index.js'

/** Собирает все заказы рынка, колоды, сброса и планшетов для проверки сохранности карт. */
function allOrders(state: GameState) {
  return [...Object.values(state.orderMarket.visibleOrders).flatMap(id => id === null ? [] : [id]),
    ...Object.values(state.orderMarket.orderMarket).flat(), ...state.orderMarket.remainingOrderIds,
    ...state.orderMarket.orderDiscard,
    ...state.playerBoards.flatMap(board => Object.values(board.boardOrders).flatMap(order => order.orderId === null ? [] : [order.orderId]))].sort()
}

/** Проверяет результат полного перераспределения через публичный API по ORDER-002/003. */
export function expectOrderRecycled(input: GameState, orderId: string | null, slot = '1',
  color: Parameters<typeof receiveOrder>[5] = null,
  replacements: Parameters<typeof receiveOrder>[6] = undefined) {
  const before = structuredClone(input)
  const wasFrozen = Object.isFrozen(input)
  const playerId = input.activePlayerId!
  const key = Object.entries(input.orderMarket.visibleOrders).find(([, id]) => id === orderId)![0] as '1' | '2' | '3' | '4'
  const oldOrder = input.playerBoards.find(board => board.playerId === playerId)!.boardOrders[slot as '1' | '2' | '3']
  const pool = [...input.orderMarket.orderDiscard,
    ...(oldOrder.orderStatus === 'completed' ? [oldOrder.orderId!] : []),
    ...Object.entries(input.orderMarket.visibleOrders).flatMap(([position, id]) => position === key || id === null ? [] : [id]),
    ...Object.values(input.orderMarket.orderMarket).flat()]
  const shuffled = createRuntimeRng({
    runtimeRng: input.runtimeRng, rulesVersion: input.setupVersions.rulesVersion,
    componentsVersion: input.setupVersions.componentsVersion, seedString: String(input.config.seed),
    playerIds: input.players.map(player => player.id), streamId: 'orders/recycle', orderMarket: pool,
  })
  const result = receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, slot, color, replacements)
  expect(result.state.orderMarket).toEqual({
    visibleOrders: { 1: shuffled.orderMarket[0], 2: shuffled.orderMarket[1],
      3: shuffled.orderMarket[2], 4: shuffled.orderMarket[3] },
    orderMarket: { 1: [], 2: [], 3: [], 4: [] }, orderDiscard: [],
    remainingOrderIds: shuffled.orderMarket.slice(4),
  })
  expect(result.state.runtimeRng).toEqual(shuffled.runtimeRng)
  expect(result.state.players.find(player => player.id === playerId)!.status).toBe('SUCCESS')
  expect(result.state.playerBoards.find(board => board.playerId === playerId)!.boardOrders[slot as '1' | '2' | '3'])
    .toEqual({ orderId, orderStatus: 'unfulfilled', assistant: null })
  expect(allOrders(result.state)).toEqual(allOrders(input))
  expect(new Set(allOrders(result.state)).size).toBe(allOrders(result.state).length)
  expect(result.events.filter(event => ['OrderDiscarded', 'OrderTaken', 'OrderDeckRecycled',
    'OrderMarketRefreshed', 'OrderMarketRefilled'].includes(event.type))).toEqual([
    ...(oldOrder.orderStatus === 'completed' ? [{ type: 'OrderDiscarded', playerId, orderId: oldOrder.orderId }] : []),
    { type: 'OrderTaken', playerId, orderId },
    { type: 'OrderDeckRecycled', playerId }, { type: 'OrderMarketRefreshed', playerId },
    { type: 'OrderMarketRefilled' },
  ])
  expect(input).toEqual(before)
  expect(Object.isFrozen(input)).toBe(wasFrozen)
  expect(Object.isFrozen(result)).toBe(true)
  expect(Object.isFrozen(result.state.orderMarket)).toBe(true)
  expect(Object.isFrozen(result.events)).toBe(true)
  expect(result.events.every(Object.isFrozen)).toBe(true)
  expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
  for (const viewer of [null, ...input.players.map(player => player.id)]) {
    expect(projectGameForViewer(result.state, viewer).orderMarket).toEqual({
      visibleOrders: result.state.orderMarket.visibleOrders,
      remainingOrderCount: result.state.orderMarket.remainingOrderIds.length,
    })
    expect(projectEventsForViewer(result.events, result.state, viewer)).toEqual(result.events)
  }
  return result
}
