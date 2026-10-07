import { withGameEndConditions } from './helpers.js'
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
} from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState, startGameAfterSetup } from './helpers.js'

/** Передаёт ходы до достижения финального подсчёта. */
function advanceToFinalScoring(initialState: GameState): FinalScoringGameState {
  let state = initialState

  while (state.phase !== 'final_scoring') {
    state = advanceTurn(state).state
  }

  return state
}

/** Подготавливает финальный подсчёт с уже начисленной ценностью влияния. */
function createScoredFinalState(): FinalScoringGameState {
  const finalScoring = advanceToFinalScoring(
    triggerGameEnd(withGameEndConditions(startGameAfterSetup(
        createGameState(twoPlayerGameConfig, twoPlayerConfigs),
      ))).state,
  )

  return applyFinalInfluenceScoringToGameState(finalScoring).state
}

describe('acquiredArtworkCount final scoring contract', () => {
  it.each([
    [6, 5, ['player-1']],
    [5, 6, ['player-2']],
    [6, 6, ['player-1', 'player-2']],
  ] as const)('uses saved counts %i/%i', (firstCount, secondCount, winners) => {
    const initial = createScoredFinalState()
    const state: FinalScoringGameState = {
      ...initial,
      players: initial.players.map((player, index) => ({
        ...player, coins: 20, acquiredArtworkCount: index === 0 ? firstCount : secondCount,
      })),
    }
    const before = structuredClone(state)
    const transition = completeFinalScoring(state)
    expect(transition.state.winnerIds).toEqual(winners)
    expect(transition.events[0]).toEqual({ type: 'WinnerDetermined', winnerIds: winners })
    expect(projectGameForViewer(transition.state, null).players).toEqual(state.players)
    expect(restoreGameState(transition.state)).toEqual(transition.state)
    expect(state).toEqual(before)
  })
})

describe('completeFinalScoring', () => {
  it('берёт монеты из состояния и сохраняет их приоритет над критериями ничьей', () => {
    const initial = createScoredFinalState()
    const state = structuredClone({
      ...initial,
      players: initial.players.map((player, index) => ({
        ...player,
        coins: index === 0 ? 10 : 11,
        acquiredArtworkCount: index === 0 ? 10 : 0,
      })),
    })
    const before = structuredClone(state)

    const transition = completeFinalScoring(state)

    expect(transition.state.winnerIds).toEqual(['player-2'])
    expect(transition.state.players).toEqual(state.players)
    expect(state).toEqual(before)
  })

  it.each([
    [3, 1, 0, 0, ['player-1']],
    [0, 1, 0, 0, ['player-2']],
    [0, 0, 1, 2, ['player-2']],
    [1, 1, 2, 2, ['player-1', 'player-2']],
  ] as const)('берёт посетителей из галерей (%i/%i), сохраняя следующие критерии (%i/%i)', (
    firstVisitorCount, secondVisitorCount, firstAssistantCount, secondAssistantCount, winnerIds,
  ) => {
    const initial = createScoredFinalState()
    const state: FinalScoringGameState = structuredClone({
      ...initial,
      playerBoards: initial.playerBoards.map((board, index) => ({
        ...board,
        assistants: {
          ...board.assistants,
          office: index === 0 ? firstAssistantCount : secondAssistantCount,
        },
        gallery: {
          ...board.gallery,
          visitors: Array.from({ length: index === 0 ? firstVisitorCount : secondVisitorCount }, (_, visitorIndex) => ({
            id: `gallery-${board.playerId}-${visitorIndex}`,
            type: 'B' as const,
          })),
        },
      })).reverse(),
    })
    const stateSnapshot = structuredClone(state)

    const transition = completeFinalScoring(state)

    expect(transition.state.winnerIds).toEqual(winnerIds)
    expect(transition.events).toEqual([
      { type: 'WinnerDetermined', winnerIds },
      { type: 'FinalScoringCompleted', winnerIds },
      { type: 'GameFinished', gameId: state.id },
    ])
    expect(projectGameForViewer(transition.state, null).winnerIds).toEqual(winnerIds)
    expect(transition.state.playerBoards).toEqual(state.playerBoards)
    expect(state).toEqual(stateSnapshot)
    expect(Object.isFrozen(state.playerBoards)).toBe(false)
    expect(Object.isFrozen(transition.state.playerBoards)).toBe(true)
  })

  it.each([
    [5, 6, ['player-2']],
    [0, 1, ['player-2']],
    [0, 0, ['player-1', 'player-2']],
    [2, 3, ['player-2']],
    [6, 5, ['player-1']],
  ] as const)('берёт помощников из офисов (%i/%i), исключая очередь найма', (
    firstOffice, secondOffice, winnerIds,
  ) => {
    const initial = createScoredFinalState()
    const state = structuredClone({
      ...initial,
      playerBoards: initial.playerBoards.map((board, index) => ({
        ...board,
        assistants: {
          office: index === 0 ? firstOffice : secondOffice,
          hireQueue: index === 0 ? 8 : 0,
          assistantOfficeIds: Array.from({ length: index === 0 ? firstOffice : secondOffice }, (_, position) => `OFFICE-${position}`),
          assistantHireQueueIds: index === 0 ? board.assistants.assistantHireQueueIds : [],
        },
      })).reverse(),
    })
    const stateSnapshot = structuredClone(state)

    const transition = completeFinalScoring(state)

    expect(transition.state).toMatchObject({
      phase: 'finished', status: 'finished', activePlayerId: null, winnerIds,
    })
    expect(transition.events).toEqual([
      { type: 'WinnerDetermined', winnerIds },
      { type: 'FinalScoringCompleted', winnerIds },
      { type: 'GameFinished', gameId: state.id },
    ])
    expect(projectGameForViewer(transition.state, null).winnerIds).toEqual(winnerIds)
    expect(projectEventsForViewer(transition.events, transition.state, null)).toEqual(transition.events)
    expect(state).toEqual(stateSnapshot)
    expect(transition.state.playerBoards).toEqual(state.playerBoards)
    expect(Object.isFrozen(state.playerBoards)).toBe(false)
    expect(Object.isFrozen(transition.state.playerBoards)).toBe(true)
  })

  it.each([-1, 1.5, NaN, Infinity])('отклоняет некорректное число помощников в офисе: %s', office => {
    const initial = createScoredFinalState()
    const state = structuredClone({
      ...initial,
      playerBoards: initial.playerBoards.map((board, index) => index === 0
        ? { ...board, assistants: { ...board.assistants, office } }
        : board),
    })
    const stateSnapshot = structuredClone(state)

    expect(() => completeFinalScoring(state)).toThrow('Invalid metric value:')
    expect(state).toEqual(stateSnapshot)
  })

  it.each(['missing-first', 'missing-last', 'empty', 'duplicate', 'foreign', 'extra'] as const)(
    'отклоняет некорректный набор планшетов: %s, сохраняя вход', damage => {
      const initial = createScoredFinalState()
      const first = initial.playerBoards[0]!
      const second = initial.playerBoards[1]!
      const playerBoards = {
        'missing-first': [second],
        'missing-last': [first],
        empty: [],
        duplicate: [first, first],
        foreign: [first, { ...second, playerId: 'missing' }],
        extra: [first, second, { ...second, playerId: 'missing' }],
      }[damage]
      const state = structuredClone({ ...initial, playerBoards })
      const stateSnapshot = structuredClone(state)

      expect(() => completeFinalScoring(state)).toThrow('Invalid candidates')
      expect(state).toEqual(stateSnapshot)
      expect(Object.isFrozen(state.playerBoards)).toBe(false)
    },
  )

  it('завершает подсчёт, публикует победителя и сохраняет его в проекции и снимке', () => {
    const state = structuredClone(createScoredFinalState())
    Object.assign(state.players[1]!, { acquiredArtworkCount: 1 })
    const stateSnapshot = structuredClone(state)

    const transition = completeFinalScoring(state)

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
      { type: 'GameFinished', gameId: state.id },
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
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(state.players)).toBe(false)
    expect(state.players.every(player => !Object.isFrozen(player))).toBe(true)
  })

  it.each([false, true])('сохраняет порядок state.players при полной ничьей, обратный порядок: %s', reverse => {
    const initial = createScoredFinalState()
    const state = {
      ...initial,
      players: reverse ? [...initial.players].reverse() : initial.players,
    }

    const transition = completeFinalScoring(state)

    expect(transition.state.winnerIds).toEqual(reverse
      ? ['player-2', 'player-1']
      : ['player-1', 'player-2'])
  })

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'отклоняет некорректные монеты из состояния: %s без изменения входа', coins => {
    const initial = createScoredFinalState()
    const state = structuredClone({
      ...initial,
      players: initial.players.map((player, index) => index === 0 ? { ...player, coins } : player),
    })
    const stateSnapshot = structuredClone(state)

    expect(() => completeFinalScoring(state)).toThrow(
      'Invalid metric value:',
    )
    expect(state).toEqual(stateSnapshot)
    expect(Object.isFrozen(state)).toBe(false)
  })

  it('отклоняет завершение до финальной выплаты и повторное завершение', () => {
    const unscored = advanceToFinalScoring(
      triggerGameEnd(withGameEndConditions(startGameAfterSetup(
          createGameState(twoPlayerGameConfig, twoPlayerConfigs),
        ))).state,
    )

    expect(() => completeFinalScoring(unscored)).toThrow('Is final_scoring')

    const scored = createScoredFinalState()
    const finished = completeFinalScoring(scored).state
    expect(() => completeFinalScoring(finished)).toThrow(
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
    const finished = completeFinalScoring(scored).state
    const damaged = structuredClone(finished) as unknown as Record<string, unknown>
    damage(damaged)

    expect(() => restoreGameState(damaged)).toThrow('Invalid game state:')
  })
})
