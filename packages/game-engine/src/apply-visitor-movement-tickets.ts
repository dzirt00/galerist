import type { GameState, PlayerId } from './types.js'
import { freezeTransition, type GameEvent, type GameTransition } from './game-events.js'

export type VisitorMovementDestination = 'plaza' | 'vestibule' | 'gallery'

export interface VisitorMovementStep {
  readonly visitorId: string
  readonly destination: VisitorMovementDestination
}

/** Атомарная последовательность перемещений билетами по MGMT-002/MGMT-003. */
export function applyVisitorMovementTickets(
  state: Readonly<GameState>,
  playerId: PlayerId,
  steps: readonly VisitorMovementStep[],
): GameTransition<GameState> {
  if (!['regular_play', 'ending_current_round', 'final_round'].includes(state.phase)) {
    throw new Error('Visitor movement requires a playing phase')
  }
  const playerIndex = state.players.findIndex(player => player.id === playerId)
  const boardIndex = state.playerBoards.findIndex(board => board.playerId === playerId)
  if (playerIndex < 0 || boardIndex < 0) throw new Error('Invalid movement player or playerBoard')
  if (!Array.isArray(steps)) throw new Error('Invalid visitor movement steps')

  let next = structuredClone(state)
  const events: GameEvent[] = []
  for (const step of steps) {
    if (step === null || typeof step !== 'object' || typeof step.visitorId !== 'string'
      || !['plaza', 'vestibule', 'gallery'].includes(step.destination)) {
      throw new Error('Invalid visitor movement step')
    }
    const plazaIndex = next.plazaVisitors.findIndex(visitor => visitor.id === step.visitorId)
    const vestibuleIndex = next.vestibuleVisitors.findIndex(entry => entry.vestibuleVisitor.id === step.visitorId)
    const vestibule = next.vestibuleVisitors[vestibuleIndex]
    const visitor = next.plazaVisitors[plazaIndex] ?? vestibule?.vestibuleVisitor
    if (!visitor) throw new Error('Visitor is unavailable in plaza or vestibules')
    const from = plazaIndex >= 0 ? 'plaza' : 'vestibule'
    const permitted = from === 'plaza'
      ? step.destination === 'vestibule'
      : vestibule!.playerId === playerId
        ? step.destination === 'gallery'
        : step.destination === 'plaza'
    if (!permitted) throw new Error('Invalid ticket movement route')

    const player = next.players[playerIndex]!
    const board = next.playerBoards[boardIndex]!
    if (visitor.type !== 'B' && visitor.type !== 'R' && visitor.type !== 'W') {
      throw new Error('Invalid visitor ticket color')
    }
    const tickets = player.ticketsByColor[visitor.type]
    const discarded = next.ticketDiscard[visitor.type]
    if (!Number.isSafeInteger(tickets) || tickets < 1) throw new Error('Insufficient tickets')
    if (!Number.isSafeInteger(discarded) || discarded < 0 || !Number.isSafeInteger(discarded + 1)) {
      throw new Error('Invalid ticketDiscard')
    }
    if (step.destination === 'gallery' && visitor.type === 'W') {
      if (!Number.isSafeInteger(player.soldArtworkCount) || player.soldArtworkCount < 0) {
        throw new Error('Invalid soldArtworkCount')
      }
      if (board.gallery.visitors.filter(item => item.type === 'W').length >= 1 + player.soldArtworkCount) {
        throw new Error('Collector capacity exceeded')
      }
    }

    const plazaVisitors = next.plazaVisitors.filter((_, index) => index !== plazaIndex)
    const vestibuleVisitors = next.vestibuleVisitors.filter((_, index) => index !== vestibuleIndex)
    if (step.destination === 'plaza') plazaVisitors.push(visitor)
    if (step.destination === 'vestibule') vestibuleVisitors.push({ playerId, vestibuleVisitor: visitor })
    next = {
      ...next,
      players: next.players.map((item, index) => index === playerIndex
        ? { ...player, ticketsByColor: { ...player.ticketsByColor, [visitor.type]: tickets - 1 } } : item),
      ticketDiscard: { ...next.ticketDiscard, [visitor.type]: discarded + 1 },
      plazaVisitors,
      vestibuleVisitors,
      playerBoards: next.playerBoards.map((item, index) => index === boardIndex && step.destination === 'gallery'
        ? { ...board, gallery: { ...board.gallery, visitors: [...board.gallery.visitors, visitor] } } : item),
    }
    events.push({ type: 'TicketSpent', playerId, color: visitor.type })
    if (from === 'plaza') {
      events.push({ type: 'VisitorMoved', visitorId: visitor.id, from, to: 'vestibule', playerId })
    } else if (step.destination === 'gallery') {
      events.push({ type: 'VisitorMoved', visitorId: visitor.id, from, to: 'gallery', playerId })
    } else {
      events.push({ type: 'VisitorMoved', visitorId: visitor.id, from, to: 'plaza', playerId,
        fromPlayerId: vestibule!.playerId })
    }
  }
  return freezeTransition(next, events)
}
