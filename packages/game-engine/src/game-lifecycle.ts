import type {
  EndingCurrentRoundGameState,
  EndingSequenceGameState,
  FinalRoundGameState,
  FinalScoringGameState,
  GameState,
  RegularPlayGameState,
} from './types.js'
import {
  freezeTransition,
  type GameTransition,
} from './game-events.js'
import { getFirstPlayerIndex } from './turn-order.js'

/** Начинает обычную игру по TURN-001 и выбирает первого игрока по ADR-001. */
export function startGame(state: GameState): GameTransition<RegularPlayGameState> {
  if (state.phase !== 'setup') {
    throw new Error('Game can only be started from setup')
  }
  if (state.setupStage !== 'complete') {
    throw new Error('Game can only be started after setup is complete')
  }

  const firstPlayerIndex = getFirstPlayerIndex(
    state.config.seed,
    state.players.length,
  )
  const firstPlayerId = state.players[firstPlayerIndex]!.id

  const {
    setupStage: _setupStage,
    startingLocationSelectionOrder: _selectionOrder,
    currentStartingLocationPlayerId: _currentChooser,
    availableStartingLocationIds: _availableLocations,
    ...stateWithoutSetupSelection
  } = state
  void _setupStage
  void _selectionOrder
  void _currentChooser
  void _availableLocations

  const regularPlayState: RegularPlayGameState = Object.freeze({
    ...stateWithoutSetupSelection,
    status: 'in_progress',
    phase: 'regular_play',
    round: 1,
    activePlayerId: firstPlayerId,
    firstPlayerId,
  })

  return freezeTransition(regularPlayState, [
    { type: 'GameStarted', gameId: regularPlayState.id },
    { type: 'RoundStarted', round: 1 },
    { type: 'TurnStarted', playerId: firstPlayerId },
  ])
}

/** Передаёт ход по TURN-005 и меняет раунд или фазу по TURN-006 и END-003–END-005. */
export function advanceTurn(state: RegularPlayGameState): RegularPlayGameState
export function advanceTurn(
  state: EndingCurrentRoundGameState,
): EndingCurrentRoundGameState | FinalRoundGameState
export function advanceTurn(
  state: FinalRoundGameState,
): FinalRoundGameState | FinalScoringGameState
export function advanceTurn(state: EndingSequenceGameState): EndingSequenceGameState
export function advanceTurn(state: GameState): GameState
export function advanceTurn(state: GameState): GameState {
  if (state.status !== 'in_progress') {
    throw new Error('Turns can only be advanced while game is in progress')
  }
  if (
    state.phase !== 'final_round'
    && state.phase !== 'ending_current_round'
    && state.phase !== 'regular_play'
  ) {
    throw new Error('Turns can only be advanced while game is in progress')
  }

  const currentIndex = state.players.findIndex(player => player.id === state.activePlayerId)
  if (currentIndex === -1) {
    throw new Error('Active player must belong to the game')
  }

  const nextPlayer = state.players[(currentIndex + 1) % state.players.length]!.id
  const isNewRound = nextPlayer === state.firstPlayerId
  const nextRoundNumber = isNewRound ? state.round + 1 : state.round

  if (state.phase === 'final_round') {
    if (isNewRound) {
      return Object.freeze({
        ...state,
        phase: 'final_scoring',
        activePlayerId: null,
        endTriggeredRound: state.endTriggeredRound,
      })
    }
    return Object.freeze({
      ...state,
      round: nextRoundNumber,
      phase: 'final_round',
      activePlayerId: nextPlayer,
      endTriggeredRound: state.endTriggeredRound,
    })
  }

  if (state.phase === 'ending_current_round') {
    if (isNewRound) {
      return Object.freeze({
        ...state,
        round: nextRoundNumber,
        phase: 'final_round',
        activePlayerId: nextPlayer,
        endTriggeredRound: state.endTriggeredRound,
      })
    }
    return Object.freeze({
      ...state,
      round: nextRoundNumber,
      phase: 'ending_current_round',
      activePlayerId: nextPlayer,
      endTriggeredRound: state.endTriggeredRound,
    })
  }

  return Object.freeze({
    ...state,
    round: nextRoundNumber,
    phase: 'regular_play',
    activePlayerId: nextPlayer,
  })
}

/** Запускает доигрывание текущего раунда по END-002. */
export function triggerGameEnd(state: GameState): GameTransition<EndingCurrentRoundGameState> {
  if (state.phase !== 'regular_play') {
    throw new Error('Only regular_play')
  }
  const updateState = {
    ...state,
    phase: 'ending_current_round',
    endTriggeredRound: state.round,
  } satisfies EndingCurrentRoundGameState

  return freezeTransition(updateState, [{ type: 'GameEndTriggered' }])

}
