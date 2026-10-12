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


function expectOrderWithoutTicket(source: GameState, orderId: string | null, slot: string = '1',
  color: 'B' | 'R' | 'W' = 'B') {
  const input: GameState = { ...source, intermediateScoringStatus: 'completed',
    ticketDiscard: { ...source.ticketDiscard, [color]: 0 } }
  const before = structuredClone(input)
  const result = receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', orderId, slot, color)
  expect(result.state.players.find(player => player.id === input.activePlayerId)).toEqual({
    ...input.players.find(player => player.id === input.activePlayerId)!, status: 'SUCCESS',
  })
  expect(result.state.playerBoards.find(board => board.playerId === input.activePlayerId)!.boardOrders[slot as '1' | '2' | '3'])
    .toEqual({ orderId, orderStatus: 'unfulfilled', assistant: null })
  expect(result.state.ticketOffice).toEqual(input.ticketOffice)
  expect(result.state.ticketDiscard).toEqual(input.ticketDiscard)
  expect(result.state.intermediateScoringStatus).toBe('completed')
  const key = Object.entries(input.orderMarket.visibleOrders).find(([, id]) => id === orderId)![0] as '1' | '2' | '3' | '4'
  expect(result.events).toEqual([
    { type: 'OrderTaken', playerId: input.activePlayerId, orderId },
    ...(input.orderMarket.orderMarket[key].length === 0 ? [{ type: 'OrderMarketRefilled' }] : []),
  ])
  expect(result.state.runtimeRng).toEqual(input.runtimeRng)
  expect(input).toEqual(before)
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
        1: { orderId, orderStatus: 'unfulfilled', assistant: null },
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
      .toEqual({ orderId, orderStatus: 'unfulfilled', assistant: null })
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
    expect(restored.stateSchemaVersion).toBe(13)
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

  it.each(['3', '0', null])('атомарно отклоняет клетку %s', slotId => {
    const input = scenario()
    expectAtomicRejection(input, input.orderMarket.visibleOrders[1], slotId)
  })

  it.each(['unfulfilled'] as const)('не заменяет занятый заказ со статусом %s', orderStatus => {
    const base = scenario()
    const input = { ...base, orderMarket: { ...base.orderMarket,
      remainingOrderIds: base.orderMarket.remainingOrderIds.slice(1),
    }, playerBoards: base.playerBoards.map(board => board.playerId === base.activePlayerId
      ? { ...board, boardOrders: { ...board.boardOrders,
        1: { orderId: base.orderMarket.remainingOrderIds[0]!, orderStatus, assistant: null },
      } } : board) }
    expectAtomicRejection(input, input.orderMarket.visibleOrders[1])
  })

  it.each([0])('при B = %i и пустом сбросе получает заказ без билета', count => {
    const base = scenario()
    const input = { ...base, ticketOffice: { ticketsByColor: { ...base.ticketOffice.ticketsByColor, B: count } } }
    expectOrderWithoutTicket(input, input.orderMarket.visibleOrders[1])
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
      1: { orderId, orderStatus: 'unfulfilled', assistant: null },
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
    expect(restored.stateSchemaVersion).toBe(13)
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
    for (const slot of ['3', '4', 'missing', null]) {
      expectAtomicRejection(input, input.orderMarket.visibleOrders[3], slot)
    }
    for (const count of [0]) {
      expectOrderWithoutTicket({ ...input, ticketOffice: { ticketsByColor: {
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


describe('ORDER-003: вторая пустая клетка и розовый билет', () => {
  function inputForSecondSlot(status: StatusPlayer = 'PENDING', brownCount = 0): GameState {
    const base = scenario()
    const occupiedId = base.orderMarket.remainingOrderIds[0]!
    return {
      ...withStatus(base, base.activePlayerId, status),
      ticketOffice: { ticketsByColor: { ...base.ticketOffice.ticketsByColor, B: brownCount, R: 2 } },
      orderMarket: { ...base.orderMarket, remainingOrderIds: base.orderMarket.remainingOrderIds.slice(1) },
      playerBoards: base.playerBoards.map(board => board.playerId === base.activePlayerId
        ? { ...board, boardOrders: { ...board.boardOrders,
          1: { orderId: occupiedId, orderStatus: 'unfulfilled', assistant: null },
        } } : board),
    }
  }

  for (const status of ['WAITING', 'PENDING'] as const) {
    it.each([1, 2, 3, 4] as const)(`из ${status} получает позицию %i во вторую клетку при занятой первой и B = 0`, key => {
      const input = structuredClone(inputForSecondSlot(status))
      const before = structuredClone(input)
      const playerId = input.activePlayerId!
      const orderId = input.orderMarket.visibleOrders[key]!
      const result = receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, '2')
      const board = input.playerBoards.find(board => board.playerId === playerId)!
      const player = input.players.find(player => player.id === playerId)!
      expect(result.state).toEqual({ ...input,
        playerBoards: input.playerBoards.map(item => item.playerId === playerId
          ? { ...board, boardOrders: { ...board.boardOrders, 2: { orderId, orderStatus: 'unfulfilled', assistant: null } } } : item),
        players: input.players.map(item => item.id === playerId
          ? { ...player, status: 'SUCCESS', ticketsByColor: { ...player.ticketsByColor, R: player.ticketsByColor.R + 1 } } : item),
        ticketOffice: { ticketsByColor: { ...input.ticketOffice.ticketsByColor, R: 1 } },
        orderMarket: { ...input.orderMarket,
          visibleOrders: { ...input.orderMarket.visibleOrders, [key]: input.orderMarket.remainingOrderIds[0] },
          remainingOrderIds: input.orderMarket.remainingOrderIds.slice(1),
        },
      })
      expect(result.events).toEqual([
        { type: 'OrderTaken', playerId, orderId },
        { type: 'TicketReceived', playerId, color: 'R' },
        { type: 'OrderMarketRefilled' },
      ])
      expect(input).toEqual(before)
      expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
      expect(Object.isFrozen(result.state.playerBoards.find(item => item.playerId === playerId)!.boardOrders[2])).toBe(true)
      expect(Object.isFrozen(result.state.players.find(item => item.id === playerId)!.ticketsByColor)).toBe(true)
      expect(Object.isFrozen(result.events)).toBe(true)
      expect(result.events.every(event => Object.isFrozen(event))).toBe(true)
      const restored = restoreGameState(JSON.parse(JSON.stringify(result.state)))
      expect(restored).toEqual(result.state)
      for (const viewer of [null, ...input.players.map(item => item.id)]) {
        const projection = projectGameForViewer(restored, viewer)
        expect(projection.playerBoards).toEqual(restored.playerBoards)
        expect(projection.players).toEqual(restored.players)
        expect(projection.ticketOffice).toEqual(restored.ticketOffice)
        expect(projection.orderMarket).toEqual({ visibleOrders: restored.orderMarket.visibleOrders,
          remainingOrderCount: restored.orderMarket.remainingOrderIds.length })
        expect(projection.orderMarket).not.toHaveProperty('remainingOrderIds')
        expect(projection.orderMarket).not.toHaveProperty('orderMarket')
        expect(projectEventsForViewer(result.events, restored, viewer)).toEqual(result.events)
      }
      expectAtomicRejection(restored, restored.orderMarket.visibleOrders[key], '2')
    })
  }

  it.each([1, 2, 3, 4] as const)('после реального REFRESH раскрывает нижнюю карту позиции %i и выдаёт R при B = 1', key => {
    const input = inputForSecondSlot('WAITING', 1)
    const refreshed = receiveOrder(input, input.activePlayerId!, 'REFRESH')
    const before = structuredClone(refreshed.state)
    const playerId = input.activePlayerId!
    const orderId = refreshed.state.orderMarket.visibleOrders[key]!
    const result = receiveOrder(refreshed.state, playerId, 'ACCEPT_ORDER', orderId, '2')
    expect(result.state.orderMarket).toEqual({ ...refreshed.state.orderMarket,
      visibleOrders: { ...refreshed.state.orderMarket.visibleOrders, [key]: input.orderMarket.visibleOrders[key] },
      orderMarket: { ...refreshed.state.orderMarket.orderMarket, [key]: [] },
    })
    const board = input.playerBoards.find(item => item.playerId === playerId)!
    expect(result.state.playerBoards.find(item => item.playerId === playerId)).toEqual({ ...board,
      boardOrders: { ...board.boardOrders, 2: { orderId, orderStatus: 'unfulfilled', assistant: null } },
    })
    const player = refreshed.state.players.find(item => item.id === playerId)!
    expect(result.state.players.find(item => item.id === playerId)).toEqual({ ...player,
      status: 'SUCCESS', ticketsByColor: { ...player.ticketsByColor, R: player.ticketsByColor.R + 1 },
    })
    expect(result.state.ticketOffice.ticketsByColor).toEqual({ ...refreshed.state.ticketOffice.ticketsByColor, R: 1 })
    expect(result.events).toEqual([
      { type: 'OrderTaken', playerId, orderId }, { type: 'TicketReceived', playerId, color: 'R' },
    ])
    expect(result.state.runtimeRng).toEqual(refreshed.state.runtimeRng)
    expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
    expect(refreshed.state).toEqual(before)
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
  })

  it.each(['unfulfilled'] as const)('атомарно отклоняет занятую вторую клетку: %s', orderStatus => {
    const base = inputForSecondSlot()
    const input: GameState = { ...base,
      orderMarket: { ...base.orderMarket, remainingOrderIds: base.orderMarket.remainingOrderIds.slice(1) },
      playerBoards: base.playerBoards.map(board => board.playerId === base.activePlayerId
        ? { ...board, boardOrders: { ...board.boardOrders,
          2: { orderId: base.orderMarket.remainingOrderIds[0]!, orderStatus, assistant: null },
        } } : board),
    }
    expectAtomicRejection(input, input.orderMarket.visibleOrders[2], '2')
  })

  for (const status of ['PENDING', 'REFRESH'] as const) {
    it.each([0])(`при R = %i из ${status} получает заказ без билета при пустом сбросе`, count => {
      const base = inputForSecondSlot('WAITING', 3)
      const ready = status === 'REFRESH' ? receiveOrder(base, base.activePlayerId!, 'REFRESH').state
        : withStatus(base, base.activePlayerId!, status)
      const input: GameState = { ...ready,
        ticketOffice: { ticketsByColor: { ...ready.ticketOffice.ticketsByColor, R: count } },
      }
      expectOrderWithoutTicket(input, input.orderMarket.visibleOrders[2], '2', 'R')
    })
  }
})

describe('ORDER-003: последний билет выбранной клетки', () => {
  for (const [slot, color] of [['1', 'B'], ['2', 'R']] as const) {
    for (const status of ['WAITING', 'PENDING', 'REFRESH'] as const) {
      for (const scoringStatus of ['not_triggered', 'pending', 'completed'] as const) {
        it.each(['draw', 'reveal'] as const)(
          `клетка ${slot}, ${status}, ${scoringStatus}: последний ${color}, %s`, mode => {
            const base = scenario()
            const playerId = base.activePlayerId
            const prepared: GameState = {
              ...withStatus(base, playerId, status === 'REFRESH' ? 'WAITING' : status),
              intermediateScoringStatus: scoringStatus,
              ticketOffice: { ticketsByColor: { B: 3, R: 3, W: 3, [color]: 1 } },
            }
            const ready = status === 'REFRESH'
              ? receiveOrder(prepared, playerId, 'REFRESH').state : prepared
            // Перекладываем все нижние карты в колоду, сохраняя состав заказов.
            const remaining = [...Object.values(ready.orderMarket.orderMarket).flat(),
              ...ready.orderMarket.remainingOrderIds]
            const input: GameState = { ...ready, orderMarket: { ...ready.orderMarket,
              orderMarket: { 1: mode === 'reveal' ? [remaining[0]!] : [], 2: [], 3: [], 4: [] },
              remainingOrderIds: mode === 'reveal' ? [] : remaining,
              orderDiscard: mode === 'reveal'
                ? [...ready.orderMarket.orderDiscard, ...remaining.slice(1)] : ready.orderMarket.orderDiscard,
            } }
            const before = structuredClone(input)
            const orderId = input.orderMarket.visibleOrders[1]!
            const player = input.players.find(item => item.id === playerId)!
            const board = input.playerBoards.find(item => item.playerId === playerId)!
            const expectedScoring = scoringStatus === 'not_triggered' ? 'pending' : scoringStatus
            const result = receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, slot)
            expect(result.state).toEqual({ ...input,
              intermediateScoringStatus: expectedScoring,
              players: input.players.map(item => item.id === playerId ? { ...player,
                status: 'SUCCESS', ticketsByColor: { ...player.ticketsByColor,
                  [color]: player.ticketsByColor[color] + 1 },
              } : item),
              playerBoards: input.playerBoards.map(item => item.playerId === playerId
                ? { ...board, boardOrders: { ...board.boardOrders,
                  [slot]: { orderId, orderStatus: 'unfulfilled', assistant: null } } } : item),
              ticketOffice: { ticketsByColor: { ...input.ticketOffice.ticketsByColor, [color]: 0 } },
              orderMarket: { ...input.orderMarket,
                visibleOrders: { ...input.orderMarket.visibleOrders, 1: remaining[0] },
                orderMarket: { ...input.orderMarket.orderMarket, 1: [] },
                remainingOrderIds: mode === 'draw' ? remaining.slice(1) : [],
              },
            })
            expect(result.events).toEqual([
              { type: 'OrderTaken', playerId, orderId },
              { type: 'TicketReceived', playerId, color },
              ...(scoringStatus === 'not_triggered' ? [{ type: 'IntermediateScoringTriggered' }] : []),
              ...(mode === 'draw' ? [{ type: 'OrderMarketRefilled' }] : []),
            ])
            expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
            expect(input).toEqual(before)
            expect(Object.isFrozen(result)).toBe(true)
            expect(Object.isFrozen(result.state)).toBe(true)
            expect(Object.isFrozen(result.state.players.find(item => item.id === playerId)!.ticketsByColor)).toBe(true)
            expect(Object.isFrozen(result.events)).toBe(true)
            expect(result.events.every(Object.isFrozen)).toBe(true)
            const restored = restoreGameState(JSON.parse(JSON.stringify(result.state)))
            expect(restored).toEqual(result.state)
            expect(restored.stateSchemaVersion).toBe(13)
            for (const viewer of [null, ...input.players.map(item => item.id)]) {
              const projection = projectGameForViewer(restored, viewer)
              expect(projection.intermediateScoringStatus).toBe(expectedScoring)
              expect(projection.players).toEqual(restored.players)
              expect(projection.playerBoards).toEqual(restored.playerBoards)
              expect(projection.ticketOffice).toEqual(restored.ticketOffice)
              expect(projection.orderMarket).not.toHaveProperty('remainingOrderIds')
              expect(projectEventsForViewer(result.events, restored, viewer)).toEqual(result.events)
            }
          })
      }
    }

    it.each(['occupied', 'no-refill'] as const)(
      `последний ${color}: атомарный отказ при %s сохраняет билет и статус подсчёта`, reason => {
        const base = scenario()
        const playerId = base.activePlayerId
        const occupiedId = base.orderMarket.remainingOrderIds[0]!
        const input: GameState = { ...base,
          intermediateScoringStatus: 'not_triggered',
          ticketOffice: { ticketsByColor: { B: 3, R: 3, W: 3, [color]: 1 } },
          orderMarket: { ...base.orderMarket,
            remainingOrderIds: reason === 'no-refill' ? [] : base.orderMarket.remainingOrderIds.slice(1),
            orderDiscard: reason === 'no-refill'
              ? [...base.orderMarket.orderDiscard, ...base.orderMarket.remainingOrderIds] : base.orderMarket.orderDiscard,
          },
          playerBoards: base.playerBoards.map(board => board.playerId === playerId && reason === 'occupied'
            ? { ...board, boardOrders: { ...board.boardOrders,
              [slot]: { orderId: occupiedId, orderStatus: 'unfulfilled', assistant: null } } } : board),
        }
        expectAtomicRejection(input, input.orderMarket.visibleOrders[1], slot)
      })
  }
})
describe('ORDER-003: третья пустая клетка с выбранным цветом', () => {
  function thirdSlotInput(count: number, color: 'B' | 'R' | 'W', status: StatusPlayer = 'WAITING'): GameState {
    const base = scenario()
    const [firstId, secondId] = base.orderMarket.remainingOrderIds
    return { ...withStatus(base, base.activePlayerId, status),
      ticketOffice: { ticketsByColor: { B: 3, R: 3, W: 3, [color]: count } },
      orderMarket: { ...base.orderMarket, remainingOrderIds: base.orderMarket.remainingOrderIds.slice(2) },
      playerBoards: base.playerBoards.map(board => board.playerId === base.activePlayerId
        ? { ...board, boardOrders: { ...board.boardOrders,
          1: { orderId: firstId!, orderStatus: 'unfulfilled', assistant: null },
          2: { orderId: secondId!, orderStatus: 'completed', assistant: null },
        } } : board),
    }
  }
  for (const color of ['B', 'R', 'W'] as const) {
    for (const status of ['WAITING', 'PENDING', 'REFRESH'] as const) {
      for (const count of [1, 2]) {
        it.each(['draw', 'reveal'] as const)(
          `выбор ${color}, запас ${count}, ${status}, %s: сохраняет занятые клетки 1–2`, mode => {
            const base = thirdSlotInput(count, color, status === 'REFRESH' ? 'WAITING' : status)
            const ready = status === 'REFRESH' ? receiveOrder(base, base.activePlayerId!, 'REFRESH').state : base
            const remaining = [...Object.values(ready.orderMarket.orderMarket).flat(),
              ...ready.orderMarket.remainingOrderIds]
            const input: GameState = { ...ready, orderMarket: { ...ready.orderMarket,
              orderMarket: { 1: [], 2: [], 3: [], 4: mode === 'reveal' ? [remaining[0]!] : [] },
              remainingOrderIds: mode === 'reveal' ? [] : remaining,
              orderDiscard: mode === 'reveal'
                ? [...ready.orderMarket.orderDiscard, ...remaining.slice(1)] : ready.orderMarket.orderDiscard,
            } }
            const before = structuredClone(input)
            const playerId = input.activePlayerId!
            const orderId = input.orderMarket.visibleOrders[4]!
            const player = input.players.find(item => item.id === playerId)!
            const board = input.playerBoards.find(item => item.playerId === playerId)!
            const result = receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, '3', color)
            expect(result.state).toEqual({ ...input,
              intermediateScoringStatus: count === 1 ? 'pending' : input.intermediateScoringStatus,
              ticketOffice: { ticketsByColor: { ...input.ticketOffice.ticketsByColor, [color]: count - 1 } },
              players: input.players.map(item => item.id === playerId ? { ...player,
                status: 'SUCCESS', ticketsByColor: { ...player.ticketsByColor,
                  [color]: player.ticketsByColor[color] + 1 },
              } : item),
              playerBoards: input.playerBoards.map(item => item.playerId === playerId
                ? { ...board, boardOrders: { ...board.boardOrders,
                  3: { orderId, orderStatus: 'unfulfilled', assistant: null } } } : item),
              orderMarket: { ...input.orderMarket,
                visibleOrders: { ...input.orderMarket.visibleOrders, 4: remaining[0] },
                orderMarket: { ...input.orderMarket.orderMarket, 4: [] },
                remainingOrderIds: mode === 'draw' ? remaining.slice(1) : [],
              },
            })
            expect(result.events).toEqual([
              { type: 'OrderTaken', playerId, orderId },
              { type: 'TicketReceived', playerId, color },
              ...(count === 1 ? [{ type: 'IntermediateScoringTriggered' }] : []),
              ...(mode === 'draw' ? [{ type: 'OrderMarketRefilled' }] : []),
            ])
            expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
            expect(input).toEqual(before)
            expect(Object.isFrozen(input)).toBe(false)
            expect(Object.isFrozen(result)).toBe(true)
            expect(Object.isFrozen(result.state)).toBe(true)
            expect(Object.isFrozen(result.state.playerBoards.find(item => item.playerId === playerId)!.boardOrders[3])).toBe(true)
            expect(Object.isFrozen(result.events)).toBe(true)
            expect(result.events.every(Object.isFrozen)).toBe(true)
            const restored = restoreGameState(JSON.parse(JSON.stringify(result.state)))
            expect(restored).toEqual(result.state)
            expect(restored.stateSchemaVersion).toBe(13)
            for (const viewer of [null, ...input.players.map(item => item.id)]) {
              const projection = projectGameForViewer(restored, viewer)
              expect(projection.players).toEqual(restored.players)
              expect(projection.playerBoards).toEqual(restored.playerBoards)
              expect(projection.ticketOffice).toEqual(restored.ticketOffice)
              expect(projection.intermediateScoringStatus).toBe(restored.intermediateScoringStatus)
              expect(projection.orderMarket).toEqual({ visibleOrders: restored.orderMarket.visibleOrders,
                remainingOrderCount: restored.orderMarket.remainingOrderIds.length })
              expect(projectEventsForViewer(result.events, restored, viewer)).toEqual(result.events)
            }
          })
      }
    }
    it(`выбор ${color} при нулевом запасе и пустом сбросе получает заказ без билета`, () => {
      const input = thirdSlotInput(0, color)
      expectOrderWithoutTicket(input, input.orderMarket.visibleOrders[1], '3', color)
    })
    it(`отсутствие карты для пополнения атомарно сохраняет последний ${color}`, () => {
      const base = thirdSlotInput(1, color)
      const input: GameState = { ...base, orderMarket: { ...base.orderMarket,
        remainingOrderIds: [], orderDiscard: [...base.orderMarket.orderDiscard, ...base.orderMarket.remainingOrderIds],
      } }
      const before = structuredClone(input)
      expect(() => receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER',
        input.orderMarket.visibleOrders[1], '3', color)).toThrow()
      expect(input).toEqual(before)
    })
  }

  it.each(['pending', 'completed'] as const)('последний W не назначает подсчёт повторно при %s', scoringStatus => {
    const input: GameState = { ...thirdSlotInput(1, 'W'), intermediateScoringStatus: scoringStatus }
    const result = receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[1], '3', 'W')
    expect(result.state.intermediateScoringStatus).toBe(scoringStatus)
    expect(result.state.ticketOffice.ticketsByColor.W).toBe(0)
    expect(result.events.map(event => event.type)).toEqual(['OrderTaken', 'TicketReceived', 'OrderMarketRefilled'])
  })

  it.each([undefined, null, '', 'X', 1, ['W']])('атомарно отклоняет отсутствующий или неверный цвет %j', color => {
    const input = thirdSlotInput(2, 'W')
    const before = structuredClone(input)
    expect(() => receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[1],
      '3', color as Parameters<typeof receiveOrder>[5])).toThrow()
    expect(input).toEqual(before)
    expect(Object.isFrozen(input)).toBe(false)
  })

  it.each(['unfulfilled'] as const)('атомарно отклоняет занятую третью клетку %s', orderStatus => {
    const base = thirdSlotInput(1, 'W')
    const input: GameState = { ...base,
      orderMarket: { ...base.orderMarket, remainingOrderIds: base.orderMarket.remainingOrderIds.slice(1) },
      playerBoards: base.playerBoards.map(board => board.playerId === base.activePlayerId
        ? { ...board, boardOrders: { ...board.boardOrders,
          3: { orderId: base.orderMarket.remainingOrderIds[0]!, orderStatus, assistant: null },
        } } : board),
    }
    const before = structuredClone(input)
    expect(() => receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[1], '3', 'W')).toThrow()
    expect(input).toEqual(before)
  })

  it.each([['1', 'B'], ['2', 'R']] as const)('клетка %s сохраняет фиксированную награду %s при переданном W', (slot, color) => {
    const input = scenario()
    const result = receiveOrder(input, input.activePlayerId, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[1], slot, 'W')
    expect(result.events.filter(event => event.type === 'TicketReceived')).toEqual([
      { type: 'TicketReceived', playerId: input.activePlayerId, color },
    ])
    expect(result.state.players.find(player => player.id === input.activePlayerId)!.ticketsByColor.W)
      .toBe(input.players.find(player => player.id === input.activePlayerId)!.ticketsByColor.W)
  })
})
describe('ORDER-003 / TICKET-002 / MID-001: замещение отсутствующего цвета', () => {
  it.each(['pending', 'completed'] as const)('обмен последнего замещающего билета сохраняет статус подсчёта %s', scoringStatus => {
    const base = scenario()
    const input: GameState = {
      ...base,
      intermediateScoringStatus: scoringStatus,
      ticketOffice: { ticketsByColor: { B: 0, R: 1, W: 2 } },
      ticketDiscard: { ...base.ticketDiscard, B: 1 },
    }
    const before = structuredClone(input)
    const playerId = input.activePlayerId
    const orderId = input.orderMarket.visibleOrders[1]!
    const result = receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, '1', null, { B: 'R' })
    expect(result.state.ticketOffice.ticketsByColor).toEqual({ B: 0, R: 0, W: 2 })
    expect(result.state.ticketDiscard).toEqual({ ...input.ticketDiscard, B: 0, R: input.ticketDiscard.R + 1 })
    const playerBefore = input.players.find(player => player.id === playerId)!
    expect(result.state.players.find(player => player.id === playerId)).toEqual({
      ...playerBefore, status: 'SUCCESS',
      ticketsByColor: { ...playerBefore.ticketsByColor, B: playerBefore.ticketsByColor.B + 1 },
    })
    expect(result.state.playerBoards.find(board => board.playerId === playerId)!.boardOrders[1])
      .toEqual({ orderId, orderStatus: 'unfulfilled', assistant: null })
    expect(input).toEqual(before)
    expect(result.state.runtimeRng).toEqual(input.runtimeRng)
    expect(result.state.intermediateScoringStatus).toBe(scoringStatus)
    expect(result.events).toEqual([
      { type: 'OrderTaken', playerId, orderId },
      { type: 'TicketExchanged', playerId, discardedColor: 'R', receivedColor: 'B' },
      { type: 'TicketReceived', playerId, color: 'B' },
      { type: 'OrderMarketRefilled' },
    ])
  })
})
describe('ORDER-003: замещение через публичную receiveOrder', () => {
  for (const [slot, color, donor] of [['1', 'B', 'R'], ['2', 'R', 'W'], ['3', 'W', 'B']] as const) {
    function inputForExchange(status: StatusPlayer, mode: 'draw' | 'reveal', scoringStatus: 'pending' | 'completed'): GameState {
      const base = scenario()
      const prepared: GameState = { ...withStatus(base, base.activePlayerId, status === 'REFRESH' ? 'WAITING' : status),
        intermediateScoringStatus: scoringStatus,
        ticketOffice: { ticketsByColor: { B: 2, R: 2, W: 2, [color]: 0, [donor]: 2 } },
        ticketDiscard: { ...base.ticketDiscard, [color]: 1 },
      }
      const ready = status === 'REFRESH' ? receiveOrder(prepared, prepared.activePlayerId!, 'REFRESH').state : prepared
      const remaining = [...Object.values(ready.orderMarket.orderMarket).flat(), ...ready.orderMarket.remainingOrderIds]
      return { ...ready, orderMarket: { ...ready.orderMarket,
        orderMarket: { 1: [], 2: mode === 'reveal' ? [remaining[0]!] : [], 3: [], 4: [] },
        remainingOrderIds: mode === 'reveal' ? [] : remaining,
        orderDiscard: mode === 'reveal'
          ? [...ready.orderMarket.orderDiscard, ...remaining.slice(1)] : ready.orderMarket.orderDiscard,
      } }
    }
    for (const status of ['WAITING', 'PENDING', 'REFRESH'] as const) {
      for (const scoringStatus of ['pending', 'completed'] as const) {
        it.each(['draw', 'reveal'] as const)(
          `клетка ${slot}: обмен ${donor} на ${color}, ${status}, ${scoringStatus}, %s`, mode => {
            const input = inputForExchange(status, mode, scoringStatus)
            const before = structuredClone(input)
            const playerId = input.activePlayerId!
            const orderId = input.orderMarket.visibleOrders[2]!
            const player = input.players.find(item => item.id === playerId)!
            const board = input.playerBoards.find(item => item.playerId === playerId)!
            const result = receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, slot, color, { [color]: donor })
            expect(result.state).toEqual({ ...input,
              ticketOffice: { ticketsByColor: { ...input.ticketOffice.ticketsByColor, [donor]: 1 } },
              ticketDiscard: { ...input.ticketDiscard, [color]: 0, [donor]: input.ticketDiscard[donor] + 1 },
              players: input.players.map(item => item.id === playerId ? { ...player, status: 'SUCCESS',
                ticketsByColor: { ...player.ticketsByColor, [color]: player.ticketsByColor[color] + 1 },
              } : item),
              playerBoards: input.playerBoards.map(item => item.playerId === playerId
                ? { ...board, boardOrders: { ...board.boardOrders, [slot]: { orderId, orderStatus: 'unfulfilled', assistant: null } } } : item),
              orderMarket: { ...input.orderMarket,
                visibleOrders: { ...input.orderMarket.visibleOrders,
                  2: mode === 'draw' ? input.orderMarket.remainingOrderIds[0] : input.orderMarket.orderMarket[2][0] },
                orderMarket: { ...input.orderMarket.orderMarket, 2: [] },
                remainingOrderIds: mode === 'draw' ? input.orderMarket.remainingOrderIds.slice(1) : [],
              },
            })
            expect(result.events).toEqual([
              { type: 'OrderTaken', playerId, orderId },
              { type: 'TicketExchanged', playerId, discardedColor: donor, receivedColor: color },
              { type: 'TicketReceived', playerId, color },
              ...(mode === 'draw' ? [{ type: 'OrderMarketRefilled' }] : []),
            ])
            expect(input).toEqual(before)
            expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
            expect(Object.isFrozen(result)).toBe(true)
            expect(Object.isFrozen(result.state.ticketDiscard)).toBe(true)
            expect(Object.isFrozen(result.state.ticketOffice.ticketsByColor)).toBe(true)
            expect(result.events.every(Object.isFrozen)).toBe(true)
            const restored = restoreGameState(JSON.parse(JSON.stringify(result.state)))
            expect(restored).toEqual(result.state)
            for (const viewer of [null, ...input.players.map(item => item.id)]) {
              const projection = projectGameForViewer(restored, viewer)
              expect(projection.players).toEqual(restored.players)
              expect(projection.ticketOffice).toEqual(restored.ticketOffice)
              expect(projection.ticketDiscard).toEqual(restored.ticketDiscard)
              expect(projection.intermediateScoringStatus).toBe(scoringStatus)
              expect(projectEventsForViewer(result.events, restored, viewer)).toEqual(result.events)
            }
          })
      }
    }

    for (const reason of ['empty-office', 'missing-discard'] as const) {
      it.each(['draw', 'reveal'] as const)(`клетка ${slot}: ${reason}, %s — заказ без билета и обмена`, mode => {
        const base = inputForExchange('PENDING', mode, 'completed')
        const input: GameState = reason === 'empty-office' ? { ...base,
          ticketOffice: { ticketsByColor: { B: 0, R: 0, W: 0 } }, ticketOfficeEmptyReached: true,
        } : { ...base, ticketDiscard: { ...base.ticketDiscard, [color]: 0 } }
        const before = structuredClone(input)
        const orderId = input.orderMarket.visibleOrders[2]!
        const result = receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', orderId, slot, color)
        expect(result.state.players).toEqual(input.players.map(player => player.id === input.activePlayerId
          ? { ...player, status: 'SUCCESS' } : player))
        expect(result.state.playerBoards.find(board => board.playerId === input.activePlayerId)!.boardOrders[slot])
          .toEqual({ orderId, orderStatus: 'unfulfilled', assistant: null })
        expect(result.state.ticketOffice).toEqual(input.ticketOffice)
        expect(result.state.ticketDiscard).toEqual(input.ticketDiscard)
        expect(result.state.intermediateScoringStatus).toBe('completed')
        expect(result.state.runtimeRng).toEqual(input.runtimeRng)
        expect(result.events).toEqual([
          { type: 'OrderTaken', playerId: input.activePlayerId, orderId },
          ...(mode === 'draw' ? [{ type: 'OrderMarketRefilled' }] : []),
        ])
        expect(input).toEqual(before)
        expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
        expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
      })
    }

    it.each([undefined, {}, { [color]: color }, { [color]: 'X' }, { X: donor }, null, []])(
      `клетка ${slot}: атомарный отказ при неверном или отсутствующем замещении %j`, replacement => {
        const input = inputForExchange('REFRESH', 'reveal', 'pending')
        const before = structuredClone(input)
        expect(() => receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[2],
          slot, color, replacement as Parameters<typeof receiveOrder>[6])).toThrow()
        expect(input).toEqual(before)
      })

    it(`клетка ${slot}: недоступный цвет замещения атомарно отклоняется`, () => {
      const base = inputForExchange('PENDING', 'draw', 'pending')
      const input: GameState = { ...base, ticketOffice: { ticketsByColor: { ...base.ticketOffice.ticketsByColor, [donor]: 0 } } }
      const before = structuredClone(input)
      expect(() => receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[2],
        slot, color, { [color]: donor })).toThrow()
      expect(input).toEqual(before)
    })

    it(`клетка ${slot}: отказ без карты пополнения сохраняет все ресурсы обмена`, () => {
      const base = inputForExchange('PENDING', 'draw', 'completed')
      const input: GameState = { ...base, orderMarket: { ...base.orderMarket, remainingOrderIds: [],
        orderDiscard: [...base.orderMarket.orderDiscard, ...base.orderMarket.remainingOrderIds] } }
      const before = structuredClone(input)
      expect(() => receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[2],
        slot, color, { [color]: donor })).toThrow()
      expect(input).toEqual(before)
    })

    it(`клетка ${slot}: доступный требуемый билет выдаётся без обмена`, () => {
      const base = inputForExchange('PENDING', 'draw', 'completed')
      const input: GameState = { ...base, ticketOffice: { ticketsByColor: { ...base.ticketOffice.ticketsByColor, [color]: 2 } } }
      const result = receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[2],
        slot, color, { [color]: donor })
      expect(result.events.map(event => event.type)).toEqual(['OrderTaken', 'TicketReceived', 'OrderMarketRefilled'])
      expect(result.state.ticketDiscard).toEqual(input.ticketDiscard)
      expect(result.state.ticketOffice.ticketsByColor[donor]).toBe(input.ticketOffice.ticketsByColor[donor])
      expect(result.state.ticketOffice.ticketsByColor[color]).toBe(1)
    })
  }
})
describe('ORDER-003: замена completed-заказа без помощника', () => {
  function replacementInput(slot: '1' | '2' | '3', status: StatusPlayer, mode: 'draw' | 'reveal'): GameState {
    const base = scenario()
    const oldOrderId = base.orderMarket.remainingOrderIds[0]!
    const prepared: GameState = { ...withStatus(base, base.activePlayerId, status === 'REFRESH' ? 'WAITING' : status),
      ticketOffice: { ticketsByColor: { B: 1, R: 1, W: 1 } },
      orderMarket: { ...base.orderMarket, remainingOrderIds: base.orderMarket.remainingOrderIds.slice(1) },
      playerBoards: base.playerBoards.map(board => board.playerId === base.activePlayerId
        ? { ...board, boardOrders: { ...board.boardOrders,
          [slot]: { orderId: oldOrderId, orderStatus: 'completed', assistant: null } } } : board),
    }
    const ready = status === 'REFRESH' ? receiveOrder(prepared, prepared.activePlayerId!, 'REFRESH').state : prepared
    const remaining = [...Object.values(ready.orderMarket.orderMarket).flat(), ...ready.orderMarket.remainingOrderIds]
    return { ...ready, orderMarket: { ...ready.orderMarket,
      orderMarket: { 1: [], 2: [], 3: mode === 'reveal' ? [remaining[0]!] : [], 4: [] },
      remainingOrderIds: mode === 'reveal' ? [] : remaining,
      orderDiscard: mode === 'reveal'
        ? [...ready.orderMarket.orderDiscard, ...remaining.slice(1)] : ready.orderMarket.orderDiscard,
    } }
  }

  for (const slot of ['1', '2', '3'] as const) {
    for (const status of ['WAITING', 'PENDING', 'REFRESH'] as const) {
      it.each(['draw', 'reveal'] as const)(`клетка ${slot}, ${status}, %s: старый заказ в сброс, новый без билета`, mode => {
        const input = replacementInput(slot, status, mode)
        const before = structuredClone(input)
        const playerId = input.activePlayerId!
        const orderId = input.orderMarket.visibleOrders[3]!
        const board = input.playerBoards.find(item => item.playerId === playerId)!
        const oldOrderId = board.boardOrders[slot].orderId!
        // Цвет не передаётся даже для третьей клетки: награда при замене отсутствует.
        const result = receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, slot)
        expect(result.state).toEqual({ ...input,
          players: input.players.map(player => player.id === playerId ? { ...player, status: 'SUCCESS' } : player),
          playerBoards: input.playerBoards.map(item => item.playerId === playerId
            ? { ...board, boardOrders: { ...board.boardOrders, [slot]: { orderId, orderStatus: 'unfulfilled', assistant: null } } } : item),
          orderMarket: { ...input.orderMarket,
            orderDiscard: [...input.orderMarket.orderDiscard, oldOrderId],
            visibleOrders: { ...input.orderMarket.visibleOrders, 3: mode === 'draw'
              ? input.orderMarket.remainingOrderIds[0] : input.orderMarket.orderMarket[3][0] },
            orderMarket: { ...input.orderMarket.orderMarket, 3: [] },
            remainingOrderIds: mode === 'draw' ? input.orderMarket.remainingOrderIds.slice(1) : [],
          },
        })
        expect(result.events).toEqual([
          { type: 'OrderDiscarded', playerId, orderId: oldOrderId },
          { type: 'OrderTaken', playerId, orderId },
          ...(mode === 'draw' ? [{ type: 'OrderMarketRefilled' }] : []),
        ])
        expect(result.state.orderMarket.orderDiscard.filter(id => id === oldOrderId)).toHaveLength(1)
        expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
        expect(new Set(allOrderIds(result.state)).size).toBe(allOrderIds(result.state).length)
        expect(input).toEqual(before)
        expect(Object.isFrozen(input)).toBe(false)
        expect(Object.isFrozen(result)).toBe(true)
        expect(Object.isFrozen(result.state)).toBe(true)
        expect(Object.isFrozen(result.state.playerBoards.find(item => item.playerId === playerId)!.boardOrders[slot])).toBe(true)
        expect(Object.isFrozen(result.state.orderMarket.orderDiscard)).toBe(true)
        expect(Object.isFrozen(result.events)).toBe(true)
        expect(result.events.every(Object.isFrozen)).toBe(true)
        const restored = restoreGameState(JSON.parse(JSON.stringify(result.state)))
        expect(restored).toEqual(result.state)
        expect(restored.stateSchemaVersion).toBe(13)
        for (const viewer of [null, ...input.players.map(player => player.id)]) {
          const projection = projectGameForViewer(restored, viewer)
          expect(projection.playerBoards).toEqual(restored.playerBoards)
          expect(projection.players).toEqual(restored.players)
          expect(projection.ticketOffice).toEqual(restored.ticketOffice)
          expect(projection.ticketDiscard).toEqual(restored.ticketDiscard)
          expect(projection.intermediateScoringStatus).toBe(input.intermediateScoringStatus)
          expect(projection.orderMarket).toEqual({ visibleOrders: restored.orderMarket.visibleOrders,
            remainingOrderCount: restored.orderMarket.remainingOrderIds.length })
          expect(projectEventsForViewer(result.events, restored, viewer)).toEqual(result.events)
        }
        expectAtomicRejection(result.state, result.state.orderMarket.visibleOrders[3], slot)
      })
    }

    it(`клетка ${slot}: обратный порядок планшетов сохраняет старый ID нужного игрока`, () => {
      const base = replacementInput(slot, 'PENDING', 'draw')
      const input: GameState = { ...base, playerBoards: [...base.playerBoards].reverse() }
      const playerId = input.activePlayerId!
      const board = input.playerBoards.find(item => item.playerId === playerId)!
      const result = receiveOrder(input, playerId, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[3], slot)
      expect(result.state.orderMarket.orderDiscard).toEqual([...input.orderMarket.orderDiscard, board.boardOrders[slot].orderId])
      expect(result.state.players.find(player => player.id === playerId)!.ticketsByColor)
        .toEqual(input.players.find(player => player.id === playerId)!.ticketsByColor)
      expect(result.state.playerBoards.filter(item => item.playerId !== playerId))
        .toEqual(input.playerBoards.filter(item => item.playerId !== playerId))
      expect(allOrderIds(result.state)).toEqual(allOrderIds(input))
    })

    it(`клетка ${slot}: отсутствие карты пополнения сохраняет completed и сброс атомарно`, () => {
      const base = replacementInput(slot, 'PENDING', 'draw')
      const input: GameState = { ...base, orderMarket: { ...base.orderMarket,
        remainingOrderIds: [], orderDiscard: [...base.orderMarket.orderDiscard, ...base.orderMarket.remainingOrderIds],
      } }
      expectAtomicRejection(input, input.orderMarket.visibleOrders[3], slot)
    })

    it(`клетка ${slot}: неверный открытый заказ после REFRESH сохраняет completed и обновлённый рынок`, () => {
      const input = replacementInput(slot, 'REFRESH', 'reveal')
      expectAtomicRejection(input, 'missing', slot)
    })
  }
})