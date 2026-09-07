import { describe, expect, it } from 'vitest'
import { calculateAdditionalFameFromInfluenceSpend } from '../src/index.js'

const INVALID_INFLUENCE_SPEND_MESSAGE = 'Invalid influence spend'

describe('calculateAdditionalFameFromInfluenceSpend', () => {
  it.each([
    [10, 5, 1],
    [10, 0, 2],
    [6, 5, 1],
    [1, 0, 1],
    [35, 30, 1],
  ] as const)(
    'возвращает дополнительную известность',
    (currentInfluence, targetInfluence, expectedAdditionalFame) => {
      expect(
        calculateAdditionalFameFromInfluenceSpend(currentInfluence, targetInfluence),
      ).toBe(expectedAdditionalFame)
    },
  )

  it.each([
    ['равные позиции', 5, 5],
    ['движение вперёд', 5, 10],
    ['цель не является точкой известности', 10, 7],
    ['расход с позиции 0', 0, 0],
  ] as const)(
    'отклоняет %s',
    (_description, currentInfluence, targetInfluence) => {
      const invoke = () => calculateAdditionalFameFromInfluenceSpend(
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
    const invoke = () => calculateAdditionalFameFromInfluenceSpend(
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
    const invoke = () => calculateAdditionalFameFromInfluenceSpend(
      10,
      value as unknown as number,
    )

    expect(invoke).toThrowError(RangeError)
    expect(invoke).toThrowError(INVALID_INFLUENCE_SPEND_MESSAGE)
  })

  it('возвращает одинаковый результат при повторных вызовах', () => {
    const firstResult = calculateAdditionalFameFromInfluenceSpend(25, 0)
    const secondResult = calculateAdditionalFameFromInfluenceSpend(25, 0)

    expect(firstResult).toBe(5)
    expect(secondResult).toBe(firstResult)
  })
})
