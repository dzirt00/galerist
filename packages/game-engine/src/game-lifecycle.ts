import type {
  EndingCurrentRoundGameState,
  EndingSequenceGameState,
  FinalRoundGameState,
  FinalScoringGameState,
  GameConfig,
  GameState,
  PlayerConfig,
  PlayerState,
  RegularPlayGameState,
  SetupGameState,
} from './types.js'

export function createGame(
  config: GameConfig,
  players: readonly PlayerConfig[],
): SetupGameState {
  if (config.playerCount !== 2 && config.playerCount !== 3 && config.playerCount !== 4) {
    throw new Error('Player count must be 2, 3, or 4')
  }
  if (players.length !== config.playerCount) {
    throw new Error('Player count must match config.playerCount')
  }
  if (!Number.isSafeInteger(config.seed)) {
    throw new Error('Seed must be a safe integer')
  }
  if (new Set(players.map(player => player.id)).size !== players.length) {
    throw new Error('Players must have unique IDs')
  }

  const newPlayers: PlayerState[] = players.map(player => Object.freeze({
    id: player.id,
    name: player.name,
    kind: player.kind,
    coins: 10,
    influence: 10,
  }))

  return Object.freeze({
    id: `game-${config.seed}`,
    status: 'setup',
    round: 0,
    activePlayerId: null,
    config: Object.freeze({ ...config }),
    players: Object.freeze([...newPlayers]),
    phase: 'setup',
  })
}

export function startGame(state: GameState): RegularPlayGameState {
  if (state.phase !== 'setup') {
    throw new Error('Game can only be started from setup')
  }

  const playerIndex = ((state.config.seed % state.players.length) + state.players.length)
    % state.players.length
  const firstPlayerId = state.players[playerIndex]!.id

  return Object.freeze({
    ...state,
    status: 'in_progress',
    phase: 'regular_play',
    round: 1,
    activePlayerId: firstPlayerId,
    firstPlayerId,
  })
}

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

export function triggerGameEnd(state: GameState): EndingCurrentRoundGameState {
  if (state.phase !== 'regular_play') {
    throw new Error('Only regular_play')
  }
  return Object.freeze({
    ...state,
    phase: 'ending_current_round',
    endTriggeredRound: state.round,
  })
}
