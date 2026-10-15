import type { GameState, PendingEjectionOpportunity, PlayerId } from './types.js'
import { freezeTransition, type GameEvent, type GameTransition } from './game-events.js'
import { returnAssistantToOffice } from './return-assistant-to-office.js'

export function requireEjectionOpportunity(state: GameState, playerId: PlayerId): PendingEjectionOpportunity {
  if (state.status !== 'in_progress'
    || (state.phase !== 'regular_play' && state.phase !== 'ending_current_round')) {
    throw new Error('Ejection action requires regular play or ending current round')
  }
  const opportunity = state.pendingEjectionOpportunity
  if (!opportunity || opportunity.playerId !== playerId) throw new Error('Invalid pending ejection opportunity')
  const board = state.playerBoards.find(board => board.playerId === playerId)
  if (!board || !state.players.some(player => player.id === playerId)
    || opportunity.displacedByPlayerId === playerId
    || !state.players.some(player => player.id === opportunity.displacedByPlayerId)
    || !Object.hasOwn(state.assistantByLocation, opportunity.locationId)) {
    throw new Error('Invalid ejection participants or location')
  }
  if (opportunity.pieceType === 'gallerist') {
    if (board.galleristPosition !== `${opportunity.locationId}_EJECT`) throw new Error('Invalid galleristPosition')
  } else if (opportunity.pieceType === 'assistant') {
    if (!board.ejectedAssistant || typeof opportunity.assistantId !== 'string' || !opportunity.assistantId
      || board.ejectedAssistant.assistantId !== opportunity.assistantId
      || board.ejectedAssistant.displacedByPlayerId !== opportunity.displacedByPlayerId) {
      throw new Error('Invalid ejected assistant')
    }
  } else {
    throw new Error('Invalid ejected piece type')
  }
  return opportunity
}

/** Only an unused ejected piece returns; the action may already have placed its assistant. */
export function completeEjectionOpportunity(
  state: GameState, opportunity: PendingEjectionOpportunity, actionEvents: readonly GameEvent[],
): GameTransition<GameState> {
  const next = structuredClone(state)
  const events: GameEvent[] = [...actionEvents]
  const playerBoards = next.playerBoards.map(board => {
    if (board.playerId !== opportunity.playerId) return board
    if (opportunity.pieceType === 'gallerist') {
      events.push({ type: 'GalleristReturnedHome', playerId: board.playerId })
      return { ...board, galleristPosition: 'HOME' as const }
    }
    if (board.ejectedAssistant === null) return board
    const returned = returnAssistantToOffice(board, opportunity.assistantId)
    events.push(...returned.events)
    return { ...board, assistants: returned.assistants, ejectedAssistant: null }
  })
  return freezeTransition({ ...next, playerBoards, pendingEjectionOpportunity: null }, events)
}
