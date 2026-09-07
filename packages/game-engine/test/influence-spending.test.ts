import { describe, expect, it } from 'vitest'
import { calculateCoinsFromInfluenceSpend } from '../src/index.js'

const INVALID_INFLUENCE_SPEND_MESSAGE = 'Invalid influence spend'

describe('calculateCoinsFromInfluenceSpend', () => {
  it.each([
    [10, 8, 1],
    [10, 4, 2],
    [10, 0, 4],
    [1, 0, 1],
    [35, 34, 1],
  ] as const)(
    'возвращает $2 монет при движении с $0 до $1',
    (currentInfluence, targetInfluence, expectedCoins) => {
      expect(
        calculateCoinsFromInfluenceSpend(currentInfluence, targetInfluence),
      ).toBe(expectedCoins)
    },
  )

  it('не засчитывает текущую позицию, если она является денежной точкой', () => {
    expect(calculateCoinsFromInfluenceSpend(8, 4)).toBe(1)
  })

  it.each([
    ['равные позиции', 4, 4],
    ['движение вперёд', 4, 5],
    ['цель не является денежной точкой', 10, 7],
    ['расход с позиции 0', 0, 0],
  ] as const)(
    'отклоняет %s',
    (_description, currentInfluence, targetInfluence) => {
      const invoke = () => calculateCoinsFromInfluenceSpend(
        currentInfluence,
        targetInfluence,
      )

      expect(invoke).toThrowError(RangeError)
      expect(invoke).toThrowError(INVALID_INFLUENCE_SPEND_MESSAGE)
    },
  )

  it.each([
    ['отрицательное число', -1],
    ['значение больше 35', 36],
    ['дробное число', 4.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['строка', '4'],
    ['boolean', true],
    ['null', null],
    ['undefined', undefined],
    ['объект', { influence: 4 }],
    ['массив', [4]],
    ['bigint', 4n],
    ['symbol', Symbol('4')],
    ['функция', () => 4],
  ] as const)('отклоняет невалидный currentInfluence: %s', (_description, value) => {
    const invoke = () => calculateCoinsFromInfluenceSpend(
      value as unknown as number,
      0,
    )

    expect(invoke).toThrowError(RangeError)
    expect(invoke).toThrowError(INVALID_INFLUENCE_SPEND_MESSAGE)
  })

  it.each([
    ['отрицательное число', -1],
    ['значение больше 35', 36],
    ['дробное число', 4.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['строка', '4'],
    ['boolean', true],
    ['null', null],
    ['undefined', undefined],
    ['объект', { influence: 4 }],
    ['массив', [4]],
    ['bigint', 4n],
    ['symbol', Symbol('4')],
    ['функция', () => 4],
  ] as const)('отклоняет невалидный targetInfluence: %s', (_description, value) => {
    const invoke = () => calculateCoinsFromInfluenceSpend(
      10,
      value as unknown as number,
    )

    expect(invoke).toThrowError(RangeError)
    expect(invoke).toThrowError(INVALID_INFLUENCE_SPEND_MESSAGE)
  })

  it('возвращает одинаковый результат при повторных вызовах', () => {
    const firstResult = calculateCoinsFromInfluenceSpend(24, 8)
    const secondResult = calculateCoinsFromInfluenceSpend(24, 8)

    expect(firstResult).toBe(6)
    expect(secondResult).toBe(firstResult)
  })
})
