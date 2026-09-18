import { describe, expect, it } from 'vitest'
import {
  preparePromotionSupply,
  setupComponentCatalog,
  type PromotionTokenDefinition,
} from '../src/index.js'

/** Создаёт входные рекламные жетоны для проверки подготовки запаса. */
const inputTokens = (): PromotionTokenDefinition[] =>
  setupComponentCatalog.promotionTokens.map(token => ({ ...token }))

describe('Подготовка запаса рекламы через preparePromotionSupply', () => {
  it('группирует все двадцать токенов в пять уровней по четыре', () => {
    const result = preparePromotionSupply(inputTokens())

    expect(result.tokenIdsByLevel).toEqual({
      1: ['PROMOTION-1-1', 'PROMOTION-1-2', 'PROMOTION-1-3', 'PROMOTION-1-4'],
      2: ['PROMOTION-2-1', 'PROMOTION-2-2', 'PROMOTION-2-3', 'PROMOTION-2-4'],
      3: ['PROMOTION-3-1', 'PROMOTION-3-2', 'PROMOTION-3-3', 'PROMOTION-3-4'],
      4: ['PROMOTION-4-1', 'PROMOTION-4-2', 'PROMOTION-4-3', 'PROMOTION-4-4'],
      5: ['PROMOTION-5-1', 'PROMOTION-5-2', 'PROMOTION-5-3', 'PROMOTION-5-4'],
    })
    expect(new Set(Object.values(result.tokenIdsByLevel).flat()).size).toBe(20)
  })

  it('сохраняет входной порядок токенов внутри каждого уровня', () => {
    const input = inputTokens().reverse()
    const result = preparePromotionSupply(input)

    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(result.tokenIdsByLevel[level]).toEqual(
        input.filter(token => token.level === level).map(token => token.id),
      )
    }
  })

  it('не изменяет и не замораживает вход, а глубоко замораживает результат', () => {
    const input = inputTokens()
    const snapshot = structuredClone(input)
    const result = preparePromotionSupply(input)

    expect(input).toEqual(snapshot)
    expect(Object.isFrozen(input)).toBe(false)
    expect(input.every(token => !Object.isFrozen(token))).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.tokenIdsByLevel)).toBe(true)
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(Object.isFrozen(result.tokenIdsByLevel[level])).toBe(true)
    }
  })

  it('возвращает равные, но независимые результаты при повторном вызове', () => {
    const first = preparePromotionSupply(inputTokens())
    const second = preparePromotionSupply(inputTokens())

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.tokenIdsByLevel).not.toBe(second.tokenIdsByLevel)
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(first.tokenIdsByLevel[level]).not.toBe(second.tokenIdsByLevel[level])
    }
  })
})
