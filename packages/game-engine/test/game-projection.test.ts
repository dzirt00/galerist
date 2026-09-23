import { describe, expect, it } from 'vitest'
import {
  projectGameForViewer,
  type FinalScoringGameState,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs } from './fixtures.js'

describe('projectGameForViewer', () => {
  it('скрывает seed, версии и порядки закрытых компонентов', () => {
    const state = createGameState(
      { playerCount: 2, seed: -42 },
      twoPlayerConfigs,
    )
    const projection = projectGameForViewer(state, 'player-1')

    expect(projection.config).toEqual({ playerCount: 2 })
    expect(projection).not.toHaveProperty('id')
    expect(projection).not.toHaveProperty('setupVersions')
    expect(projection).not.toHaveProperty('startingLocationSelectionOrder')
    expect(projection.orderMarket).not.toHaveProperty('remainingOrderIds')
    expect(projection.visitorBag).not.toHaveProperty('visitors')
    expect(projection.artistMarket).not.toHaveProperty('unselectedArtistIds')
    expect(projection.internationalMarket).not.toHaveProperty('remainingTokenIds')
    expect(projection.artworkMarket).not.toHaveProperty('deferredArtworksByGenre')
    expect(projection.artworkMarket).not.toHaveProperty('remainingArtworksByGenre')
    expect(projection.privateGoals).not.toHaveProperty('remainingCuratorGoals')
    expect(projection.privateGoals).not.toHaveProperty('remainingDealerGoals')
    expect(Object.keys(projection.privateGoals.goalsByPlayer)).toEqual(['player-1'])
    expect(Object.isFrozen(projection)).toBe(true)
  })

  it('не показывает цели наблюдателю до финального подсчёта', () => {
    const state = createGameState(
      { playerCount: 2, seed: 42 },
      twoPlayerConfigs,
    )

    expect(projectGameForViewer(state, null).privateGoals.goalsByPlayer).toEqual({})
  })

  it('показывает все цели при финальном подсчёте', () => {
    const regularPlay = startGameAfterSetup(createGameState(
      { playerCount: 2, seed: 42 },
      twoPlayerConfigs,
    ))
    const finalScoring = {
      ...regularPlay,
      phase: 'final_scoring',
      activePlayerId: null,
      endTriggeredRound: 1,
    } as FinalScoringGameState

    const projection = projectGameForViewer(finalScoring, null)
    expect(Object.keys(projection.privateGoals.goalsByPlayer).sort()).toEqual([
      'player-1',
      'player-2',
    ])
  })

  it('отклоняет неизвестного зрителя и не замораживает восстановленный вход', () => {
    const restored = structuredClone(createGameState(
      { playerCount: 2, seed: 42 },
      twoPlayerConfigs,
    ))
    const snapshot = structuredClone(restored)

    expect(() => projectGameForViewer(restored, 'missing')).toThrow(
      'Viewer must be a player or null',
    )
    expect(restored).toEqual(snapshot)
    expect(Object.isFrozen(restored)).toBe(false)

    projectGameForViewer(restored, null)
    expect(Object.isFrozen(restored)).toBe(false)
  })
})
