import { describe, expect, it } from 'vitest'
import {
  advanceTurn, receiveOrder, triggerGameEnd, restoreGameState, projectGameForViewer, projectEventsForViewer,
  type GameState,
} from '../src/index.js'
import { createGameState, startGameAfterSetup, withGameEndConditions, conserveFixtureComponents } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

/** Готовит завершение хода в выбранной фазе с границей раунда и отложенным доходом. */
function scenario(phase: 'regular_play' | 'ending_current_round' | 'final_round' = 'regular_play',
  boundary = false, pendingIncome = false): GameState {
  const base = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  let ready: GameState = phase === 'regular_play' ? base : triggerGameEnd(withGameEndConditions(base)).state
  if (phase === 'final_round') {
    while (ready.phase === 'ending_current_round') ready = advanceTurn(ready).state
  }
  const firstIndex = ready.players.findIndex(player => player.id === ready.firstPlayerId)
  const activeIndex = boundary ? (firstIndex + ready.players.length - 1) % ready.players.length : firstIndex
  return { ...ready, activePlayerId: ready.players[activeIndex]!.id,
    intermediateScoringStatus: pendingIncome ? 'pending' : ready.intermediateScoringStatus,
    players: ready.players.map((player, index) => ({ ...player, status: index === 0 ? 'SUCCESS' : 'REFUSAL' })),
    playerBoards: pendingIncome ? ready.playerBoards.map((board, index) => ({ ...board, gallery: { ...board.gallery,
      visitors: index === 0 ? [{ id: 'turn-end-B1', type: 'B' }, { id: 'turn-end-B2', type: 'B' }, { id: 'turn-end-R', type: 'R' }]
        : [{ id: 'turn-end-W', type: 'W' }],
    } })) : ready.playerBoards,
  }
}

describe('ORDER-001/002/003 и TURN-005: сброс этапа получения заказа в конце хода', () => {
  for (const phase of ['regular_play', 'ending_current_round', 'final_round'] as const) {
    for (const boundary of [false, true]) {
      it.each([false, true])(`${phase}, граница раунда=${boundary}, pending доход=%s: сохраняет доход и сбрасывает всех игроков`, pendingIncome => {
        const input = restoreGameState(conserveFixtureComponents(scenario(phase, boundary, pendingIncome)))
        const before = structuredClone(input)
        const activeIndex = input.players.findIndex(player => player.id === input.activePlayerId)
        const nextPlayerId = input.players[(activeIndex + 1) % input.players.length]!.id
        const result = advanceTurn(input)
        expect(result.state.players).toEqual(input.players.map((player, index) => ({ ...player, status: 'WAITING',
          coins: player.coins + (pendingIncome ? index === 0 ? 4 : 1 : 0),
          influence: player.influence + (pendingIncome ? index === 0 ? 2 : 1 : 0),
        })))
        expect(result.state.intermediateScoringStatus).toBe(pendingIncome ? 'completed' : input.intermediateScoringStatus)
        const isFinalScoring = boundary && phase === 'final_round'
        expect(result.state.phase).toBe(isFinalScoring ? 'final_scoring'
          : boundary && phase === 'ending_current_round' ? 'final_round' : phase)
        expect(result.state.activePlayerId).toBe(isFinalScoring ? null : nextPlayerId)
        expect(result.state.round).toBe(isFinalScoring ? input.round : input.round + (boundary ? 1 : 0))
        expect(result.events).toEqual([
          ...(pendingIncome ? input.players.map(player => ({ type: 'IntermediateIncomeAwarded', playerId: player.id })) : []),
          { type: 'TurnEnded', playerId: input.activePlayerId },
          ...(boundary ? [{ type: 'RoundEnded', round: input.round }] : []),
          ...(isFinalScoring ? [{ type: 'FinalRoundEnded' }, { type: 'FinalScoringStarted' }]
            : [...(boundary ? [{ type: 'RoundStarted', round: input.round + 1 }] : []),
              ...(boundary && phase === 'ending_current_round' ? [{ type: 'FinalRoundStarted' }] : []),
              { type: 'TurnStarted', playerId: nextPlayerId }]),
        ])
        expect(result.state.ticketOffice).toEqual(input.ticketOffice)
        expect(result.state.ticketDiscard).toEqual(input.ticketDiscard)
        expect(result.state.orderMarket).toEqual(input.orderMarket)
        expect(result.state.runtimeRng).toEqual(input.runtimeRng)
        expect(input).toEqual(before)
        expect(Object.isFrozen(result)).toBe(true)
        expect(Object.isFrozen(result.state.players)).toBe(true)
        expect(result.state.players.every(Object.isFrozen)).toBe(true)
        expect(result.events.every(Object.isFrozen)).toBe(true)
        const restored = restoreGameState(JSON.parse(JSON.stringify(result.state)))
        expect(restored).toEqual(result.state)
        for (const viewer of [null, ...input.players.map(player => player.id)]) {
          expect(projectGameForViewer(restored, viewer).players).toEqual(restored.players)
          expect(projectEventsForViewer(result.events, restored, viewer)).toEqual(result.events)
        }
      })

      for (const unfinished of ['PENDING', 'REFRESH'] as const) {
        for (const playerIndex of [0, 1]) {
          it.each([false, true])(`${phase}, граница=${boundary}, игрок ${playerIndex} в ${unfinished}, доход=%s: атомарный отказ`, pendingIncome => {
            const base = scenario(phase, boundary, pendingIncome)
            const input: GameState = { ...base, players: base.players.map((player, index) =>
              index === playerIndex ? { ...player, status: unfinished } : player) }
            const before = structuredClone(input)
            const wasFrozen = Object.isFrozen(input)
            expect(() => advanceTurn(input)).toThrow('Invalid status')
            expect(input).toEqual(before)
            expect(Object.isFrozen(input)).toBe(wasFrozen)
            expect(input.intermediateScoringStatus).toBe(pendingIncome ? 'pending' : base.intermediateScoringStatus)
          })
        }
      }
    }
  }
  for (const first of ['WAITING', 'SUCCESS', 'REFUSAL'] as const) {
    it.each(['WAITING', 'SUCCESS', 'REFUSAL'] as const)(`сохраняет ресурсы при сочетании ${first}/%s`, second => {
      const base = scenario()
      const input: GameState = { ...base, players: base.players.map((player, index) => ({ ...player,
        status: index === 0 ? first : second })) }
      const result = advanceTurn(input)
      expect(result.state.players).toEqual(input.players.map(player => ({ ...player, status: 'WAITING' })))
    })
  }

  it.each(['SUCCESS', 'REFUSAL'] as const)('публичный цикл %s → advanceTurn → WAITING → новое получение', status => {
    const base = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
    const playerId = base.activePlayerId
    const completed = status === 'SUCCESS'
      ? receiveOrder(base, playerId, 'ACCEPT_ORDER', base.orderMarket.visibleOrders[1], '1')
      : receiveOrder(receiveOrder(base, playerId, 'REFRESH').state, playerId, 'DECLINE')
    const before = structuredClone(completed.state)
    expect(() => receiveOrder(completed.state, playerId, 'REFRESH')).toThrow()
    const advanced = advanceTurn(completed.state)
    expect(advanced.state.players.find(player => player.id === playerId)!.status).toBe('WAITING')
    const nextOwnTurn = advanceTurn(advanced.state)
    expect(nextOwnTurn.state.activePlayerId).toBe(playerId)
    const slot = status === 'SUCCESS' ? '2' : '1'
    const result = receiveOrder(nextOwnTurn.state, playerId, 'ACCEPT_ORDER', nextOwnTurn.state.orderMarket.visibleOrders[1], slot)
    expect(result.state.players.find(player => player.id === playerId)!.status).toBe('SUCCESS')
    expect(completed.state).toEqual(before)
  })
})
