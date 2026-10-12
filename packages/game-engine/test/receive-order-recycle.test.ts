import { describe, expect, it } from 'vitest'
import { receiveOrder, type GameState, type StatusPlayer } from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { expectOrderRecycled } from './order-recycle-assertions.js'

function scenario(slot: '1' | '2' | '3', key: '1' | '2' | '3' | '4',
  occupied: boolean, status: StatusPlayer = 'WAITING'): GameState {
  const base = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const playerId = base.activePlayerId
  const oldOrderId = base.orderMarket.remainingOrderIds[0]!
  const prepared: GameState = { ...base,
    players: base.players.map(player => player.id === playerId
      ? { ...player, status: status === 'REFRESH' ? 'WAITING' : status } : player),
    orderMarket: { ...base.orderMarket,
      remainingOrderIds: occupied ? base.orderMarket.remainingOrderIds.slice(1) : base.orderMarket.remainingOrderIds },
    playerBoards: [...base.playerBoards].reverse().map(board => board.playerId === playerId && occupied
      ? { ...board, boardOrders: { ...board.boardOrders,
        [slot]: { orderId: oldOrderId, orderStatus: 'completed', assistant: null } } } : board),
  }
  const ready = status === 'REFRESH' ? receiveOrder(prepared, playerId, 'REFRESH').state : prepared
  const otherKey = key === '4' ? '1' : '4'
  return { ...ready, orderMarket: { ...ready.orderMarket,
    remainingOrderIds: [],
    orderDiscard: [...ready.orderMarket.orderDiscard, ...ready.orderMarket.orderMarket[key],
      ...ready.orderMarket.remainingOrderIds.slice(1)],
    orderMarket: { ...ready.orderMarket.orderMarket,
      [key]: [], [otherKey]: [...ready.orderMarket.orderMarket[otherKey], ready.orderMarket.remainingOrderIds[0]!] },
  } }
}

describe('ORDER-003: переработка для пополнения после ACCEPT_ORDER', () => {
  for (const slot of ['1', '2', '3'] as const) {
    for (const key of ['1', '2', '3', '4'] as const) {
      for (const occupied of [false, true]) {
        it.each(['WAITING', 'PENDING', 'REFRESH'] as const)(
          `рынок ${key}, клетка ${slot}, completed=${occupied}, %s: один recycle и четыре новые позиции`, status => {
            const input = scenario(slot, key, occupied, status)
            const playerId = input.activePlayerId!
            const orderId = input.orderMarket.visibleOrders[key]!
            const color = slot === '1' ? 'B' : slot === '2' ? 'R' : 'W'
            const originalPlayer = input.players.find(player => player.id === playerId)!
            const originalBoard = input.playerBoards.find(board => board.playerId === playerId)!
            const result = expectOrderRecycled(input, orderId, slot, occupied ? null : color)
            expect(result.state).toEqual({ ...input,
              runtimeRng: result.state.runtimeRng, orderMarket: result.state.orderMarket,
              players: input.players.map(player => player.id === playerId ? { ...originalPlayer, status: 'SUCCESS',
                ticketsByColor: occupied ? originalPlayer.ticketsByColor
                  : { ...originalPlayer.ticketsByColor, [color]: originalPlayer.ticketsByColor[color] + 1 },
              } : player),
              playerBoards: input.playerBoards.map(board => board.playerId === playerId
                ? { ...originalBoard, boardOrders: { ...originalBoard.boardOrders,
                  [slot]: { orderId, orderStatus: 'unfulfilled', assistant: null } } } : board),
              ticketOffice: occupied ? input.ticketOffice : { ticketsByColor: {
                ...input.ticketOffice.ticketsByColor, [color]: input.ticketOffice.ticketsByColor[color] - 1,
              } },
            })
            expect(result.events).toEqual([
              ...(occupied ? [{ type: 'OrderDiscarded', playerId, orderId: originalBoard.boardOrders[slot].orderId }] : []),
              { type: 'OrderTaken', playerId, orderId },
              { type: 'OrderDeckRecycled', playerId },
              { type: 'OrderMarketRefreshed', playerId },
              ...(occupied ? [] : [{ type: 'TicketReceived', playerId, color }]),
              { type: 'OrderMarketRefilled' },
            ])
            expect(result.state.runtimeRng.runtimeRngCounters['orders/recycle'])
              .toBeGreaterThan(input.runtimeRng.runtimeRngCounters['orders/recycle'])
            expect(result).toEqual(receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, slot, occupied ? null : color))
          })
      }
    }
  }
  it.each(['missing-color', 'rng-overflow'] as const)('отказ %s после начала переработки атомарен', reason => {
    const base = scenario('3', '4', false)
    const input: GameState = reason === 'rng-overflow' ? { ...base, runtimeRng: { ...base.runtimeRng,
      runtimeRngCounters: { ...base.runtimeRng.runtimeRngCounters, 'orders/recycle': Number.MAX_SAFE_INTEGER },
    } } : base
    const before = structuredClone(input)
    const wasFrozen = Object.isFrozen(input)
    expect(() => receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[4],
      '3', reason === 'missing-color' ? null : 'W')).toThrow()
    expect(input).toEqual(before)
    expect(Object.isFrozen(input)).toBe(wasFrozen)
  })
})