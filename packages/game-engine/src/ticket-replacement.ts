export type TicketColor = string

export interface TicketSupplies {
  readonly office: Readonly<Record<TicketColor, number>>
  readonly discard: Readonly<Record<TicketColor, number>>
}

export interface ReplaceUnavailableTicketInput {
  readonly supplies: TicketSupplies
  readonly requiredColor: TicketColor
  readonly replacementColor?: TicketColor
}

export interface TicketReplacementResult {
  readonly supplies: Readonly<TicketSupplies>
  readonly grantedColor: TicketColor | null
  readonly exchanged: boolean
}

/** Проверяет, что цвет билета задан непустой строкой. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Проверяет корректность количества билетов каждого цвета. */
function isTicketCounts(value: unknown): value is Readonly<Record<TicketColor, number>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return Object.values(value).every(
    count => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0,
  )
}

/** Проверяет структуру запасов билетов кассы и сброса. */
function isTicketSupplies(value: unknown): value is TicketSupplies {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const supplies = value as Record<string, unknown>
  return isTicketCounts(supplies.office) && isTicketCounts(supplies.discard)
}

/** Возвращает число билетов указанного цвета или ноль при отсутствии записи. */
function ticketCount(
  counts: Readonly<Record<TicketColor, number>>,
  color: TicketColor,
): number {
  return counts[color] ?? 0
}

/** Копирует и замораживает оба запаса билетов. */
function freezeSupplies(
  office: Readonly<Record<TicketColor, number>>,
  discard: Readonly<Record<TicketColor, number>>,
): Readonly<TicketSupplies> {
  return Object.freeze({
    office: Object.freeze({ ...office }),
    discard: Object.freeze({ ...discard }),
  })
}

/** Собирает замороженный результат выдачи или обмена билета. */
function createResult(
  office: Readonly<Record<TicketColor, number>>,
  discard: Readonly<Record<TicketColor, number>>,
  grantedColor: TicketColor | null,
  exchanged: boolean,
): Readonly<TicketReplacementResult> {
  return Object.freeze({
    supplies: freezeSupplies(office, discard),
    grantedColor,
    exchanged,
  })
}

/** Выдаёт недоступный в кассе билет из сброса, при необходимости обменивая билет кассы. */
export function replaceUnavailableTicket(
  input: ReplaceUnavailableTicketInput,
): Readonly<TicketReplacementResult> {
  if (!isTicketSupplies(input?.supplies)) {
    throw new Error('Invalid ticket supplies')
  }
  if (!isNonEmptyString(input.requiredColor)) {
    throw new Error('Required ticket color must be a non-empty string')
  }
  if (input.replacementColor !== undefined && !isNonEmptyString(input.replacementColor)) {
    throw new Error('Replacement ticket color must be a non-empty string')
  }

  const { office, discard } = input.supplies
  const requiredInOffice = ticketCount(office, input.requiredColor)
  if (requiredInOffice > 0) {
    throw new Error('Required ticket is available in office')
  }

  const requiredInDiscard = ticketCount(discard, input.requiredColor)
  const officeHasTickets = Object.values(office).some(count => count > 0)

  if (!officeHasTickets) {
    if (requiredInDiscard === 0) {
      return createResult(office, discard, null, false)
    }

    return createResult(
      office,
      { ...discard, [input.requiredColor]: requiredInDiscard - 1 },
      input.requiredColor,
      false,
    )
  }

  if (input.replacementColor === undefined) {
    throw new Error('Replacement ticket color is required')
  }
  if (input.replacementColor === input.requiredColor) {
    throw new Error('Replacement ticket color must differ from required color')
  }
  if (ticketCount(office, input.replacementColor) === 0) {
    throw new Error('Replacement ticket is unavailable in office')
  }
  if (requiredInDiscard === 0) {
    return createResult(office, discard, null, false)
  }

  return createResult(
    {
      ...office,
      [input.replacementColor]: ticketCount(office, input.replacementColor) - 1,
    },
    {
      ...discard,
      [input.replacementColor]: ticketCount(discard, input.replacementColor) + 1,
      [input.requiredColor]: requiredInDiscard - 1,
    },
    input.requiredColor,
    true,
  )
}
