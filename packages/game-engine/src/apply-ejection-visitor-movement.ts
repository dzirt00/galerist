import type { GameState, PlayerId } from './types.js'
import { applyVisitorMovementTickets, type VisitorMovementStep } from './apply-visitor-movement-tickets.js'
import type { GameTransition } from './game-events.js'
import { completeEjectionOpportunity, requireEjectionOpportunity } from './ejection-opportunity.js'

/** EJECT-003: resolve one ticket management action, then return the ejected piece. */
export function applyEjectionVisitorMovement(
  state: GameState, playerId: PlayerId, steps: readonly VisitorMovementStep[],
): GameTransition<GameState> {
  const opportunity = requireEjectionOpportunity(state, playerId)
  const result = applyVisitorMovementTickets(state, playerId, steps)
  return completeEjectionOpportunity(result.state, opportunity, [
    { type: 'ManagementActionStarted', playerId },
    ...result.events,
    { type: 'EjectionActionPerformed', playerId },
  ])
}
