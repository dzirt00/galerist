import { expectOrderRecycled } from './order-recycle-assertions.js'
import { describe, expect, it } from 'vitest'
import {
  receiveOrder, restoreGameState, projectGameForViewer, projectEventsForViewer,
  type GameState, type StatusPlayer,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function scenario(slot: '1' | '2' | '3' = '3', office = 3,
  status: StatusPlayer = 'WAITING', mode: 'draw' | 'reveal' = 'draw') {
  const base = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const playerId = base.activePlayerId
  const board = base.playerBoards.find(item => item.playerId === playerId)!
  const ids = [...board.assistants.assistantOfficeIds, ...board.assistants.assistantHireQueueIds]
  const assistantId = ids[office]!
  const oldOrderId = base.orderMarket.remainingOrderIds[0]!
  const prepared: GameState = { ...base,
    players: base.players.map(player => player.id === playerId
      ? { ...player, status: status === 'REFRESH' ? 'WAITING' : status } : player),
    playerBoards: base.playerBoards.map(item => item.playerId === playerId
      ? { ...item, assistants: { ...item.assistants, office,
        assistantOfficeIds: ids.slice(0, office),
        assistantHireQueueIds: ids.slice(office + 1), hireQueue: ids.length - office - 1,
      }, boardOrders: { ...item.boardOrders,
        [slot]: { orderId: oldOrderId, orderStatus: 'completed', assistant: assistantId },
      } } : item),
    orderMarket: { ...base.orderMarket, remainingOrderIds: base.orderMarket.remainingOrderIds.slice(1) },
  }
  const ready = status === 'REFRESH' ? receiveOrder(prepared, playerId, 'REFRESH').state : prepared
  const remaining = [...Object.values(ready.orderMarket.orderMarket).flat(), ...ready.orderMarket.remainingOrderIds]
  const input: GameState = { ...ready, orderMarket: { ...ready.orderMarket,
    orderMarket: { 1: mode === 'reveal' ? [remaining[0]!] : [], 2: [], 3: [], 4: [] },
    remainingOrderIds: mode === 'reveal' ? [] : remaining,
    orderDiscard: mode === 'reveal'
      ? [...ready.orderMarket.orderDiscard, ...remaining.slice(1)] : ready.orderMarket.orderDiscard,
  } }
  return { input, playerId, assistantId, oldOrderId }
}

function assistantLocations(state: GameState, playerId: string) {
  const board = state.playerBoards.find(item => item.playerId === playerId)!
  return [...board.assistants.assistantOfficeIds, ...board.assistants.assistantHireQueueIds,
    ...Object.values(board.boardOrders).flatMap(order => order.assistant === null ? [] : [order.assistant])]
}

describe('ORDER-003 / EJECT-005: помощник заменяемого заказа через receiveOrder', () => {
  for (const slot of ['1', '2', '3'] as const) {
    for (const office of [1, 3, 4]) {
      for (const status of ['WAITING', 'PENDING', 'REFRESH'] as const) {
        it.each(['draw', 'reveal'] as const)(
          `клетка ${slot}, офис ${office}, ${status}, %s: возврат или удаление исходного помощника`, mode => {
            const { input: source, playerId, assistantId, oldOrderId } = scenario(slot, office, status, mode)
            // Восстановление проверяет реальную схему 13, в том числе уникальность всех размещений.
            const input = restoreGameState(JSON.parse(JSON.stringify({
              ...source, playerBoards: [...source.playerBoards].reverse(),
            })))
            const before = structuredClone(input)
            const orderId = input.orderMarket.visibleOrders[1]!
            const board = input.playerBoards.find(item => item.playerId === playerId)!
            const result = receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, slot)
            expect(result.state).toEqual({ ...input,
              players: input.players.map(player => player.id === playerId ? { ...player, status: 'SUCCESS' } : player),
              playerBoards: input.playerBoards.map(item => item.playerId === playerId
                ? { ...board, boardOrders: { ...board.boardOrders,
                  [slot]: { orderId, orderStatus: 'unfulfilled', assistant: null },
                }, assistants: office === 4 ? board.assistants : { ...board.assistants,
                  office: office + 1, assistantOfficeIds: [...board.assistants.assistantOfficeIds, assistantId],
                } } : item),
              orderMarket: { ...input.orderMarket,
                orderDiscard: [...input.orderMarket.orderDiscard, oldOrderId],
                visibleOrders: { ...input.orderMarket.visibleOrders, 1: mode === 'draw'
                  ? input.orderMarket.remainingOrderIds[0] : input.orderMarket.orderMarket[1][0] },
                orderMarket: { ...input.orderMarket.orderMarket, 1: [] },
                remainingOrderIds: mode === 'draw' ? input.orderMarket.remainingOrderIds.slice(1) : [],
              },
            })
            expect(result.events).toEqual([
              { type: 'OrderDiscarded', playerId, orderId: oldOrderId },
              { type: 'OrderTaken', playerId, orderId },
              { type: office === 4 ? 'AssistantRemovedFromGame' : 'AssistantReturnedHome', playerId, assistantId },
              ...(mode === 'draw' ? [{ type: 'OrderMarketRefilled' }] : []),
            ])
            const locations = assistantLocations(result.state, playerId)
            expect(locations.filter(id => id === assistantId)).toHaveLength(office === 4 ? 0 : 1)
            expect(new Set(locations).size).toBe(locations.length)
            expect(locations.length).toBe(assistantLocations(input, playerId).length - (office === 4 ? 1 : 0))
            expect(input).toEqual(before)
            expect(Object.isFrozen(result)).toBe(true)
            expect(Object.isFrozen(result.state.playerBoards.find(item => item.playerId === playerId)!.assistants.assistantOfficeIds)).toBe(true)
            expect(Object.isFrozen(result.events)).toBe(true)
            expect(result.events.every(Object.isFrozen)).toBe(true)
            const restored = restoreGameState(JSON.parse(JSON.stringify(result.state)))
            expect(restored).toEqual(result.state)
            expect(restored.stateSchemaVersion).toBe(16)
            for (const viewer of [null, ...input.players.map(player => player.id)]) {
              const projection = projectGameForViewer(restored, viewer)
              expect(projection.playerBoards).toEqual(restored.playerBoards)
              expect(projection.players).toEqual(restored.players)
              expect(projection.ticketOffice).toEqual(restored.ticketOffice)
              expect(projection.orderMarket).toEqual({ visibleOrders: restored.orderMarket.visibleOrders,
                remainingOrderCount: restored.orderMarket.remainingOrderIds.length })
              expect(projectEventsForViewer(result.events, restored, viewer)).toEqual(result.events)
            }
            expect(() => receiveOrder(restored, playerId, 'ACCEPT_ORDER', restored.orderMarket.visibleOrders[1], slot)).toThrow()
          })
      }
    }
    it.each([3, 4])(`клетка ${slot}: переработка пустой колоды сохраняет эффект помощника при офисе %i`, office => {
      const { input: base, playerId } = scenario(slot, office)
      const input: GameState = { ...base, orderMarket: { ...base.orderMarket, remainingOrderIds: [],
        orderDiscard: [...base.orderMarket.orderDiscard, ...base.orderMarket.remainingOrderIds] } }
      const before = structuredClone(input)
      const result = expectOrderRecycled(input, input.orderMarket.visibleOrders[1], slot)
      const assistantId = input.playerBoards.find(board => board.playerId === playerId)!.boardOrders[slot].assistant
      expect(assistantLocations(result.state, playerId).filter(id => id === assistantId)).toHaveLength(office === 4 ? 0 : 1)
      expect(result.state.playerBoards.find(board => board.playerId === playerId)!.assistants.assistantHireQueueIds)
        .toEqual(input.playerBoards.find(board => board.playerId === playerId)!.assistants.assistantHireQueueIds)
      expect(input).toEqual(before)
    })
  }
})

describe('Схема 13: контракт помощника на заказе', () => {
  it.each([undefined, '', 17, {}])('отклоняет отсутствующий или неверный assistant %j', assistant => {
    const { input, playerId } = scenario()
    const snapshot = JSON.parse(JSON.stringify(input))
    snapshot.playerBoards.find((board: { playerId: string }) => board.playerId === playerId).boardOrders[3].assistant = assistant
    expect(() => restoreGameState(snapshot)).toThrow()
  })
  it('отклоняет помощника на пустой клетке', () => {
    const { input, playerId, assistantId } = scenario()
    const snapshot = JSON.parse(JSON.stringify(input))
    snapshot.playerBoards.find((board: { playerId: string }) => board.playerId === playerId).boardOrders[3] =
      { orderId: null, orderStatus: null, assistant: assistantId }
    expect(() => restoreGameState(snapshot)).toThrow()
  })
  it.each(['office', 'hire-queue', 'other-order'] as const)('отклоняет дублирование с %s', location => {
    const { input, playerId, assistantId } = scenario()
    const snapshot = JSON.parse(JSON.stringify(input))
    const board = snapshot.playerBoards.find((item: { playerId: string }) => item.playerId === playerId)
    if (location === 'office') {
      board.boardOrders[3].assistant = board.assistants.assistantOfficeIds[0]
    } else if (location === 'hire-queue') {
      board.boardOrders[3].assistant = board.assistants.assistantHireQueueIds[0]
    } else {
      board.boardOrders[2] = { orderId: input.orderMarket.remainingOrderIds[0], orderStatus: 'completed', assistant: assistantId }
      snapshot.orderMarket.remainingOrderIds.shift()
    }
    expect(() => restoreGameState(snapshot)).toThrow()
  })
  it('отклоняет старую схему 12 вместо неявного восстановления без assistant', () => {
    const { input } = scenario()
    expect(() => restoreGameState({ ...input, stateSchemaVersion: 12 })).toThrow('stateSchemaVersion')
  })
})
