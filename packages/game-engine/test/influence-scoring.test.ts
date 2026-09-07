import { describe, expect, it } from 'vitest'
import { calculateFinalInfluenceCoins } from '../src/index.js'

const expectedCoinsByInfluence = [
  0,
  1, 1, 1,
  2, 2, 2, 2,
  3, 3, 3, 3,
  4, 4, 4,
  5, 5, 5,
  6, 6,
  7, 7,
  8, 8,
  9, 9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  20,
] as const

const influenceRanges = [
  [0, 0, 0],
  [1, 3, 1],
  [4, 7, 2],
  [8, 11, 3],
  [12, 14, 4],
  [15, 17, 5],
  [18, 19, 6],
  [20, 21, 7],
  [22, 23, 8],
  [24, 25, 9],
  [26, 26, 10],
  [27, 27, 11],
  [28, 28, 12],
  [29, 29, 13],
  [30, 30, 14],
  [31, 31, 15],
  [32, 32, 16],
  [33, 33, 17],
  [34, 34, 18],
  [35, 35, 20],
] as const

describe('calculateFinalInfluenceCoins', () => {
  it.each(expectedCoinsByInfluence.map((coins, influence) => [influence, coins]))(
    'возвращает $1 монет для влияния $0',
    (influence, expectedCoins) => {
      expect(calculateFinalInfluenceCoins(influence)).toBe(expectedCoins)
    },
  )

  it.each(influenceRanges)(
    'возвращает $2 монет на границах диапазона $0–$1',
    (minimumInfluence, maximumInfluence, expectedCoins) => {
      expect(calculateFinalInfluenceCoins(minimumInfluence)).toBe(expectedCoins)
      expect(calculateFinalInfluenceCoins(maximumInfluence)).toBe(expectedCoins)
    },
  )

  it('пропускает выплату 19 монет между последними точками шкалы', () => {
    expect(calculateFinalInfluenceCoins(34)).toBe(18)
    expect(calculateFinalInfluenceCoins(35)).toBe(20)
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
  ] as const)('отклоняет %s', (_description, runtimeValue) => {
    const invokeWithRuntimeValue = () => calculateFinalInfluenceCoins(
      runtimeValue as unknown as number,
    )

    expect(invokeWithRuntimeValue).toThrowError(RangeError)
    expect(invokeWithRuntimeValue).toThrowError(
      'Influence must be an integer from 0 to 35',
    )
  })

  it('возвращает одинаковый результат при повторных вызовах', () => {
    const firstResult = calculateFinalInfluenceCoins(23)
    const secondResult = calculateFinalInfluenceCoins(23)

    expect(firstResult).toBe(8)
    expect(secondResult).toBe(firstResult)
  })
})
