export type GameId = string
export type PlayerId = string

export interface MovementCommand {
  readonly category: 'movement'
}

export interface LocationActionCommand {
  readonly category: 'location_action'
}

export interface ManagementActionCommand {
  readonly category: 'management_action'
}

export type ManagementTiming = 'before_location' | 'after_location'

export interface TimedManagementAction {
  readonly timing: ManagementTiming
  readonly command: ManagementActionCommand
}

export type TurnExecutionSteps =
  | readonly [MovementCommand, LocationActionCommand]
  | readonly [MovementCommand, ManagementActionCommand, LocationActionCommand]
  | readonly [MovementCommand, LocationActionCommand, ManagementActionCommand]

export interface PreparedTurn {
  readonly playerId: PlayerId
  readonly steps: TurnExecutionSteps
}

export interface TurnDraft {
  readonly playerId: PlayerId
  readonly movement?: MovementCommand
  readonly locationAction?: LocationActionCommand
  readonly management?: TimedManagementAction
}

export type TurnDraftEdit =
  | { readonly type: 'set_movement'; readonly movement: MovementCommand }
  | { readonly type: 'set_location_action'; readonly locationAction: LocationActionCommand }
  | {
      readonly type: 'set_management_action'
      readonly timing: ManagementTiming
      readonly managementAction: ManagementActionCommand
    }
  | { readonly type: 'clear_management_action' }

export interface ConfirmedTurnCommand {
  readonly type: 'perform_turn'
  readonly playerId: PlayerId
  readonly movement: MovementCommand
  readonly locationAction: LocationActionCommand
  readonly management?: TimedManagementAction
}

export type GameStatus = 'setup' | 'in_progress' | 'finished'
export type PlayerKind = 'human' | 'bot'
export type GamePhase =
  | 'setup'
  | 'regular_play'
  | 'ending_current_round'
  | 'final_round'
  | 'final_scoring'
  | 'finished'

export interface PlayerConfig {
  readonly id: PlayerId
  readonly name: string
  readonly kind: PlayerKind
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

export interface GameStateBase {
  readonly id: GameId
  readonly config: Readonly<GameConfig>
  readonly players: readonly PlayerState[]
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

export type EndingSequenceGameState =
  | EndingCurrentRoundGameState
  | FinalRoundGameState
  | FinalScoringGameState

export type GameState =
  | RegularPlayGameState
  | EndingCurrentRoundGameState
  | FinalRoundGameState
  | FinalScoringGameState
  | FinishedGameState
  | SetupGameState

export interface WinnerCandidate {
  readonly playerId: PlayerId
  readonly coins: number
  readonly acquiredArtworkCount: number
  readonly galleryVisitorCount: number
  readonly assistantsInPlayCount: number
}
