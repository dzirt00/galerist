import { deepFreeze, type StartingLocationId } from './component-catalog.js'
import type { PlayerId } from './types.js'

export type GameEvent =
  | { readonly type: 'GameCreated'; readonly gameId: string }
  | { readonly type: 'VisitorBagPrepared' }
  | { readonly type: 'TicketOfficePrepared' }
  | { readonly type: 'OrderMarketPrepared' }
  | { readonly type: 'ArtistsPrepared' }
  | { readonly type: 'ArtistOpened'; readonly artistId: string }
  | { readonly type: 'PromotionSupplyPrepared' }
  | { readonly type: 'ArtworkMarketPrepared' }
  | { readonly type: 'InternationalMarketPrepared' }
  | { readonly type: 'LocationReputationPrepared' }
  | { readonly type: 'MasterpieceAuctionPrepared' }
  | { readonly type: 'InitialVisitorsPlaced' }
  | { readonly type: 'FirstPlayerSelected'; readonly playerId: PlayerId }
  | { readonly type: 'PlayerBoardPrepared'; readonly playerId: PlayerId }
  | { readonly type: 'PrivateGoalsDealt'; readonly playerId: PlayerId }
  | { readonly type: 'FinalScoringStarted' }
  | { readonly type: 'GameEndTriggered' }
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
