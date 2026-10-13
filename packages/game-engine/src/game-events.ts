import { deepFreeze, type SetupTicketColor, type StartingLocationId } from './component-catalog.js'
import type { PlayerId } from './types.js'

export type GameEvent =
  | { readonly type: 'OrderCompleted'; readonly playerId: PlayerId; readonly orderSlot: 1 | 2 | 3; readonly orderId: string }
  | { readonly type: 'OrderRewardSideSelected'; readonly playerId: PlayerId; readonly orderSlot: 1 | 2 | 3; readonly orderId: string; readonly orderRewardSide: import('./player-boards.js').OrderRewardSide }
  | { readonly type: 'ArtworkSold'; readonly playerId: PlayerId; readonly orderId: string; readonly artworkId: string; readonly artistId: string; readonly saleValue: number; readonly soldArtworkCount: number }
  | { readonly type: 'SignatureReturned'; readonly playerId: PlayerId; readonly artistId: string; readonly signatureTokenId: string }
  | { readonly type: 'VisitorMoved'; readonly visitorId: string; readonly from: 'gallery'; readonly to: 'plaza'; readonly playerId: PlayerId }
  | { readonly type: 'GameCreated'; readonly gameId: string }
  | { readonly type: 'VisitorBagPrepared' }
  | { readonly type: 'TicketOfficePrepared' }
  | { readonly type: 'OrderMarketPrepared' }
  | { readonly type: 'ArtistsPrepared' }
  | { readonly type: 'TicketSpent', readonly playerId: PlayerId, readonly color: SetupTicketColor }
  | { readonly type: 'ArtistOpened'; readonly artistId: string }
  | { readonly type: 'ArtistBonusClaimed'; readonly playerId: PlayerId; readonly artistId: string; readonly bonusId: string }
  | { readonly type: 'ContractSigned'; readonly playerId: PlayerId; readonly artistId: string; readonly signatureTokenId: string }
  | { readonly type: 'VisitorMoved'; readonly visitorId: string; readonly from: 'artist'; readonly to: 'plaza'; readonly artistId: string }
  | { readonly type: 'VisitorMoved'; readonly visitorId: string; readonly from: 'plaza'; readonly to: 'vestibule'; readonly playerId: PlayerId }
  | { readonly type: 'VisitorMoved'; readonly visitorId: string; readonly from: 'vestibule'; readonly to: 'gallery'; readonly playerId: PlayerId }
  | { readonly type: 'VisitorMoved'; readonly visitorId: string; readonly from: 'vestibule'; readonly to: 'plaza'; readonly playerId: PlayerId; readonly fromPlayerId: PlayerId }
  | { readonly type: 'PromotionSupplyPrepared' }
  | { readonly type: 'OrderDeckRecycled', readonly playerId: PlayerId }
  | { readonly type: 'ArtworkMarketPrepared' }
  | { readonly type: 'InternationalMarketPrepared' }
  | { readonly type: 'LocationReputationPrepared' }
  | { readonly type: 'FinalRoundEnded' }
  | { readonly type: 'OrderMarketRefreshed', readonly playerId: PlayerId }
  | { readonly type: 'AssistantsHired', countHiredAssistants: number }
  | { readonly type: 'MasterpieceAuctionPrepared' }
  | { readonly type: 'FinalRoundStarted'}
  | { readonly type: 'OrderTaken', readonly playerId: PlayerId, orderId: string }
  | { readonly type: 'IntermediateScoringTriggered' }
  | { readonly type: 'EndConditionReached' }
  | { readonly type: 'AssistantReturnedHome', readonly playerId: PlayerId, assistantId: string }
  | { readonly type: 'AssistantRemovedFromGame', readonly playerId: PlayerId, assistantId: string }
  | { readonly type: 'OrderMarketRefilled' }
  | { readonly type: 'InitialVisitorsPlaced' }
  | { readonly type: 'FirstPlayerSelected'; readonly playerId: PlayerId }
  | { readonly type: 'PlayerBoardPrepared'; readonly playerId: PlayerId }
  | { readonly type: 'PrivateGoalsDealt'; readonly playerId: PlayerId }
  | { readonly type: 'OrderDiscarded'; readonly playerId: PlayerId, readonly orderId: string}
  | { readonly type: 'FinalScoringStarted' }
  | { readonly type: 'GameEndTriggered' }
  | { readonly type: 'InfluenceSpent', readonly playerId: PlayerId, readonly spentInfluence: number }
  | { readonly type: 'AssistantAssignedToOrder'; readonly playerId: PlayerId; readonly orderSlot: 1 | 2 | 3; readonly orderId: string; readonly assistantId: string }
  | { readonly type: 'CoinsReceived', readonly playerId: PlayerId, readonly coinsReceived: number }
  | { readonly type: 'RoundEnded'; readonly round: number }
  | { readonly type: 'ArtistPromoted'; readonly playerId: PlayerId; readonly artistId: string; readonly previousPromotionLevel: number; readonly promotionLevel: number; readonly promotionTokenId: string }
  | { readonly type: 'GameFinished'; readonly gameId: string }
  | { readonly type: 'IntermediateIncomeAwarded'; readonly playerId: PlayerId }
  | { readonly type: 'TurnEnded'; readonly playerId: PlayerId }
  | {
      readonly type: 'ArtworkSelected'
      readonly playerId: PlayerId
      readonly artistId: string
      readonly artworkId: string
    }
  | { readonly type: 'CoinsSpent'; readonly playerId: PlayerId, paid: number }
  | { readonly type: 'VisitorMoved'; readonly visitorId: string, from: 'artwork', to: 'plaza'}
  | { readonly type: 'VisitorMoved'; readonly visitorId: string; readonly from: 'plaza' | 'visitorBag'; readonly to: 'gallery'; readonly playerId: PlayerId }
  | { readonly type: 'ArtistFameIncreased'; readonly artistId: string; readonly previousFame: number; readonly fame: number }
  | { readonly type: 'ArtworkSaleValuesChanged'; readonly artistId: string; readonly saleValue: number }
  | { readonly type: 'ArtistBecameSuperstar'; readonly artistId: string }
  | { readonly type: 'ArtworkBecameMasterpiece'; readonly playerId: PlayerId; readonly artworkId: string }
  | { readonly type: 'ArtworkExhibited'; readonly playerId: PlayerId; readonly artistId: string; readonly artworkId: string; readonly artworkSlotIndex: number }
  | { readonly type: 'SignaturePriceSet'; readonly signatureTokenId: string; readonly saleValue: number }
  | { readonly type: 'ExhibitionCapacityChanged'; readonly playerId: PlayerId; readonly capacity: number }
  | { readonly type: 'ArtworkMarketRefilled'; readonly genre: string; readonly artworkId: string }
  | {
      readonly type: 'TicketReceived'
      readonly playerId: PlayerId
      readonly color: SetupTicketColor
    }
  | {
      readonly type: 'TicketExchanged'
      readonly playerId: PlayerId
      readonly discardedColor: SetupTicketColor
      readonly receivedColor: SetupTicketColor
    }
  | {
      readonly type: 'FinalScoringCompleted'
      readonly winnerIds: readonly string[]
    }
  | {
  readonly type: 'WinnerDetermined'
  readonly winnerIds: readonly string[]
}
  | {
      readonly type: 'InfluenceScored'
      readonly playerId: PlayerId
      readonly coinsAwarded: number
  }
  | {
      readonly type: 'StartingLocationChosen'
      readonly playerId: PlayerId
      readonly locationId: StartingLocationId
    }
  | { readonly type: 'GameStarted'; readonly gameId: string }
  | { readonly type: 'RoundStarted'; readonly round: number }
  | { readonly type: 'TurnStarted'; readonly playerId: PlayerId }
  | {
      readonly type: 'InfluenceReceived'
      readonly playerId: PlayerId
      readonly gainedInfluence: number
    }

export interface GameTransition<TState> {
  readonly state: TState
  readonly events: readonly GameEvent[]
}

/** Создаёт глубоко замороженный результат команды и её упорядоченные события. */
export function freezeTransition<TState>(
  state: TState,
  events: readonly GameEvent[],
): GameTransition<TState> {
  return deepFreeze({ state, events: [...events] })
}
