import { expect } from 'vitest'
import {
  advanceTurn,
  type EndingSequenceGameState,
  type GameState,
  type TurnDraft,
} from '../src/index.js'

export function advanceAndExpectTurns(
  initialState: GameState,
  expectedTurns: readonly { activePlayerId: string; round: number }[],
) {
  const initialStateSnapshot = structuredClone(initialState)
  const nextStates: GameState[] = []
  const nextStateSnapshots: GameState[] = []
  let previousState = initialState

  for (const expectedTurn of expectedTurns) {
    const nextState = advanceTurn(previousState)

    expect(nextState).not.toBe(previousState)
    nextStates.push(nextState)
    nextStateSnapshots.push(structuredClone(nextState))
    expect(nextState.id).toBe(initialState.id)
    expect(nextState.status).toBe(initialState.status)
    expect(nextState.config).toEqual(initialState.config)
    expect(nextState.players).toEqual(initialState.players)
    expect(Object.isFrozen(nextState)).toBe(true)
    expect(nextState.activePlayerId).toBe(expectedTurn.activePlayerId)
    expect(nextState.round).toBe(expectedTurn.round)

    previousState = nextState
  }

  expect(nextStates).toEqual(nextStateSnapshots)
  expect(initialState).toEqual(initialStateSnapshot)
}

type EndingTurnExpectation = readonly [
  phase: 'ending_current_round' | 'final_round' | 'final_scoring',
  round: number,
  firstPlayerId: string,
  activePlayerId: string | null,
]

function isEndingSequenceGameState(state: GameState): state is EndingSequenceGameState {
  return state.phase === 'ending_current_round'
    || state.phase === 'final_round'
    || state.phase === 'final_scoring'
}

export function expectEndingTurns(
  states: readonly GameState[],
  initialState: GameState,
  expectedTurns: readonly EndingTurnExpectation[],
) {
  expect(states).toHaveLength(expectedTurns.length)

  states.forEach((state, index) => {
    const [phase, round, firstPlayerId, activePlayerId] = expectedTurns[index]!
    expect(state.phase).toBe(phase)
    if (!isEndingSequenceGameState(state)) {
      throw new Error(`Expected an ending state, received ${state.phase}`)
    }
    expect(state.round).toBe(round)
    expect(state.firstPlayerId).toBe(firstPlayerId)
    expect(state).toMatchObject({ endTriggeredRound: initialState.round })
    expect(state.status).toBe('in_progress')
    expect(state.config).toEqual(initialState.config)
    expect(state.players).toEqual(initialState.players)
    expect(state.activePlayerId).toEqual(activePlayerId)
  })
}

export function expectDraftFrozen(draft: TurnDraft, frozen: boolean) {
  const objects = [
    draft,
    draft.movement,
    draft.locationAction,
    draft.management,
    draft.management?.command,
  ]
  for (const object of objects) {
    if (object !== undefined) {
      expect(Object.isFrozen(object)).toBe(frozen)
    }
  }
}

export function expectPreparedTurnFrozen(
  prepared: { readonly steps: readonly object[] },
) {
  expect(Object.isFrozen(prepared)).toBe(true)
  expect(Object.isFrozen(prepared.steps)).toBe(true)
  prepared.steps.forEach(step => expect(Object.isFrozen(step)).toBe(true))
}
