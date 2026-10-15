import type { GameState, LocationActionCommand, PlayerId } from './types.js'
import type { GameTransition } from './game-events.js'
import { applyLocationAction, validateLocationAction } from './location-action.js'
import { completeEjectionOpportunity, requireEjectionOpportunity } from './ejection-opportunity.js'

/** EJECT-003: pay to the strictly previous fame symbol, then perform this location's action. */
export function applyEjectionLocationAction(
  state: GameState, playerId: PlayerId, action: LocationActionCommand,
): GameTransition<GameState> {
  const opportunity = requireEjectionOpportunity(state, playerId)
  validateLocationAction(opportunity.locationId, action)
  const player = state.players.find(player => player.id === playerId)!
  if (!Number.isSafeInteger(player.influence) || player.influence < 1 || player.influence > 35) {
    throw new Error('Insufficient or invalid influence for ejection action')
  }
  const targetInfluence = Math.floor((player.influence - 1) / 5) * 5
  const paid: GameState = { ...state, players: state.players.map(current => current.id === playerId
    ? { ...current, influence: targetInfluence } : current) }
  const result = applyLocationAction(paid, playerId, action)
  return completeEjectionOpportunity(result.state, opportunity, [
    { type: 'InfluenceSpent', playerId, spentInfluence: player.influence - targetInfluence },
    ...result.events,
    { type: 'EjectionActionPerformed', playerId },
  ])
}
