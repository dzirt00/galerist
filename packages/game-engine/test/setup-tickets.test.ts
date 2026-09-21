import { describe, expect, it } from 'vitest'
import { prepareTicketOffice } from '../src/index.js'

describe('Подготовка билетной кассы через prepareTicketOffice', () => {
  it.each([
    [2, 10],
    [3, 15],
    [4, 20],
  ] as const)('для %i игроков готовит по %i билетов каждого цвета', (playerCount, expectedCount) => {
    const result = prepareTicketOffice(playerCount)

    expect(result.ticketsByColor).toEqual({
      B: expectedCount,
      R: expectedCount,
      W: expectedCount,
    })
  })

  it.each([1, 5, 0, -1])('отклоняет недопустимое runtime-значение %i', playerCount => {
    expect(() => prepareTicketOffice(playerCount as 2)).toThrow('Not enough player count')
  })

  it('глубоко замораживает подготовленную кассу', () => {
    const result = prepareTicketOffice(3)

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.ticketsByColor)).toBe(true)
  })

  it('возвращает равные, но независимые результаты при повторном вызове', () => {
    const first = prepareTicketOffice(4)
    const second = prepareTicketOffice(4)

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.ticketsByColor).not.toBe(second.ticketsByColor)
  })
})
