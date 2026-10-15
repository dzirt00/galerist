import type { GameState, LocationActionCommand, PlayerId } from './types.js'
import type { StartingLocationId } from './component-catalog.js'
import type { GameTransition } from './game-events.js'
import { advertisingArtist } from './advertising-artist.js'
import { applyAssistantHiringToGameState } from './apply-assistant-hiring-to-game-state.js'
import { applyArtworkSaleToGameState } from './artwork-sale-state.js'
import { applyOrderRewardEffect } from './order-reward-effect.js'
import { openArtist } from './open-artist.js'
import { applyArtworkPurchaseToGameState } from './artwork-purchase-payment-state.js'
import { claimReputationToken, placeAuctionBid } from './international-market.js'

const locationActions = {
  'LOC-MEDIA_CENTER': ['advertisingArtist', 'hireAssistants'],
  'LOC-SALES_OFFICE': ['artworkSale', 'receiveOrder'],
  'LOC-ARTISTS_COLONY': ['openArtist', 'artworkPurchase'],
  'LOC-INTERNATIONAL_MARKET': ['claimReputationToken', 'placeAuctionBid'],
} as const

/** Проверяет выбор ровно одного действия, допустимого для локации; используется обычным ходом и выдворением. */
export function validateLocationAction(locationId: StartingLocationId, action: LocationActionCommand): void {
  if (!action || typeof action !== 'object' || Array.isArray(action) || action.category !== 'location_action') {
    throw new Error('Invalid location action category')
  }
  const selected = Object.entries(action).filter(([key, value]) => key !== 'category' && value !== undefined)
  const allowed: readonly string[] | undefined = locationActions[locationId]
  if (selected.length !== 1 || !allowed?.includes(selected[0]![0])) {
    throw new Error('Turn requires exactly one action matching its location')
  }
  const request = selected[0]![1]
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid location action request')
}

/** Вызывает готовую команду выбранного действия локации с исполнителем, подтверждённым внешним оркестратором. */
export function applyLocationAction(state: GameState, playerId: PlayerId, action: LocationActionCommand): GameTransition<GameState> {
  // Вложенный запрос не может подменить исполнителя: внешний playerId записывается после его остальных полей.
  if (action.advertisingArtist !== undefined) return advertisingArtist(state, { ...action.advertisingArtist, playerId })
  if (action.hireAssistants !== undefined) return applyAssistantHiringToGameState(state, { ...action.hireAssistants, playerId })
  if (action.artworkSale !== undefined) return applyArtworkSaleToGameState(state, { ...action.artworkSale, playerId })
  if (action.receiveOrder !== undefined) return applyOrderRewardEffect(state, playerId, 'ORDER-ACTION', action.receiveOrder)
  if (action.openArtist !== undefined) return openArtist(state, { ...action.openArtist, playerId })
  if (action.artworkPurchase !== undefined) return applyArtworkPurchaseToGameState(state, { ...action.artworkPurchase, playerId })
  if (action.claimReputationToken !== undefined) return claimReputationToken(state, { ...action.claimReputationToken, playerId })
  if (action.placeAuctionBid !== undefined) return placeAuctionBid(state, { ...action.placeAuctionBid, playerId })
  throw new Error('Missing location action')
}
