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

export interface TicketRewardApplicationInput extends TicketRewardRequest {
  readonly player: GameState['players'][number]
  readonly ticketOffice: GameState['ticketOffice']
  readonly ticketDiscard: GameState['ticketDiscard']
}

export interface TicketRewardApplicationResult {
  readonly player: GameState['players'][number]
  readonly ticketOffice: GameState['ticketOffice']
  readonly ticketDiscard: GameState['ticketDiscard']
  readonly events: readonly GameEvent[]
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
  const playerIndex = state.players.findIndex(player => player.id === request.playerId)
  if (playerIndex === -1) {
    throw new Error('Player must belong to the game')
  }

  const result = applyTicketReward({
    ...request,
    player: state.players[playerIndex]!,
    ticketOffice: state.ticketOffice,
    ticketDiscard: state.ticketDiscard,
  })
  const players = [...state.players]
  players[playerIndex] = result.player

  return freezeTransition(
    {
      ...state,
      players,
      ticketDiscard: result.ticketDiscard,
      ticketOffice: result.ticketOffice,
    },
    result.events,
  )
}

/** Применяет билетную награду к переданным ресурсам без сборки GameState. */
export function applyTicketReward(
  input: TicketRewardApplicationInput,
): TicketRewardApplicationResult {
  validateRequest(input)
  if (input.player.id !== input.playerId) throw new Error('Ticket reward player mismatch')

  let ticketOffice = copyTicketCounts(input.ticketOffice.ticketsByColor)
  let ticketDiscard = copyTicketCounts(input.ticketDiscard)
  const playerTicketsByColor = copyTicketCounts(input.player.ticketsByColor)
  const events: GameEvent[] = []

  for (const color of input.requestedColors) {
    if (ticketOffice[color] > 0) {
      ticketOffice[color] -= 1
    } else {
      const replacementColor = input.replacementColorsByRequestedColor?.[color]
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
          playerId: input.playerId,
          discardedColor: replacementColor!,
          receivedColor: color,
        })
      }
    }

    playerTicketsByColor[color] += 1
    events.push({ type: 'TicketReceived', playerId: input.playerId, color })
  }

  return {
    player: { ...input.player, ticketsByColor: playerTicketsByColor },
    ticketDiscard,
    ticketOffice: { ticketsByColor: ticketOffice },
    events,
  }
}
