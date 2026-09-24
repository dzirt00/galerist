import type { PreparedOrderMarket } from "./setup-orders.js";
import type { PreparedTicketOffice } from "./setup-tickets.js";
import type { PreparedPromotionSupply } from "./setup-promotion.js";
import type { PreparedArtistMarket, PreparedArtistSetup } from "./setup-artists.js";
import type {  PreparedVisitorBag, InitialVisitorPlacement } from "./setup-visitors.js";
import type { SetupInternationalMarket } from "./setup-international-market.js";
import type { PreparedArtworkMarket } from "./setup-artworks.js";
import type { PreparedMasterpieceAuction } from "./setup-masterpieces.js";
import type { PreparedPrivateGoals } from './setup-goals.js'
import type { PlayerBoard } from "./player-boards.js";
import type { StartingLocationId } from "./component-catalog.js";

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
  readonly playerCount: 2 | 3 | 4
  readonly seed: number
}

export interface CreateGameInput {
  readonly gameId: GameId
  readonly config: GameConfig
  readonly players: readonly PlayerConfig[]
}

export interface PlayerState {
  readonly id: PlayerId
  readonly name: string
  readonly kind: PlayerKind
  readonly coins: number
  readonly influence: number
}

export interface GameStateBase {
  readonly stateSchemaVersion: 3
  readonly id: GameId
  readonly config: Readonly<GameConfig>
  readonly players: readonly PlayerState[]
  readonly orderMarket: Readonly<PreparedOrderMarket>
  readonly ticketOffice: PreparedTicketOffice
  readonly promotionSupply: PreparedPromotionSupply
  readonly artistMarket: PreparedArtistMarket
  readonly artistSetup: PreparedArtistSetup
  readonly visitorBag: PreparedVisitorBag
  readonly internationalMarket:  SetupInternationalMarket
  readonly artworkMarket:  PreparedArtworkMarket
  readonly masterpieceAuction:  PreparedMasterpieceAuction
  readonly privateGoals: PreparedPrivateGoals
  readonly playerBoards: readonly PlayerBoard[]
  readonly plazaVisitors: InitialVisitorPlacement['plazaVisitors']
  readonly vestibuleVisitors: InitialVisitorPlacement['vestibuleVisitors']
  readonly setupVersions: {
    readonly rulesVersion: 'galerist-rules-2026-09-15-v1'
    readonly componentsVersion: string
    readonly setupAlgorithmVersion: 'setup-rng-v1'
  }
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
  readonly finalInfluenceScored: boolean
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
  readonly setupStage: 'choosing_starting_locations' | 'complete'
  readonly startingLocationSelectionOrder: readonly PlayerId[]
  readonly currentStartingLocationPlayerId: PlayerId | null
  readonly availableStartingLocationIds: readonly StartingLocationId[]
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

export interface IntermediateVisitorCounts {
  readonly investors: number
  readonly celebrities: number
  readonly collectors: number
}

export interface IntermediateIncome {
  readonly coins: number
  readonly influence: number
}

export interface ArtistFameState {
  readonly artistId: string
  readonly fame: number
}

export type FameIncreaseContext =
  | {
  readonly kind: 'eligible'
  readonly source: 'artwork_purchase' | 'promotion'
  readonly baseFameGain: number
}
  | {
  readonly kind: 'blocked_by_artwork_x'
  readonly source: 'artwork_purchase'
}

export interface ApplyAdditionalFameSpendInput {
  readonly player: Readonly<PlayerState>
  readonly artist: Readonly<ArtistFameState>
  readonly targetInfluence: number
  readonly fameIncrease: FameIncreaseContext
}

export interface ApplyAdditionalFameSpendResult {
  readonly player: Readonly<PlayerState>
  readonly artist: Readonly<ArtistFameState>
}
