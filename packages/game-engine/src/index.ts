export type GameId = string
export type PlayerId = string

export type GameStatus = 'setup' | 'in_progress' | 'finished'
export type PlayerKind = 'human' | 'bot'
export type GamePhase = 'setup'| 'regular_play' | 'ending_current_round' | 'final_round' | 'final_scoring' | 'finished'
export type EndingSequenceGameState =
  | EndingCurrentRoundGameState
  | FinalRoundGameState
  | FinalScoringGameState
export interface GameStateBase {
  readonly id: GameId
  readonly config: Readonly<GameConfig>
  readonly players:  readonly PlayerState[]
}

export interface RegularPlayGameState extends GameStateBase {
  readonly phase: 'regular_play'
  readonly status: 'in_progress'
  readonly round: number
  readonly activePlayerId: PlayerId
  readonly firstPlayerId: PlayerId
}

export interface EndingCurrentRoundGameState extends GameStateBase {
  readonly phase: 'ending_current_round'
  readonly status: 'in_progress'
  readonly round: number
  readonly activePlayerId: PlayerId
  readonly firstPlayerId: PlayerId
  readonly endTriggeredRound: number
}

export interface FinalRoundGameState extends GameStateBase {
  readonly phase: 'final_round'
  readonly status: 'in_progress'
  readonly round: number
  readonly activePlayerId: PlayerId
  readonly firstPlayerId: PlayerId
  readonly endTriggeredRound: number
}

export interface FinalScoringGameState extends GameStateBase {
  readonly phase: 'final_scoring'
  readonly status: 'in_progress'
  readonly round: number
  readonly activePlayerId: null
  readonly firstPlayerId: PlayerId
  readonly endTriggeredRound: number
}

export interface FinishedGameState extends GameStateBase {
  readonly phase: 'finished'
  readonly status: 'finished'
  readonly round: number
  readonly activePlayerId: null
  readonly firstPlayerId: PlayerId
  readonly endTriggeredRound: number
}

export interface SetupGameState extends GameStateBase {
  readonly phase: 'setup'
  readonly status: 'setup'
  readonly round: 0
  readonly activePlayerId: null
}

export interface GameConfig {
  playerCount: 2 | 3 | 4
  seed: number
}

export interface PlayerState {
  readonly id: PlayerId
  readonly name: string
  readonly kind: PlayerKind
}

export type GameState = RegularPlayGameState
  | EndingCurrentRoundGameState
  | FinalRoundGameState
  | FinalScoringGameState
  | FinishedGameState
  | SetupGameState

export function createGame(
  config: GameConfig,
  players: readonly PlayerState[],
): SetupGameState {
  if (players.length !== config.playerCount) {
    throw new Error('Player count must match config.playerCount')
  }

  const hasDuplicates = new Set(players.map(item => item.id)).size !== players.length;

  if(hasDuplicates) {
    throw new Error('Players must have unique IDs')
  }

  const newPlayers: PlayerState[] = []

  players.forEach((player: PlayerState) => {
    newPlayers.push(Object.freeze({
      id: player.id,
      name: player.name,
      kind: player.kind,
    }))
  })

  return Object.freeze({
    id: `game-${config.seed}`,
    status: 'setup',
    round: 0,
    activePlayerId: null,
    config: Object.freeze( { ...config }),
    players: Object.freeze([ ...newPlayers ]),
    phase: 'setup'
  })
}

export function startGame(state: GameState): RegularPlayGameState {

  if(state.phase !== 'setup') throw new Error('Game can only be started from setup')

  return Object.freeze({
    id: state.id,
    status: 'in_progress',
    phase: 'regular_play',
    round: 1,
    activePlayerId: state.players[0]!.id,
    config: state.config,
    players: state.players,
    firstPlayerId: state.players[0]!.id

  })
}

export function advanceTurn(state: RegularPlayGameState): RegularPlayGameState

export function advanceTurn(
  state: EndingCurrentRoundGameState,
): EndingCurrentRoundGameState | FinalRoundGameState

export function advanceTurn(
  state: FinalRoundGameState,
): FinalRoundGameState | FinalScoringGameState

export function advanceTurn(
  state: EndingSequenceGameState,
): EndingSequenceGameState

export function advanceTurn(state: GameState): GameState
export function advanceTurn(state: GameState): GameState {
  if ( state.status !== 'in_progress' ) {
    throw new Error( 'Turns can only be advanced while game is in progress' );
  }
  if ( state.phase === 'final_round' || state.phase === 'ending_current_round' || state.phase === 'regular_play' ) {

    const currentIndex = state.players.findIndex( p => p.id === state.activePlayerId );

    if ( currentIndex === -1 ) {
      throw new Error( 'Active player must belong to the game' );
    }

    const nextPlayer = state.players[ ( currentIndex + 1 ) % state.players.length ]!.id;
    const isNewRound = nextPlayer === state.firstPlayerId;
    const nextRoundNumber = isNewRound ? state.round + 1 : state.round;


    if ( state.phase === 'final_round' ) {
      if ( isNewRound ) {
        return Object.freeze( {
          ...state,
          phase: 'final_scoring',
          activePlayerId: null,
          endTriggeredRound: state.endTriggeredRound,
        } );
      }

      return Object.freeze( {
        ...state,
        round: nextRoundNumber,
        phase: 'final_round',
        activePlayerId: nextPlayer,
        endTriggeredRound: state.endTriggeredRound,
      } );
    }

    if ( state.phase === 'ending_current_round' ) {
      if ( isNewRound ) {
        return Object.freeze( {
          ...state,
          round: nextRoundNumber,
          phase: 'final_round',
          activePlayerId: nextPlayer,
          endTriggeredRound: state.endTriggeredRound,
        } );
      }

      return Object.freeze( {
        ...state,
        round: nextRoundNumber,
        phase: 'ending_current_round',
        activePlayerId: nextPlayer,
        endTriggeredRound: state.endTriggeredRound,
      } );
    }

    return Object.freeze( {
      ...state,
      round: nextRoundNumber,
      phase: 'regular_play',
      activePlayerId: nextPlayer,
    } );
  } else {
    throw new Error('Turns can only be advanced while game is in progress');
  }
}



export function triggerGameEnd(state: GameState): EndingCurrentRoundGameState {

  if(state.phase !== 'regular_play') throw new Error('Only regular_play')

  const res: EndingCurrentRoundGameState  = {
      ...state,
      phase: 'ending_current_round',
      endTriggeredRound: state.round
    };

  return Object.freeze(res)

}
