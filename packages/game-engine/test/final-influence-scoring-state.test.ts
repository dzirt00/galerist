import { expect, it } from 'vitest'
import {
  advanceTurn,
  applyFinalInfluenceScoringToGameState,
  projectEventsForViewer,
  restoreGameState,
  triggerGameEnd,
  type FinalScoringGameState,
  type GameState,
} from '../src/index.js'
import {
  twoPlayerConfigs,
  twoPlayerGameConfig,
} from './fixtures.js'
import {
  createGameState,
  startGameAfterSetup,
} from './helpers.js'

function advanceToFinalScoring(
  initialState: GameState,
): FinalScoringGameState {
  let state = initialState

  while (state.phase !== 'final_scoring') {
    state = advanceTurn(state).state
  }

  return state
}

function createFinalScoringState(): FinalScoringGameState {
  return advanceToFinalScoring(
    triggerGameEnd(
      startGameAfterSetup(
        createGameState(twoPlayerGameConfig, twoPlayerConfigs),
      ),
    ).state,
  )
}

it('начисляет граничные выплаты и создаёт публичные события в порядке игроков', () => {
  const baseState = createFinalScoringState()
  const state: FinalScoringGameState = {
    ...baseState,
    players: [
      { ...baseState.players[0]!, coins: 7, influence: 0 },
      { ...baseState.players[1]!, coins: 11, influence: 35 },
    ],
  }
  const snapshot = structuredClone(state)

  const transition = applyFinalInfluenceScoringToGameState(state)

  expect(transition.state.players).toEqual([
    { ...state.players[0]!, coins: 7 },
    { ...state.players[1]!, coins: 31 },
  ])
  expect(transition.events).toEqual([
    { type: 'InfluenceScored', playerId: 'player-1', coinsAwarded: 0 },
    { type: 'InfluenceScored', playerId: 'player-2', coinsAwarded: 20 },
  ])
  expect(projectEventsForViewer(
    transition.events,
    transition.state,
    'player-1',
  )).toEqual(transition.events)
  expect(projectEventsForViewer(
    transition.events,
    transition.state,
    null,
  )).toEqual(transition.events)

  expect(state).toEqual(snapshot)
  expect(state.finalInfluenceScored).toBe(false)
  expect(transition.state.finalInfluenceScored).toBe(true)
  expect(transition.state.artworkMarket).toBe(state.artworkMarket)
  expect(Object.isFrozen(transition)).toBe(true)
  expect(Object.isFrozen(transition.state)).toBe(true)
  expect(Object.isFrozen(transition.state.players)).toBe(true)
  expect(transition.state.players.every(Object.isFrozen)).toBe(true)
  expect(Object.isFrozen(transition.events)).toBe(true)
  expect(transition.events.every(Object.isFrozen)).toBe(true)
})

it('не позволяет повторно начислить монеты за влияние', () => {
  const state = createFinalScoringState()
  const first = applyFinalInfluenceScoringToGameState(state)

  expect(first.state.finalInfluenceScored).toBe(true)
  expect(() =>
    applyFinalInfluenceScoringToGameState(first.state),
  ).toThrow('Final influence has already been scored')
})

it('отклоняет начисление вне final_scoring без изменения состояния', () => {
  const state = startGameAfterSetup(
    createGameState(twoPlayerGameConfig, twoPlayerConfigs),
  )
  const snapshot = structuredClone(state)

  expect(() => applyFinalInfluenceScoringToGameState(state)).toThrow(
    'Is phase not final_scoring',
  )
  expect(state).toEqual(snapshot)
})

it('восстанавливает начисленное и неначисленное состояние и требует boolean-флаг', () => {
  const unscored = createFinalScoringState()
  const scored = applyFinalInfluenceScoringToGameState(unscored).state

  expect(restoreGameState(structuredClone(unscored))).toEqual(unscored)
  expect(restoreGameState(structuredClone(scored))).toEqual(scored)

  const missingFlag = structuredClone(unscored) as unknown as Record<string, unknown>
  delete missingFlag.finalInfluenceScored
  expect(() => restoreGameState(missingFlag)).toThrow(
    'Invalid game state: finalInfluenceScored must be a boolean',
  )
})
