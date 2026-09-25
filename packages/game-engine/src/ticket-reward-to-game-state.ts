import type { SetupTicketColor } from './component-catalog.js'
import { freezeTransition, type GameEvent, type GameTransition } from './game-events.js'
import { replaceUnavailableTicket } from './ticket-replacement.js'
import type { GameState, PlayerId } from './types.js'

export interface TicketRewardRequest {
  readonly playerId: PlayerId
  readonly requestedColors: readonly SetupTicketColor[]
  readonly replacementColorsByRequestedColor?: Readonly<
    Partial<Record<SetupTicketColor, SetupTicketColor>>
  >
}

const TICKET_COLORS: readonly SetupTicketColor[] = ['B', 'R', 'W']

function isTicketColor(value: unknown): value is SetupTicketColor {
  return TICKET_COLORS.includes(value as SetupTicketColor)
}

function validateRequest(request: TicketRewardRequest): void {
  if (request === null || typeof request !== 'object') {
    throw new Error('Ticket reward request must be an object')
  }
  if (!Array.isArray(request.requestedColors) || request.requestedColors.length === 0) {
    throw new Error('Ticket reward must request at least one color')
  }
  if (!request.requestedColors.every(isTicketColor)) {
    throw new Error('Ticket reward contains an invalid color')
  }
  if (new Set(request.requestedColors).size !== request.requestedColors.length) {
    throw new Error('Ticket reward colors must be unique')
  }

  const replacements = request.replacementColorsByRequestedColor
  if (replacements === undefined) return
  if (replacements === null || typeof replacements !== 'object' || Array.isArray(replacements)) {
    throw new Error('Ticket replacement colors must be an object')
  }
  if (Object.entries(replacements).some(([requiredColor, replacementColor]) => (
    !isTicketColor(requiredColor) || !isTicketColor(replacementColor)
  ))) {
    throw new Error('Ticket replacement contains an invalid color')
  }
}

function copyTicketCounts(
  counts: Readonly<Record<string, number>>,
): Record<SetupTicketColor, number> {
  return { B: counts.B ?? 0, R: counts.R ?? 0, W: counts.W ?? 0 }
}

/** Выдаёт конкретно выбранные цвета билетов по TICKET-001/TICKET-002. */
export function applyTicketRewardToGameState(
  state: Readonly<GameState>,
  request: TicketRewardRequest,
): GameTransition<Readonly<GameState>> {
  validateRequest(request)

  const playerIndex = state.players.findIndex(player => player.id === request.playerId)
  if (playerIndex === -1) {
    throw new Error('Player must belong to the game')
  }

  let ticketOffice = copyTicketCounts(state.ticketOffice.ticketsByColor)
  let ticketDiscard = copyTicketCounts(state.ticketDiscard)
  const player = state.players[playerIndex]!
  const playerTicketsByColor = copyTicketCounts(player.ticketsByColor)
  const events: GameEvent[] = []

  for (const color of request.requestedColors) {
    if (ticketOffice[color] > 0) {
      ticketOffice[color] -= 1
    } else {
      const replacementColor = request.replacementColorsByRequestedColor?.[color]
      const replacement = replaceUnavailableTicket({
        supplies: { office: ticketOffice, discard: ticketDiscard },
        requiredColor: color,
        ...(replacementColor === undefined ? {} : { replacementColor }),
      })

      ticketOffice = copyTicketCounts(replacement.supplies.office)
      ticketDiscard = copyTicketCounts(replacement.supplies.discard)
      if (replacement.grantedColor === null) continue

      if (replacement.exchanged) {
        events.push({
          type: 'TicketExchanged',
          playerId: request.playerId,
          discardedColor: replacementColor!,
          receivedColor: color,
        })
      }
    }

    playerTicketsByColor[color] += 1
    events.push({ type: 'TicketReceived', playerId: request.playerId, color })
  }

  const players = [...state.players]
  players[playerIndex] = { ...player, ticketsByColor: playerTicketsByColor }

  return freezeTransition(
    {
      ...state,
      players,
      ticketDiscard,
      ticketOffice: { ticketsByColor: ticketOffice },
    },
    events,
  )
}
