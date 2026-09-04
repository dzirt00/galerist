export type GameId = string
export type PlayerId = string

export type TurnExecutionSteps =
  | readonly [MovementCommand, LocationActionCommand]
  | readonly [
      MovementCommand,
      ManagementActionCommand,
      LocationActionCommand,
    ]
  | readonly [
      MovementCommand,
      LocationActionCommand,
      ManagementActionCommand,
    ]

export interface PreparedTurn {
  readonly playerId: PlayerId
  readonly steps: TurnExecutionSteps
}

export interface MovementCommand {
  readonly category: 'movement'
}

export interface LocationActionCommand {
  readonly category: 'location_action'
}

export interface ManagementActionCommand {
  readonly category: 'management_action'
}

export type ManagementTiming =
  | 'before_location'
  | 'after_location'

export interface TimedManagementAction {
  readonly timing: ManagementTiming
  readonly command: ManagementActionCommand
}

export interface TurnDraft {
  readonly playerId: PlayerId
  readonly movement?: MovementCommand
  readonly locationAction?: LocationActionCommand
  readonly management?: TimedManagementAction
}

export type TurnDraftEdit =
  | {
      readonly type: 'set_movement'
      readonly movement: MovementCommand
    }
  | {
      readonly type: 'set_location_action'
      readonly locationAction: LocationActionCommand
    }
  | {
      readonly type: 'set_management_action'
      readonly timing: ManagementTiming
      readonly managementAction: ManagementActionCommand
    }
  | {
      readonly type: 'clear_management_action'
    }

export interface ConfirmedTurnCommand {
  readonly type: 'perform_turn'
  readonly playerId: PlayerId
  readonly movement: MovementCommand
  readonly locationAction: LocationActionCommand
  readonly management?: TimedManagementAction
}

export type GameStatus = 'setup' | 'in_progress' | 'finished'
export type PlayerKind = 'human' | 'bot'
export type GamePhase = 'setup'| 'regular_play' | 'ending_current_round' | 'final_round' | 'final_scoring' | 'finished'
export type EndingSequenceGameState =
  | EndingCurrentRoundGameState
  | FinalRoundGameState
  | FinalScoringGameState

export interface PlayerConfig {
  readonly id: PlayerId
  readonly name: string
  readonly kind: PlayerKind
}

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
  readonly coins: number
  readonly influence: number
}

export type GameState = RegularPlayGameState
  | EndingCurrentRoundGameState
  | FinalRoundGameState
  | FinalScoringGameState
  | FinishedGameState
  | SetupGameState

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
    throw new Error('Seed must be a safe integer');
  }

  const hasDuplicates = new Set(players.map(item => item.id)).size !== players.length;

  if(hasDuplicates) {
    throw new Error('Players must have unique IDs')
  }

  const newPlayers: PlayerState[] = []

  players.forEach((player: PlayerConfig) => {
    newPlayers.push(Object.freeze({
      id: player.id,
      name: player.name,
      kind: player.kind,
      coins: 10,
      influence: 10,
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

  const seedNumber = state.config.seed
  const playerIndex = ((seedNumber % state.players.length) + state.players.length) % state.players.length
  const firstPlayerId = state.players[playerIndex]!.id

  return Object.freeze({
    ...state,
    status: 'in_progress',
    phase: 'regular_play',
    round: 1,
    activePlayerId: firstPlayerId,
    firstPlayerId: firstPlayerId,
  });
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

export function createTurnDraft(playerId: PlayerId): TurnDraft {
  return Object.freeze({ playerId })
}

function copyFrozenManagement(management: TimedManagementAction): TimedManagementAction {
  return Object.freeze({
    timing: management.timing,
    command: Object.freeze({ ...management.command }),
  })
}

function copyFrozenTurnDraft(draft: TurnDraft): TurnDraft {

  return Object.freeze({
    playerId: draft.playerId,
    ...(draft.movement === undefined ? {} : {
      movement: Object.freeze({ ...draft.movement }),
    }),
    ...(draft.locationAction === undefined ? {} : {
      locationAction: Object.freeze({ ...draft.locationAction }),
    }),
    ...(draft.management === undefined ? {} : {
      management: copyFrozenManagement(draft.management),
    }),
  })
}

export function updateTurnDraft(
  draft: TurnDraft,
  edit: TurnDraftEdit,
): TurnDraft {
  switch (edit.type) {
    case 'set_movement': {
      return copyFrozenTurnDraft({
        ...draft,
        movement: edit.movement,
      })
    }
    case 'set_location_action': {
      return copyFrozenTurnDraft({
        ...draft,
        locationAction: edit.locationAction,
      })
    }
    case 'set_management_action': {
      return copyFrozenTurnDraft({
        ...draft,
        management: {
          timing: edit.timing,
          command: edit.managementAction,
        },
      })
    }
    case 'clear_management_action': {
      const { management, ...updated } = draft
      return copyFrozenTurnDraft(updated)
    }
  }
}

export function confirmTurnDraft(
  draft: TurnDraft,
): ConfirmedTurnCommand {
  if (!draft.movement) {
    throw new Error('Turn draft requires movement')
  }

  if (!draft.locationAction) {
    throw new Error('Turn draft requires location action')
  }

  return Object.freeze({
    type: 'perform_turn',
    playerId: draft.playerId,
    movement: Object.freeze({ ...draft.movement }),
    locationAction: Object.freeze({ ...draft.locationAction }),
    ...(draft.management === undefined ? {} : {
      management: copyFrozenManagement(draft.management),
    }),
  })
}

export function prepareTurn(
  state: GameState,
  command: ConfirmedTurnCommand,
): PreparedTurn {
  if (state.status !== 'in_progress') {
    throw new Error('Game status must be in_progress')
  }

  if (
    state.phase !== 'regular_play'
    && state.phase !== 'ending_current_round'
    && state.phase !== 'final_round'
  ) {
    throw new Error(`Turn preparation is not allowed in phase: ${state.phase}`)
  }

  if (
    state.activePlayerId === null
    || !state.players.some(player => player.id === state.activePlayerId)
  ) {
    throw new Error('activePlayerId is invalid or not in the game')
  }

  if (command.playerId !== state.activePlayerId) {
    throw new Error('Command playerId does not match activePlayerId')
  }

  if (
    !('movement' in command)
    || command.movement == null
    || !('locationAction' in command)
    || command.locationAction == null
  ) {
    throw new Error('Confirmed turn requires movement and location action')
  }

  const movement = Object.freeze({ ...command.movement })
  const locationAction = Object.freeze({ ...command.locationAction })

  let steps: TurnExecutionSteps
  switch (command.management?.timing) {
    case 'before_location': {
      const managementCommand = Object.freeze({ ...command.management.command })
      steps = [movement, managementCommand, locationAction]
      break
    }
    case 'after_location': {
      const managementCommand = Object.freeze({ ...command.management.command })
      steps = [movement, locationAction, managementCommand]
      break
    }
    default: {
      steps = [movement, locationAction]
    }
  }

  return Object.freeze({
    playerId: command.playerId,
    steps: Object.freeze(steps),
  })
}
