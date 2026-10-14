import type { ConfirmedTurnCommand, GameState, LocationActionCommand } from './types.js'
import { freezeTransition, type GameEvent, type GameTransition } from './game-events.js'
import { prepareTurn } from './turn-preparation.js'
import { applyGalleristMovementToGameState } from './apply-gallerist-movement-to-game-state.js'
import { advertisingArtist } from './advertising-artist.js'
import { applyVisitorMovementTickets } from './apply-visitor-movement-tickets.js'
import { applyAssistantHiringToGameState } from './apply-assistant-hiring-to-game-state.js'
import { applyArtworkSaleToGameState } from './artwork-sale-state.js'
import { orderCardReward } from './order-card-reward.js'
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

/** Applies movement, one matching location action and optional management atomically. */
export function applyTurn(state: GameState, command: ConfirmedTurnCommand): GameTransition<GameState> {

  const prepared = prepareTurn(state, command)
  const action = command.locationAction

  if (action.category !== 'location_action') throw new Error('Invalid location action category')

  const selected = Object.entries(action).filter(([key, value]) => key !== 'category' && value !== undefined)
  const allowed: readonly string[] = locationActions[command.movement.locationId]

  if (selected.length !== 1 || !allowed?.includes(selected[0]![0])) {
    throw new Error('Turn requires exactly one action matching its location')
  }

  const request = selected[0]![1]

  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid location action request')
  if (command.management && command.management.command.category !== 'management_action') {
    throw new Error('Invalid management action category')
  }

  let next = state
  const events: GameEvent[] = []

  const append = (result: GameTransition<GameState>) => {
    next = result.state
    events.push(...result.events)
  }

  for (const step of prepared.steps) {
    switch (step.category) {
      case 'movement':
        append(applyGalleristMovementToGameState(next, command))
        break
      case 'location_action':
        append(applyLocationAction(next, prepared.playerId, step))
        break
      case 'management_action': {
        const selected = Object.entries(step).filter(([key, value]) => key !== 'category' && value !== undefined)

        if (selected.length !== 1 || !['visitorMovementSteps', 'orderCardReward'].includes(selected[0]![0])) {
          throw new Error('Turn requires exactly one management action')
        }
        events.push({ type: 'ManagementActionStarted', playerId: prepared.playerId })

        if (step.visitorMovementSteps !== undefined) {
          append(applyVisitorMovementTickets(next, prepared.playerId, step.visitorMovementSteps))
        } else if (step.orderCardReward !== undefined) {
          const { orderSlot, assistantId, choices } = step.orderCardReward
          append(orderCardReward(next, prepared.playerId, orderSlot, assistantId, choices === undefined ? {} : choices))
        }
        break
      }
      default: throw new Error('Invalid turn step category')
    }
  }
  return freezeTransition(next, events)
}

function applyLocationAction(state: GameState, playerId: string, action: LocationActionCommand): GameTransition<GameState> {
  // The confirmed turn owns the acting player, including all nested choices.
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
