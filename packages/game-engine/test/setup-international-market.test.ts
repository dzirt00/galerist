import { describe, expect, it, vi } from 'vitest'
import {
  createSetupRng,
  prepareInternationalMarket,
  setupComponentCatalog,
  type SetupInternationalMarket,
  type SetupRng,
} from '../src/index.js'

const config = {
  rulesVersion: 'galerist-rules-2026-09-15-v1',
  componentsVersion: setupComponentCatalog.version,
  seed: -7,
  playerIds: ['player-1', 'player-2', 'player-3'],
}

const tokens = (): string[] => [...setupComponentCatalog.reputationTokenIds]

describe('SETUP-008: подготовка жетонов репутации', () => {
  it.each([2, 3, 4] as const)('размещает жетоны для %i игроков без потерь и повторов', playerCount => {
    const input = tokens().reverse()
    const snapshot = [...input]
    const result: SetupInternationalMarket = prepareInternationalMarket(
      input, playerCount, createSetupRng(config),
    )
    const expectedCells = setupComponentCatalog.marketReputationPlacementOrder.filter(cellId =>
      playerCount !== 2 || !cellId.includes('-C2-'),
    )

    expect(result.marketReputationCells.map(item => item.cellId)).toEqual(expectedCells)
    expect(result.locationReputationTokens.map(item => item.locationId)).toEqual(
      setupComponentCatalog.startingLocationOrder,
    )
    expect(result.marketReputationCells).toHaveLength(playerCount === 2 ? 8 : 12)
    expect(result.locationReputationTokens).toHaveLength(4)
    expect(result.remainingReputationTokenIds).toHaveLength(playerCount === 2 ? 8 : 4)

    const used = [
      ...result.marketReputationCells.map(item => item.tokenId),
      ...result.locationReputationTokens.map(item => item.tokenId),
      ...result.remainingReputationTokenIds,
    ]
    expect(used).toHaveLength(20)
    expect(new Set(used)).toEqual(new Set(setupComponentCatalog.reputationTokenIds))
    expect(input).toEqual(snapshot)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.marketReputationCells)).toBe(true)
    expect(Object.isFrozen(result.locationReputationTokens)).toBe(true)
    expect(Object.isFrozen(result.remainingReputationTokenIds)).toBe(true)
    expect(result.marketReputationCells.every(Object.isFrozen)).toBe(true)
    expect(result.locationReputationTokens.every(Object.isFrozen)).toBe(true)
  })

  it('не зависит от порядка входного каталога при одинаковой конфигурации RNG', () => {
    const ordered = prepareInternationalMarket(tokens(), 3, createSetupRng(config))
    const reversed = prepareInternationalMarket(tokens().reverse(), 3, createSetupRng(config))
    expect(reversed).toEqual(ordered)
    expect(reversed).not.toBe(ordered)
  })

  it.each([
    ['дубликат', [...tokens().slice(0, 19), tokens()[0]!]],
    ['лишний жетон', [...tokens(), 'REP-999']],
    ['чужой жетон', [...tokens().slice(0, 19), 'REP-999']],
  ])('отклоняет %s до расхода RNG и сохраняет вход', (_label, input) => {
    const snapshot = [...input]
    const shuffle = vi.fn()
    expect(() => prepareInternationalMarket(input, 2, { shuffle } as unknown as SetupRng)).toThrow()
    expect(shuffle).not.toHaveBeenCalled()
    expect(input).toEqual(snapshot)
  })
})
