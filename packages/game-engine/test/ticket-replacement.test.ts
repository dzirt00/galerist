import { describe, expect, it } from 'vitest'
import {
  replaceUnavailableTicket,
  type ReplaceUnavailableTicketInput,
} from '../src/index.js'

/** Собирает входные запасы и цвета билетов для проверки замены. */
function input(
  office: Record<string, number>,
  discard: Record<string, number>,
  requiredColor = 'red',
  replacementColor: string | undefined = 'blue',
): ReplaceUnavailableTicketInput {
  return {
    supplies: { office, discard },
    requiredColor,
    ...(replacementColor === undefined ? {} : { replacementColor }),
  }
}

describe('Замена недоступного билета через replaceUnavailableTicket', () => {
  it('обменивает выбранный билет кассы на требуемый билет из сброса', () => {
    const result = replaceUnavailableTicket(input(
      { red: 0, blue: 2, yellow: 1 },
      { red: 3, blue: 4, yellow: 0 },
    ))

    expect(result).toEqual({
      supplies: {
        office: { red: 0, blue: 1, yellow: 1 },
        discard: { red: 2, blue: 5, yellow: 0 },
      },
      grantedColor: 'red',
      exchanged: true,
    })
  })

  it('при полностью пустой кассе выдаёт билет из сброса без обмена', () => {
    const result = replaceUnavailableTicket({
      supplies: { office: { red: 0, blue: 0 }, discard: { red: 1, blue: 4 } },
      requiredColor: 'red',
    })

    expect(result).toEqual({
      supplies: {
        office: { red: 0, blue: 0 },
        discard: { red: 0, blue: 4 },
      },
      grantedColor: 'red',
      exchanged: false,
    })
  })

  it('не выдаёт билет и не меняет запасы, когда требуемого цвета нет в сбросе', () => {
    const request = input({ red: 0, blue: 1 }, { red: 0, blue: 2 })
    const snapshot = structuredClone(request)

    const result = replaceUnavailableTicket(request)

    expect(result).toEqual({
      supplies: snapshot.supplies,
      grantedColor: null,
      exchanged: false,
    })
    expect(request).toEqual(snapshot)
  })

  it('отклоняет вызов, если требуемый билет всё ещё доступен в кассе', () => {
    const request = input({ red: 1, blue: 1 }, { red: 2 })
    const snapshot = structuredClone(request)

    expect(() => replaceUnavailableTicket(request)).toThrow(
      'Required ticket is available in office',
    )
    expect(request).toEqual(snapshot)
  })

  it.each([
    ['не выбран цвет замены', { supplies: { office: { red: 0, blue: 1 }, discard: { red: 1 } }, requiredColor: 'red' }, 'Replacement ticket color is required'],
    ['цвет замены совпадает с требуемым', input({ red: 0, blue: 1 }, { red: 1 }, 'red', 'red'), 'Replacement ticket color must differ from required color'],
    ['выбранного цвета нет в кассе', input({ red: 0, blue: 1 }, { red: 1 }, 'red', 'yellow'), 'Replacement ticket is unavailable in office'],
    ['некорректное количество', input({ red: 0, blue: -1 }, { red: 1 }), 'Invalid ticket supplies'],
  ] as const)('отклоняет: %s', (_description, request, message) => {
    const snapshot = structuredClone(request)

    expect(() => replaceUnavailableTicket(request)).toThrow(message)
    expect(request).toEqual(snapshot)
  })

  it('не изменяет и не замораживает входы, глубоко замораживает результат и возвращает независимые результаты', () => {
    const request = input({ red: 0, blue: 2 }, { red: 3, blue: 0 })
    const snapshot = structuredClone(request)

    const firstResult = replaceUnavailableTicket(request)
    const secondResult = replaceUnavailableTicket(request)

    expect(request).toEqual(snapshot)
    expect(Object.isFrozen(request)).toBe(false)
    expect(Object.isFrozen(request.supplies)).toBe(false)
    expect(Object.isFrozen(request.supplies.office)).toBe(false)
    expect(Object.isFrozen(request.supplies.discard)).toBe(false)
    expect(Object.isFrozen(firstResult)).toBe(true)
    expect(Object.isFrozen(firstResult.supplies)).toBe(true)
    expect(Object.isFrozen(firstResult.supplies.office)).toBe(true)
    expect(Object.isFrozen(firstResult.supplies.discard)).toBe(true)
    expect(secondResult).toEqual(firstResult)
    expect(secondResult).not.toBe(firstResult)
    expect(secondResult.supplies).not.toBe(firstResult.supplies)
    expect(secondResult.supplies.office).not.toBe(firstResult.supplies.office)
    expect(secondResult.supplies.discard).not.toBe(firstResult.supplies.discard)
  })
})
