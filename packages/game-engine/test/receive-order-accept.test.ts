import { describe, expect, it } from 'vitest'
import {
  receiveOrder, restoreGameState, projectGameForViewer, projectEventsForViewer,
  type GameState, type StatusPlayer,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function scenario() {
  return startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
}
function withStatus(state: GameState, playerId: string, status: StatusPlayer): GameState {
  return { ...state, players: state.players.map(player => player.id === playerId
    ? { ...player, status } : player) }
}
function allOrderIds(state: GameState) {
  return [
    ...Object.values(state.orderMarket.visibleOrders).filter(id => id !== null),
    ...Object.values(state.orderMarket.orderMarket).flat(),
    ...state.orderMarket.remainingOrderIds, ...state.orderMarket.orderDiscard,
    ...state.playerBoards.flatMap(board => Object.values(board.boardOrders)
      .flatMap(slot => slot.orderId === null ? [] : [slot.orderId])),
  ].sort()
}
function expectAtomicRejection(input: GameState, orderId: string | null, slotId: string | null = '1') {
  const before = structuredClone(input)
  const frozenBefore = Object.isFrozen(input)
  expect(() => receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', orderId, slotId)).toThrow()
  expect(input).toEqual(before)
  expect(Object.isFrozen(input)).toBe(frozenBefore)
}

describe('ORDER-003: первая пустая клетка через публичную receiveOrder', () => {
  for (const status of ['WAITING', 'PENDING'] as const) {
    it.each([1, 2, 3, 4] as const)(`из ${status} получает открытый заказ позиции %i ровно один раз`, key => {
      const base = scenario()
      const playerId = base.activePlayerId
      const input = structuredClone(withStatus(base, playerId, status))
      const before = structuredClone(input)
      const orderId = input.orderMarket.visibleOrders[key]!
      const result = receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, '1')
      const board = result.state.playerBoards.find(board => board.playerId === playerId)!
      const originalBoard = input.playerBoards.find(board => board.playerId === playerId)!
      expect(board.boardOrders).toEqual({ ...originalBoard.boardOrders,
        1: { orderId, orderStatus: 'unfulfilled' },
      })
      expect(board).toEqual({ ...originalBoard, boardOrders: board.boardOrders })
      const originalPlayer = input.players.find(player => player.id === playerId)!
      const player = result.state.players.find(player => player.id === playerId)!
      expect(player).toEqual({ ...originalPlayer, status: 'SUCCESS',
        ticketsByColor: { ...originalPlayer.ticketsByColor, B: originalPlayer.ticketsByColor.B + 1 },
      })
      expect(result.state.ticketOffice).toEqual({ ticketsByColor: {
        ...input.ticketOffice.ticketsByColor, B: input.ticketOffice.ticketsByColor.B - 1,
      } })
      expect(result.state.orderMarket).toEqual({ ...input.orderMarket,
        visibleOrders: { ...input.orderMarket.visibleOrders, [key]: input.orderMarket.remainingOrderIds[0] },
        remainingOrderIds: input.orderMarket.remainingOrderIds.slice(1),
      })
      expect(result.events).toEqual([
        { type: 'OrderTaken', playerId, orderId },
        { type: 'TicketReceived', playerId, color: 'B' },
        { type: 'OrderMarketRefilled' },
      ])
      expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
      expect(new Set(allOrderIds(result.state)).size).toBe(allOrderIds(result.state).length)
      expect(result.state.runtimeRng).toEqual(input.runtimeRng)
      expect(result.state.ticketDiscard).toEqual(input.ticketDiscard)
      expect(result.state.intermediateScoringStatus).toBe(input.intermediateScoringStatus)
      expect(result.state.phase).toBe(input.phase)
      expect(result.state.activePlayerId).toBe(playerId)
      expect(result.state.players.filter(player => player.id !== playerId))
        .toEqual(input.players.filter(player => player.id !== playerId))
      expect(result.state.playerBoards.filter(board => board.playerId !== playerId))
        .toEqual(input.playerBoards.filter(board => board.playerId !== playerId))
      expect(input).toEqual(before)
      expect(Object.isFrozen(input.players[0]!.ticketsByColor)).toBe(false)
      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.isFrozen(result.state)).toBe(true)
      expect(Object.isFrozen(board.boardOrders[1])).toBe(true)
      expect(Object.isFrozen(player.ticketsByColor)).toBe(true)
      expect(Object.isFrozen(result.events)).toBe(true)
      expect(result.events.every(event => Object.isFrozen(event))).toBe(true)
      expectAtomicRejection(result.state, result.state.orderMarket.visibleOrders[key])
    })
  }

  it('последняя карта пополняет позицию, колода становится пустой', () => {
    const base = scenario()
    const input = { ...base, orderMarket: { ...base.orderMarket,
      remainingOrderIds: base.orderMarket.remainingOrderIds.slice(0, 1),
      orderDiscard: base.orderMarket.remainingOrderIds.slice(1),
    } }
    const result = receiveOrder(input, input.activePlayerId, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[1], '1')
    expect(result.state.orderMarket.visibleOrders[1]).toBe(input.orderMarket.remainingOrderIds[0])
    expect(result.state.orderMarket.remainingOrderIds).toEqual([])
    expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
  })

  it('сохраняет выбор планшета по playerId при обратном порядке планшетов', () => {
    const base = scenario()
    const input = { ...base, playerBoards: [...base.playerBoards].reverse() }
    const orderId = input.orderMarket.visibleOrders[2]!
    const result = receiveOrder(input, input.activePlayerId, 'ACCEPT_ORDER', orderId, '1')
    expect(result.state.playerBoards.find(board => board.playerId === input.activePlayerId)!.boardOrders[1])
      .toEqual({ orderId, orderStatus: 'unfulfilled' })
    expect(result.state.playerBoards.map(board => board.playerId)).toEqual(input.playerBoards.map(board => board.playerId))
  })

  it('продолжает сохранённый PENDING, восстанавливает SUCCESS и проецирует только открытые данные', () => {
    const base = scenario()
    const input = restoreGameState(JSON.parse(JSON.stringify(withStatus(base, base.activePlayerId, 'PENDING'))))
    const before = structuredClone(input)
    const result = receiveOrder(input, base.activePlayerId, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[3], '1')
    expect(result).toEqual(receiveOrder(base, base.activePlayerId, 'ACCEPT_ORDER', base.orderMarket.visibleOrders[3], '1'))
    const restored = restoreGameState(JSON.parse(JSON.stringify(result.state)))
    expect(restored).toEqual(result.state)
    expect(restored.stateSchemaVersion).toBe(12)
    expectAtomicRejection(restored, restored.orderMarket.visibleOrders[3])
    for (const viewer of [null, ...base.players.map(player => player.id)]) {
      const projection = projectGameForViewer(restored, viewer)
      expect(projection.playerBoards).toEqual(restored.playerBoards)
      expect(projection.players).toEqual(restored.players)
      expect(projection.orderMarket).toEqual({ visibleOrders: restored.orderMarket.visibleOrders,
        remainingOrderCount: restored.orderMarket.remainingOrderIds.length })
      expect(projection).not.toHaveProperty('runtimeRng')
      expect(projection.orderMarket).not.toHaveProperty('remainingOrderIds')
      expect(projection.orderMarket).not.toHaveProperty('orderMarket')
      expect(projectEventsForViewer(result.events, restored, viewer)).toEqual(result.events)
    }
    expect(input).toEqual(before)
  })

  it.each(['REFRESH', 'REFUSAL', 'SUCCESS'] as const)('атомарно отклоняет получение из %s с полным выбором', status => {
    const base = scenario()
    const input = withStatus(base, base.activePlayerId, status)
    expectAtomicRejection(input, input.orderMarket.visibleOrders[1])
  })

  it.each(['2', '3', '0', null])('атомарно отклоняет клетку %s', slotId => {
    const input = scenario()
    expectAtomicRejection(input, input.orderMarket.visibleOrders[1], slotId)
  })

  it.each(['completed', 'unfulfilled'] as const)('не заменяет занятый заказ со статусом %s', orderStatus => {
    const base = scenario()
    const input = { ...base, orderMarket: { ...base.orderMarket,
      remainingOrderIds: base.orderMarket.remainingOrderIds.slice(1),
    }, playerBoards: base.playerBoards.map(board => board.playerId === base.activePlayerId
      ? { ...board, boardOrders: { ...board.boardOrders,
        1: { orderId: base.orderMarket.remainingOrderIds[0]!, orderStatus },
      } } : board) }
    expectAtomicRejection(input, input.orderMarket.visibleOrders[1])
  })

  it.each([0, 1])('атомарно отклоняет B = %i, не оставляет заказ или расход RNG', count => {
    const base = scenario()
    const input = { ...base, ticketOffice: { ticketsByColor: { ...base.ticketOffice.ticketsByColor, B: count } } }
    expectAtomicRejection(input, input.orderMarket.visibleOrders[1])
  })

  it('не раскрывает нижний слой выбранной позиции', () => {
    const base = scenario()
    const input = { ...base, orderMarket: { ...base.orderMarket,
      orderMarket: { ...base.orderMarket.orderMarket, 4: [base.orderMarket.remainingOrderIds[0]!] },
      remainingOrderIds: base.orderMarket.remainingOrderIds.slice(1),
    } }
    expectAtomicRejection(input, input.orderMarket.visibleOrders[4])
  })

  it('отклоняет пустую колоду до успешного получения', () => {
    const base = scenario()
    const input = { ...base, orderMarket: { ...base.orderMarket,
      remainingOrderIds: [], orderDiscard: base.orderMarket.remainingOrderIds,
    } }
    expectAtomicRejection(input, input.orderMarket.visibleOrders[1])
  })

  it.each([null, 'missing'])('отклоняет отсутствующий или неизвестный заказ %s', orderId => {
    expectAtomicRejection(scenario(), orderId)
  })

  it('не позволяет выбрать скрытый заказ колоды', () => {
    const input = scenario()
    expectAtomicRejection(input, input.orderMarket.remainingOrderIds[0]!)
  })
})
