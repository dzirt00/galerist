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

  it.each(['REFUSAL', 'SUCCESS'] as const)('атомарно отклоняет получение из %s с полным выбором', status => {
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

  it('раскрывает нижний слой выбранной позиции при самостоятельном получении', () => {
    const base = scenario()
    const input = { ...base, orderMarket: { ...base.orderMarket,
      orderMarket: { ...base.orderMarket.orderMarket, 4: [base.orderMarket.remainingOrderIds[0]!] },
      remainingOrderIds: base.orderMarket.remainingOrderIds.slice(1),
    } }
    const result = receiveOrder(input, input.activePlayerId, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[4], '1')
    expect(result.state.orderMarket.visibleOrders[4]).toBe(input.orderMarket.orderMarket[4][0])
    expect(result.state.orderMarket.orderMarket[4]).toEqual([])
    expect(result.state.orderMarket.remainingOrderIds).toEqual(input.orderMarket.remainingOrderIds)
    expect(result.events.map(event => event.type)).toEqual(['OrderTaken', 'TicketReceived'])
    expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
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


describe('ORDER-003: получение после обновления через публичную receiveOrder', () => {
  it.each([1, 2, 3, 4] as const)('раскрывает прежний верх позиции %i после обычного REFRESH', key => {
    const input = structuredClone(scenario())
    const before = structuredClone(input)
    const playerId = input.activePlayerId
    const refreshed = receiveOrder(input, playerId, 'REFRESH')
    const refreshedBefore = structuredClone(refreshed.state)
    const orderId = refreshed.state.orderMarket.visibleOrders[key]!
    const result = receiveOrder(refreshed.state, playerId, 'ACCEPT_ORDER', orderId, '1')
    expect(refreshed.events).toEqual([{ type: 'OrderMarketRefreshed', playerId }])
    expect(result.state.orderMarket).toEqual({ ...refreshed.state.orderMarket,
      visibleOrders: { ...refreshed.state.orderMarket.visibleOrders, [key]: input.orderMarket.visibleOrders[key] },
      orderMarket: { ...refreshed.state.orderMarket.orderMarket, [key]: [] },
    })
    const originalBoard = refreshed.state.playerBoards.find(board => board.playerId === playerId)!
    const board = result.state.playerBoards.find(board => board.playerId === playerId)!
    expect(board).toEqual({ ...originalBoard, boardOrders: { ...originalBoard.boardOrders,
      1: { orderId, orderStatus: 'unfulfilled' },
    } })
    const originalPlayer = refreshed.state.players.find(player => player.id === playerId)!
    expect(result.state.players.find(player => player.id === playerId)).toEqual({ ...originalPlayer,
      status: 'SUCCESS', ticketsByColor: { ...originalPlayer.ticketsByColor, B: originalPlayer.ticketsByColor.B + 1 },
    })
    expect(result.state.ticketOffice).toEqual({ ticketsByColor: {
      ...refreshed.state.ticketOffice.ticketsByColor, B: refreshed.state.ticketOffice.ticketsByColor.B - 1,
    } })
    expect(result.events).toEqual([
      { type: 'OrderTaken', playerId, orderId }, { type: 'TicketReceived', playerId, color: 'B' },
    ])
    expect(result.state.runtimeRng).toEqual(refreshed.state.runtimeRng)
    expect(result.state.phase).toBe(refreshed.state.phase)
    expect(result.state.activePlayerId).toBe(playerId)
    expect(result.state.round).toBe(refreshed.state.round)
    expect(result.state.ticketDiscard).toEqual(refreshed.state.ticketDiscard)
    expect(result.state.intermediateScoringStatus).toBe(refreshed.state.intermediateScoringStatus)
    expect(result.state.players.filter(player => player.id !== playerId))
      .toEqual(refreshed.state.players.filter(player => player.id !== playerId))
    expect(result.state.playerBoards.filter(board => board.playerId !== playerId))
      .toEqual(refreshed.state.playerBoards.filter(board => board.playerId !== playerId))
    expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
    expect(new Set(allOrderIds(result.state)).size).toBe(allOrderIds(result.state).length)
    expect(input).toEqual(before)
    expect(refreshed.state).toEqual(refreshedBefore)
    expect(Object.isFrozen(input.orderMarket)).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.state)).toBe(true)
    expect(Object.isFrozen(result.state.orderMarket.visibleOrders)).toBe(true)
    expect(Object.isFrozen(result.state.orderMarket.orderMarket[key])).toBe(true)
    expect(Object.isFrozen(board.boardOrders[1])).toBe(true)
    expect(Object.isFrozen(result.events)).toBe(true)
    expect(result.events.every(event => Object.isFrozen(event))).toBe(true)
    const restored = restoreGameState(JSON.parse(JSON.stringify(result.state)))
    expect(restored).toEqual(result.state)
    expect(restored.stateSchemaVersion).toBe(12)
    for (const viewer of [null, ...input.players.map(player => player.id)]) {
      const projection = projectGameForViewer(restored, viewer)
      expect(projection.orderMarket).toEqual({ visibleOrders: restored.orderMarket.visibleOrders,
        remainingOrderCount: restored.orderMarket.remainingOrderIds.length })
      expect(projection.playerBoards).toEqual(restored.playerBoards)
      expect(projection).not.toHaveProperty('runtimeRng')
      expect(projection.orderMarket).not.toHaveProperty('orderMarket')
      expect(projection.orderMarket).not.toHaveProperty('remainingOrderIds')
      expect(projectEventsForViewer(result.events, restored, viewer)).toEqual(result.events)
    }
    expectAtomicRejection(result.state, result.state.orderMarket.visibleOrders[key])
    expectAtomicRejection(result.state, result.state.orderMarket.visibleOrders[key], '2')
  })

  for (const emptyDeck of [false, true]) {
    it.each([1, 2, 3])(`сохраняет порядок нижних карт при глубине %i; пустая колода: ${emptyDeck}`, depth => {
      const base = scenario()
      const cards = base.orderMarket.remainingOrderIds
      const input = { ...base, orderMarket: { ...base.orderMarket,
        orderMarket: { ...base.orderMarket.orderMarket, 3: cards.slice(0, depth - 1) },
        remainingOrderIds: cards.slice(depth - 1, emptyDeck ? depth + 3 : undefined),
        orderDiscard: emptyDeck ? cards.slice(depth + 3) : base.orderMarket.orderDiscard,
      } }
      const refreshed = receiveOrder(input, input.activePlayerId, 'REFRESH')
      const saved = restoreGameState(JSON.parse(JSON.stringify(refreshed.state)))
      const before = structuredClone(saved)
      const lower = saved.orderMarket.orderMarket[3]
      expect(lower).toHaveLength(depth)
      if (emptyDeck) expect(saved.orderMarket.remainingOrderIds).toEqual([])
      const result = receiveOrder(saved, saved.activePlayerId!, 'ACCEPT_ORDER', saved.orderMarket.visibleOrders[3], '1')
      expect(result.state.orderMarket).toEqual({ ...saved.orderMarket,
        visibleOrders: { ...saved.orderMarket.visibleOrders, 3: lower[lower.length - 1] },
        orderMarket: { ...saved.orderMarket.orderMarket, 3: lower.slice(0, -1) },
      })
      expect(result.events.map(event => event.type)).toEqual(['OrderTaken', 'TicketReceived'])
      expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
      expect(result.state.runtimeRng).toEqual(saved.runtimeRng)
      expect(saved).toEqual(before)
      expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
    })
  }

  it('после переработки добирает из колоды, сохраняя RNG обновления', () => {
    const base = scenario()
    const input = { ...base, orderMarket: { ...base.orderMarket,
      remainingOrderIds: [], orderDiscard: base.orderMarket.remainingOrderIds,
    } }
    const refreshed = receiveOrder(input, input.activePlayerId, 'REFRESH')
    expect(refreshed.events.map(event => event.type)).toEqual(['OrderDeckRecycled', 'OrderMarketRefreshed'])
    expect(refreshed.state.orderMarket.orderMarket[2]).toEqual([])
    const orderId = refreshed.state.orderMarket.visibleOrders[2]!
    const result = receiveOrder(refreshed.state, input.activePlayerId, 'ACCEPT_ORDER', orderId, '1')
    expect(result.state.orderMarket).toEqual({ ...refreshed.state.orderMarket,
      visibleOrders: { ...refreshed.state.orderMarket.visibleOrders, 2: refreshed.state.orderMarket.remainingOrderIds[0] },
      remainingOrderIds: refreshed.state.orderMarket.remainingOrderIds.slice(1),
    })
    expect(result.events).toEqual([
      { type: 'OrderTaken', playerId: input.activePlayerId, orderId },
      { type: 'TicketReceived', playerId: input.activePlayerId, color: 'B' },
      { type: 'OrderMarketRefilled' },
    ])
    expect(result.state.runtimeRng).toEqual(refreshed.state.runtimeRng)
    expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
  })

  it('ошибки выбора сохраняют уже выполненное обновление', () => {
    const base = scenario()
    const refreshed = receiveOrder(base, base.activePlayerId, 'REFRESH')
    const input = refreshed.state
    expectAtomicRejection(input, 'missing')
    expectAtomicRejection(input, null)
    expectAtomicRejection(input, base.orderMarket.visibleOrders[3])
    expectAtomicRejection(input, input.orderMarket.remainingOrderIds[0]!)
    for (const slot of ['2', '3', '4', 'missing', null]) {
      expectAtomicRejection(input, input.orderMarket.visibleOrders[3], slot)
    }
    for (const count of [0, 1]) {
      expectAtomicRejection({ ...input, ticketOffice: { ticketsByColor: {
        ...input.ticketOffice.ticketsByColor, B: count,
      } } }, input.orderMarket.visibleOrders[3])
    }
    const declined = receiveOrder(input, base.activePlayerId, 'DECLINE')
    expect(declined.state.orderMarket).toEqual(input.orderMarket)
    expectAtomicRejection(declined.state, input.orderMarket.visibleOrders[3])
  })

  it('после REFRESH отклоняет получение, если нижний массив и колода одновременно пусты', () => {
    const base = scenario()
    const input = { ...base, orderMarket: { ...base.orderMarket,
      visibleOrders: { ...base.orderMarket.visibleOrders, 3: null },
      remainingOrderIds: base.orderMarket.remainingOrderIds.slice(0, 4),
      orderDiscard: [...base.orderMarket.remainingOrderIds.slice(4), base.orderMarket.visibleOrders[3]!],
    } }
    const refreshed = receiveOrder(input, input.activePlayerId, 'REFRESH')
    expect(refreshed.state.orderMarket.orderMarket[3]).toEqual([])
    expect(refreshed.state.orderMarket.remainingOrderIds).toEqual([])
    expectAtomicRejection(refreshed.state, refreshed.state.orderMarket.visibleOrders[3])
  })
})
