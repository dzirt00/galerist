import type { GameState, PlayerId } from './types.js'
import type { GameTransition } from './game-events.js'
import { completeEjectionOpportunity, requireEjectionOpportunity } from './ejection-opportunity.js'

export function declineEjectionOpportunity(state: GameState, playerId: PlayerId): GameTransition<GameState> {
  const opportunity = requireEjectionOpportunity(state, playerId)
  return completeEjectionOpportunity(state, opportunity, [{ type: 'EjectionActionDeclined', playerId }])
}
