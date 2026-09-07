import { describe, expect, it } from 'vitest'
import {
  calculateIntermediateIncome,
  type IntermediateIncome,
  type IntermediateVisitorCounts,
} from '../src/index.js'

const INVALID_VISITOR_COUNT_MESSAGE = 'Invalid visitor count'

describe('calculateIntermediateIncome', () => {
  it.each([
    [0, 0, 0, 0, 0],
    [2, 3, 1, 5, 7],
    [4, 0, 0, 8, 0],
    [0, 2, 0, 0, 4],
    [0, 0, 3, 3, 3],
  ] as const)(
    'для %i инвесторов, %i знаменитостей и %i коллекционеров возвращает %i монет и %i влияния',
    (investors, celebrities, collectors, coins, influence) => {
      expect(calculateIntermediateIncome({
        investors,
        celebrities,
        collectors,
      })).toEqual({ coins, influence })
    },
  )

  it.each([
    ['отрицательное число', -1],
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
  ] as const)('отклоняет невалидное значение посетителя: %s', (_description, value) => {
    const obj1 = { investors: value, celebrities: 0, collectors: 0 }
    const obj2 = { investors: 0, celebrities: value, collectors: 0 }
    const obj3 = { investors: 0, celebrities: 0, collectors: value }

    const invoke1 = () => calculateIntermediateIncome(
      obj1 as unknown as IntermediateVisitorCounts,
    )
    const invoke2 = () => calculateIntermediateIncome(
      obj2 as unknown as IntermediateVisitorCounts,
    )
    const invoke3 = () => calculateIntermediateIncome(
      obj3 as unknown as IntermediateVisitorCounts,
    )

    expect(invoke1).toThrow(INVALID_VISITOR_COUNT_MESSAGE)
    expect(invoke2).toThrow(INVALID_VISITOR_COUNT_MESSAGE)
    expect(invoke3).toThrow(INVALID_VISITOR_COUNT_MESSAGE)
  })

  it('игнорирует дополнительные свойства объекта', () => {
    const visitors = {
      investors: 2,
      celebrities: 3,
      collectors: 1,
      label: 'gallery visitors',
    }

    expect(calculateIntermediateIncome(visitors)).toEqual({
      coins: 5,
      influence: 7,
    })
  })

  it('возвращает одинаковый результат при повторных вызовах', () => {
    const vis: IntermediateVisitorCounts = { investors: 2, celebrities: 3, collectors: 1 }
    const ex: IntermediateIncome = { coins: 5, influence: 7 }
    const originalVisitors = { ...vis }
    const firstResult = calculateIntermediateIncome(vis)
    const secondResult = calculateIntermediateIncome(vis)

    expect(vis).toEqual(originalVisitors)
    expect(firstResult).toEqual(ex)
    expect(Object.isFrozen(firstResult)).toBe(true)
    expect(secondResult).toEqual(firstResult)
    expect(secondResult).not.toBe(firstResult)
  })

  it('отклоняет отсутствие обязательного поля', () => {
    const vis1 = { celebrities: 3, collectors: 1 }
    const vis2 = { investors: 2, collectors: 1 }
    const vis3 = { investors: 2, celebrities: 3 }

    const res1 = () => calculateIntermediateIncome(
      vis1 as unknown as IntermediateVisitorCounts,
    )
    const res2 = () => calculateIntermediateIncome(
      vis2 as unknown as IntermediateVisitorCounts,
    )
    const res3 = () => calculateIntermediateIncome(
      vis3 as unknown as IntermediateVisitorCounts,
    )

    expect(res1).toThrow(INVALID_VISITOR_COUNT_MESSAGE)
    expect(res2).toThrow(INVALID_VISITOR_COUNT_MESSAGE)
    expect(res3).toThrow(INVALID_VISITOR_COUNT_MESSAGE)
  })
})
