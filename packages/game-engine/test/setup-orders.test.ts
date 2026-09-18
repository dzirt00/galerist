import { describe, expect, it } from 'vitest'
import {
  createSetupRng,
  prepareOrderMarket,
  type SetupRngConfig,
} from '../src/index.js'

const config: SetupRngConfig = {
  rulesVersion: 'galerist-rules-2026-09-15-v1',
  componentsVersion: 'components-transcription-2026-09-15-v4',
  seed: 17,
  playerIds: ['player-1', 'player-2', 'player-3'],
}

const orderIds = Array.from({ length: 20 }, (_, index) => `ORDER-${String(index + 1).padStart(2, '0')}`)

describe('Подготовка рынка заказов через prepareOrderMarket', () => {
  it('детерминированно открывает первые четыре заказа и сохраняет остальные без потерь', () => {
    const expectedOrder = createSetupRng(config).shuffle('orders', orderIds)
    const result = prepareOrderMarket(orderIds, createSetupRng(config))

    expect(result.visibleOrders).toEqual(expectedOrder.slice(0, 4))
    expect(result.remainingOrderIds).toEqual(expectedOrder.slice(4))
    expect(result.visibleOrders).toHaveLength(4)
    expect(result.remainingOrderIds).toHaveLength(16)
    expect([...result.visibleOrders, ...result.remainingOrderIds].sort()).toEqual([...orderIds].sort())
    expect(new Set([...result.visibleOrders, ...result.remainingOrderIds]).size).toBe(orderIds.length)
  })

  it('не изменяет и не замораживает вход, а результат глубоко заморожен', () => {
    const input = [...orderIds]
    const snapshot = [...input]
    const result = prepareOrderMarket(input, createSetupRng(config))

    expect(input).toEqual(snapshot)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.visibleOrders)).toBe(true)
    expect(Object.isFrozen(result.remainingOrderIds)).toBe(true)
  })

  it('при ровно четырёх заказах открывает все заказы и оставляет пустую замороженную колоду', () => {
    const input = orderIds.slice(0, 4)
    const result = prepareOrderMarket(input, createSetupRng(config))

    expect(result.visibleOrders).toHaveLength(4)
    expect(result.remainingOrderIds).toEqual([])
    expect(Object.isFrozen(result.remainingOrderIds)).toBe(true)
  })

  it.each([
    { count: 0, input: [] },
    { count: 1, input: orderIds.slice(0, 1) },
    { count: 2, input: orderIds.slice(0, 2) },
    { count: 3, input: orderIds.slice(0, 3) },
  ])('отклоняет набор из $count заказов', ({ input }) => {
      expect(() => prepareOrderMarket(input, createSetupRng(config))).toThrow(
        'At least four orders are required',
      )
  })

  it('возвращает равные, но независимые результаты для одинаковых независимых RNG', () => {
    const firstResult = prepareOrderMarket(orderIds, createSetupRng(config))
    const secondResult = prepareOrderMarket(orderIds, createSetupRng(config))

    expect(firstResult).toEqual(secondResult)
    expect(firstResult).not.toBe(secondResult)
    expect(firstResult.visibleOrders).not.toBe(secondResult.visibleOrders)
    expect(firstResult.remainingOrderIds).not.toBe(secondResult.remainingOrderIds)
  })
})
