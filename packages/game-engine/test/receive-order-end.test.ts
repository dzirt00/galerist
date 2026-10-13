import { describe, expect, it } from 'vitest'
import {
  receiveOrder, advanceTurn, triggerGameEnd, restoreGameState,
  projectGameForViewer, projectEventsForViewer, type GameState,
} from '../src/index.js'
import { createGameState, startGameAfterSetup, withGameEndConditions } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { expectOrderRecycled } from './order-recycle-assertions.js'

function scenario(color: 'B' | 'R' | 'W', second: 'none' | 'bag' | 'superstars',
  mode: 'draw' | 'reveal' | 'recycle', scoringStatus: 'pending' | 'completed' = 'completed',
  phase: 'regular_play' | 'ending_current_round' | 'final_round' = 'regular_play'): GameState {
  const base = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  let ready: GameState = phase === 'regular_play' ? base
    : triggerGameEnd(withGameEndConditions(base, 'ticketOffice')).state
  if (phase === 'final_round') {
    while (ready.phase === 'ending_current_round') ready = advanceTurn(ready).state
  }
  return { ...ready, intermediateScoringStatus: scoringStatus, ticketOfficeEmptyReached: false,
    // Другие стопки уже пусты, поэтому подсчёт ранее назначен либо исполнен.
    ticketOffice: { ticketsByColor: { B: 0, R: 0, W: 0, [color]: 1 } },
    visitorBag: second === 'bag' ? { ...ready.visitorBag, visitors: [] } : ready.visitorBag,
    artistMarket: second === 'superstars' ? { ...ready.artistMarket,
      slots: ready.artistMarket.slots.map((artist, index) => index < 2
        ? { ...artist, isOpen: true, fame: 19, isSuperstar: true } : artist),
    } : ready.artistMarket,
    orderMarket: { ...ready.orderMarket,
      orderMarket: { 1: [], 2: [], 3: [], 4: mode === 'reveal' ? [ready.orderMarket.remainingOrderIds[0]!] : [] },
      remainingOrderIds: mode === 'draw' ? ready.orderMarket.remainingOrderIds : [],
      orderDiscard: mode === 'draw' ? ready.orderMarket.orderDiscard
        : [...ready.orderMarket.orderDiscard, ...ready.orderMarket.remainingOrderIds.slice(mode === 'reveal' ? 1 : 0)],
    },
  }
}

describe('ORDER-003 / END-001/002: последний билет через публичную receiveOrder', () => {
  for (const [slot, color] of [['1', 'B'], ['2', 'R'], ['3', 'W']] as const) {
    for (const second of ['none', 'bag', 'superstars'] as const) {
      for (const scoringStatus of ['pending', 'completed'] as const) {
        it.each(['draw', 'reveal', 'recycle'] as const)(
          `клетка ${slot}, индикатор ${second}, подсчёт ${scoringStatus}, %s: фиксирует пустую кассу и запускает завершение один раз`, mode => {
            const input = restoreGameState(JSON.parse(JSON.stringify(scenario(color, second, mode, scoringStatus))))
            const before = structuredClone(input)
            const playerId = input.activePlayerId!
            const player = input.players.find(item => item.id === playerId)!
            const orderId = input.orderMarket.visibleOrders[4]!
            const result = mode === 'recycle'
              ? expectOrderRecycled(input, orderId, slot, color)
              : receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, slot, color)
            expect(result.state.ticketOffice).toEqual({ ticketsByColor: { B: 0, R: 0, W: 0 } })
            expect(result.state.ticketOfficeEmptyReached).toBe(true)
            expect(result.state.ticketDiscard).toEqual(input.ticketDiscard)
            expect(result.state.players.find(item => item.id === playerId)).toEqual({ ...player, status: 'SUCCESS',
              ticketsByColor: { ...player.ticketsByColor, [color]: player.ticketsByColor[color] + 1 },
            })
            expect(result.state.intermediateScoringStatus).toBe(scoringStatus)
            expect(result.state.playerBoards.find(board => board.playerId === playerId)!.boardOrders[slot])
              .toEqual({ orderId, orderStatus: 'unfulfilled', assistant: null })
            expect(result.state.phase).toBe(second === 'none' ? 'regular_play' : 'ending_current_round')
            expect(result.state.round).toBe(input.round)
            expect(result.state).toHaveProperty('firstPlayerId', 'firstPlayerId' in input ? input.firstPlayerId : null)
            expect(result.state.activePlayerId).toBe(input.activePlayerId)
            if (second !== 'none') expect(result.state).toHaveProperty('endTriggeredRound', input.round)
            expect(result.events).toEqual([
              { type: 'OrderTaken', playerId, orderId },
              ...(mode === 'recycle' ? [{ type: 'OrderDeckRecycled', playerId }, { type: 'OrderMarketRefreshed', playerId }] : []),
              { type: 'TicketReceived', playerId, color },
              { type: 'EndConditionReached' },
              ...(second === 'none' ? [] : [{ type: 'GameEndTriggered' }]),
              ...(mode === 'reveal' ? [] : [{ type: 'OrderMarketRefilled' }]),
            ])
            if (mode !== 'recycle') expect(result.state.runtimeRng).toEqual(input.runtimeRng)
            expect(input).toEqual(before)
            expect(Object.isFrozen(result)).toBe(true)
            expect(Object.isFrozen(result.state)).toBe(true)
            expect(result.events.every(Object.isFrozen)).toBe(true)
            const restored = restoreGameState(JSON.parse(JSON.stringify(result.state)))
            expect(restored).toEqual(result.state)
            for (const viewer of [null, ...input.players.map(item => item.id)]) {
              const projection = projectGameForViewer(restored, viewer)
              expect(projection.ticketOfficeEmptyReached).toBe(true)
              expect(projection.phase).toBe(restored.phase)
              expect(projection.players).toEqual(restored.players)
              expect(projectEventsForViewer(result.events, restored, viewer)).toEqual(result.events)
            }
            const next = advanceTurn(result.state).state
            const repeated = receiveOrder(next, next.activePlayerId!, 'ACCEPT_ORDER', next.orderMarket.visibleOrders[4], slot, color)
            expect(repeated.state.ticketOfficeEmptyReached).toBe(true)
            expect(repeated.events.some(event => event.type === 'EndConditionReached' || event.type === 'GameEndTriggered')).toBe(false)
          })
      }
    }

    it.each(['ending_current_round', 'final_round'] as const)(
      `клетка ${slot}: в %s выдаёт последний билет без повторного GameEndTriggered`, phase => {
        const input = scenario(color, 'none', 'draw', 'completed', phase)
        const playerId = input.activePlayerId!
        const orderId = input.orderMarket.visibleOrders[4]!
        const result = receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, slot, color)
        expect(result.state.phase).toBe(phase)
        expect(result.state).toHaveProperty('endTriggeredRound', (input as { endTriggeredRound: number }).endTriggeredRound)
        expect(result.state.ticketOfficeEmptyReached).toBe(true)
        expect(result.events).toEqual([
          { type: 'OrderTaken', playerId, orderId }, { type: 'TicketReceived', playerId, color },
          { type: 'EndConditionReached' }, { type: 'OrderMarketRefilled' },
        ])
        expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
      })

    it(`клетка ${slot}: пустая отдельная стопка и один другой индикатор не запускают завершение`, () => {
      const base = scenario(color, 'bag', 'draw')
      const other = color === 'B' ? 'R' : 'B'
      const input: GameState = { ...base, ticketOffice: { ticketsByColor: { ...base.ticketOffice.ticketsByColor, [other]: 2 } } }
      const result = receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[4], slot, color)
      expect(result.state.phase).toBe('regular_play')
      expect(result.state.ticketOfficeEmptyReached).toBe(false)
      expect(result.events.map(event => event.type)).toEqual(['OrderTaken', 'TicketReceived', 'OrderMarketRefilled'])
    })
  }

  it('после GameEndTriggered финальный раунд начинается только на границе через advanceTurn', () => {
    const input = scenario('B', 'bag', 'draw')
    const received = receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[4], '1')
    expect(received.state.phase).toBe('ending_current_round')
    const once = advanceTurn(received.state)
    expect(once.state.phase).toBe('ending_current_round')
    expect(once.events.some(event => event.type === 'FinalRoundStarted')).toBe(false)
    const boundary = advanceTurn(once.state)
    expect(boundary.state.phase).toBe('final_round')
    expect(boundary.events.filter(event => event.type === 'FinalRoundStarted')).toHaveLength(1)
    expect(boundary.events.some(event => event.type === 'GameEndTriggered')).toBe(false)
  })

  it.each(['occupied', 'missing-color'] as const)('отказ %s атомарно сохраняет последний билет и индикаторы', reason => {
    const base = scenario('W', 'bag', 'draw')
    const input: GameState = reason === 'occupied' ? { ...base,
      playerBoards: base.playerBoards.map(board => board.playerId === base.activePlayerId
        ? { ...board, boardOrders: { ...board.boardOrders,
          3: { orderId: base.orderMarket.remainingOrderIds[0]!, orderStatus: 'unfulfilled', assistant: null },
        } } : board),
      orderMarket: { ...base.orderMarket, remainingOrderIds: base.orderMarket.remainingOrderIds.slice(1) },
    } : base
    const before = structuredClone(input)
    expect(() => receiveOrder(input, input.activePlayerId!, 'ACCEPT_ORDER', input.orderMarket.visibleOrders[4],
      '3', reason === 'occupied' ? 'W' : null)).toThrow()
    expect(input).toEqual(before)
    expect(input.ticketOfficeEmptyReached).toBe(false)
  })
})