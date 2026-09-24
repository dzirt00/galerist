import { describe, expect, it } from 'vitest'

import {
  advanceTurn,
  applyFinalInfluenceScoringToGameState,
  completeFinalScoring,
  projectEventsForViewer,
  projectGameForViewer,
  restoreGameState,
  triggerGameEnd,
  type FinalScoringGameState,
  type GameState,
  type WinnerCandidate,
} from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState, startGameAfterSetup } from './helpers.js'

function advanceToFinalScoring(initialState: GameState): FinalScoringGameState {
  let state = initialState

  while (state.phase !== 'final_scoring') {
    state = advanceTurn(state).state
  }

  return state
}

function createScoredFinalState(): FinalScoringGameState {
  const finalScoring = advanceToFinalScoring(
    triggerGameEnd(
      startGameAfterSetup(
        createGameState(twoPlayerGameConfig, twoPlayerConfigs),
      ),
    ).state,
  )

  return applyFinalInfluenceScoringToGameState(finalScoring).state
}

function createCandidates(
  state: FinalScoringGameState,
): readonly WinnerCandidate[] {
  return state.players.map((player, index) => ({
    playerId: player.id,
    coins: player.coins,
    acquiredArtworkCount: index,
    galleryVisitorCount: 0,
    assistantsInPlayCount: 0,
  }))
}

describe('completeFinalScoring', () => {
  it('завершает подсчёт, публикует победителя и сохраняет его в проекции и снимке', () => {
    const state = structuredClone(createScoredFinalState())
    const candidates = createCandidates(state)
    const stateSnapshot = structuredClone(state)
    const candidatesSnapshot = structuredClone(candidates)

    const transition = completeFinalScoring(state, candidates)

    expect(transition.state).toMatchObject({
      phase: 'finished',
      status: 'finished',
      activePlayerId: null,
      round: state.round,
      firstPlayerId: state.firstPlayerId,
      endTriggeredRound: state.endTriggeredRound,
      winnerIds: ['player-2'],
    })
    expect(transition.events).toEqual([
      { type: 'WinnerDetermined', winnerIds: ['player-2'] },
      { type: 'FinalScoringCompleted', winnerIds: ['player-2'] },
    ])
    expect(projectEventsForViewer(
      transition.events,
      transition.state,
      null,
    )).toEqual(transition.events)
    expect(projectGameForViewer(transition.state, null).winnerIds).toEqual([
      'player-2',
    ])
    expect(restoreGameState(structuredClone(transition.state))).toEqual(
      transition.state,
    )

    expect(Object.isFrozen(transition)).toBe(true)
    expect(Object.isFrozen(transition.state)).toBe(true)
    expect(Object.isFrozen(transition.state.winnerIds)).toBe(true)
    expect(Object.isFrozen(transition.events)).toBe(true)
    expect(transition.events.every(Object.isFrozen)).toBe(true)
    expect(state).toEqual(stateSnapshot)
    expect(candidates).toEqual(candidatesSnapshot)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(state.players)).toBe(false)
    expect(state.players.every(player => !Object.isFrozen(player))).toBe(true)
  })

  it('сохраняет порядок игроков при полной ничьей', () => {
    const state = createScoredFinalState()
    const candidates = state.players.map(player => ({
      playerId: player.id,
      coins: player.coins,
      acquiredArtworkCount: 0,
      galleryVisitorCount: 0,
      assistantsInPlayCount: 0,
    }))

    const transition = completeFinalScoring(state, candidates)

    expect(transition.state.winnerIds).toEqual(['player-1', 'player-2'])
  })

  it.each([
    ['пропущенного игрока', (state: FinalScoringGameState) => createCandidates(state).slice(0, 1)],
    ['чужого игрока', (state: FinalScoringGameState) => [
      createCandidates(state)[0]!,
      { ...createCandidates(state)[1]!, playerId: 'missing' },
    ]],
    ['несовпадающие монеты', (state: FinalScoringGameState) => [
      { ...createCandidates(state)[0]!, coins: state.players[0]!.coins + 1 },
      createCandidates(state)[1]!,
    ]],
  ] as const)('отклоняет %s без изменения входа', (_case, prepareCandidates) => {
    const state = structuredClone(createScoredFinalState())
    const candidates = prepareCandidates(state)
    const stateSnapshot = structuredClone(state)
    const candidatesSnapshot = structuredClone(candidates)

    expect(() => completeFinalScoring(state, candidates)).toThrow(
      'Invalid candidates',
    )
    expect(state).toEqual(stateSnapshot)
    expect(candidates).toEqual(candidatesSnapshot)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(candidates)).toBe(false)
  })

  it('отклоняет завершение до финальной выплаты и повторное завершение', () => {
    const unscored = advanceToFinalScoring(
      triggerGameEnd(
        startGameAfterSetup(
          createGameState(twoPlayerGameConfig, twoPlayerConfigs),
        ),
      ).state,
    )

    expect(() => completeFinalScoring(
      unscored,
      createCandidates({ ...unscored, finalInfluenceScored: true }),
    )).toThrow('Is final_scoring')

    const scored = createScoredFinalState()
    const finished = completeFinalScoring(scored, createCandidates(scored)).state
    expect(() => completeFinalScoring(finished, createCandidates(scored))).toThrow(
      'Is final_scoring',
    )
  })

  it.each([
    ['отсутствующий список', (state: Record<string, unknown>) => delete state.winnerIds],
    ['пустой список', (state: Record<string, unknown>) => { state.winnerIds = [] }],
    ['повторяющиеся ID', (state: Record<string, unknown>) => {
      state.winnerIds = ['player-1', 'player-1']
    }],
    ['чужой ID', (state: Record<string, unknown>) => { state.winnerIds = ['missing'] }],
  ] as const)('отклоняет finished-снимок: %s', (_case, damage) => {
    const scored = createScoredFinalState()
    const finished = completeFinalScoring(scored, createCandidates(scored)).state
    const damaged = structuredClone(finished) as unknown as Record<string, unknown>
    damage(damaged)

    expect(() => restoreGameState(damaged)).toThrow('Invalid game state:')
  })
})
