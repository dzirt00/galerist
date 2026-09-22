import { describe, expect, it } from 'vitest'

import {
  applyArtworkPurchaseCostAndMoveVisitors,
  type ArtworkDefinition,
  type OpenArtworkSlot,
  type PlayerState,
  type VisitorInstance,
} from '../src/index.js'

function createPlayer(coins: number, influence = 10): PlayerState {
  return {
    id: 'player-1',
    name: 'Алина',
    kind: 'human',
    coins,
    influence,
  }
}

function createArtwork(): ArtworkDefinition {
  return {
    id: 'WORK-D-01',
    genre: 'D',
    fameGain: 1,
    ticketReward: 'B',
    visitorCount: 2,
  }
}

function visitor(id: string, type: VisitorInstance['type']): VisitorInstance {
  return { id, type }
}

describe('Оплата работы и перенос посетителей через applyArtworkPurchaseCostAndMoveVisitors', () => {
  it.each([
    { purchaseType: 'regular' as const, expectedCoins: 4 },
    { purchaseType: 'contract' as const, expectedCoins: 7 },
  ])('использует правильную цену для $purchaseType покупки', ({ purchaseType, expectedCoins }) => {
    const result = applyArtworkPurchaseCostAndMoveVisitors({
      player: createPlayer(10),
      openArtwork: { artwork: createArtwork(), visitors: [] },
      artistInitialFame: 3,
      artistCurrentFame: 6,
      purchaseType,
      plazaVisitors: [],
    })

    expect(result.player.coins).toBe(expectedCoins)
    expect(result.player.influence).toBe(10)
  })

  it('доплачивает монетами за достигнутые денежные отметки влияния', () => {
    const result = applyArtworkPurchaseCostAndMoveVisitors({
      player: createPlayer(0, 10),
      openArtwork: { artwork: createArtwork(), visitors: [] },
      artistInitialFame: 3,
      artistCurrentFame: 2,
      purchaseType: 'regular',
      plazaVisitors: [],
      targetInfluence: 4,
    })

    expect(result.player.coins).toBe(0)
    expect(result.player.influence).toBe(4)
  })

  it('переносит всех посетителей с работы на площадь с сохранением порядка', () => {
    const existingVisitor = visitor('VIS-W-01', 'W')
    const artworkVisitors = [
      visitor('VIS-B-01', 'B'),
      visitor('VIS-R-01', 'R'),
    ]

    const result = applyArtworkPurchaseCostAndMoveVisitors({
      player: createPlayer(10),
      openArtwork: { artwork: createArtwork(), visitors: artworkVisitors },
      artistInitialFame: 3,
      artistCurrentFame: 6,
      purchaseType: 'regular',
      plazaVisitors: [existingVisitor],
    })

    expect(result.plazaVisitors).toEqual([existingVisitor, ...artworkVisitors])
    expect(result.openArtwork.visitors).toEqual([])
  })

  it('отклоняет неоплатную покупку до переноса посетителей', () => {
    const player = createPlayer(1)
    const openArtwork: OpenArtworkSlot = {
      artwork: createArtwork(),
      visitors: [visitor('VIS-B-01', 'B')],
    }
    const plazaVisitors = [visitor('VIS-W-01', 'W')]
    const snapshot = structuredClone({ player, openArtwork, plazaVisitors })

    expect(() => applyArtworkPurchaseCostAndMoveVisitors({
      player,
      openArtwork,
      artistInitialFame: 3,
      artistCurrentFame: 6,
      purchaseType: 'regular',
      plazaVisitors,
    })).toThrow('Insufficient funds')

    expect({ player, openArtwork, plazaVisitors }).toEqual(snapshot)
  })

  it('не изменяет и не замораживает входы, а результат глубоко замораживает', () => {
    const player = createPlayer(10)
    const openArtwork: OpenArtworkSlot = {
      artwork: createArtwork(),
      visitors: [visitor('VIS-B-01', 'B')],
    }
    const plazaVisitors = [visitor('VIS-W-01', 'W')]
    const snapshot = structuredClone({ player, openArtwork, plazaVisitors })

    const result = applyArtworkPurchaseCostAndMoveVisitors({
      player,
      openArtwork,
      artistInitialFame: 3,
      artistCurrentFame: 6,
      purchaseType: 'regular',
      plazaVisitors,
    })

    expect({ player, openArtwork, plazaVisitors }).toEqual(snapshot)
    expect(Object.isFrozen(player)).toBe(false)
    expect(Object.isFrozen(openArtwork)).toBe(false)
    expect(Object.isFrozen(openArtwork.artwork)).toBe(false)
    expect(Object.isFrozen(openArtwork.visitors)).toBe(false)
    expect(Object.isFrozen(openArtwork.visitors[0])).toBe(false)
    expect(Object.isFrozen(plazaVisitors)).toBe(false)
    expect(Object.isFrozen(plazaVisitors[0])).toBe(false)

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.player)).toBe(true)
    expect(Object.isFrozen(result.plazaVisitors)).toBe(true)
    expect(Object.isFrozen(result.plazaVisitors[0])).toBe(true)
    expect(Object.isFrozen(result.openArtwork)).toBe(true)
    expect(Object.isFrozen(result.openArtwork.artwork)).toBe(true)
    expect(Object.isFrozen(result.openArtwork.visitors)).toBe(true)

    expect(result.player).not.toBe(player)
    expect(result.openArtwork).not.toBe(openArtwork)
    expect(result.openArtwork.artwork).not.toBe(openArtwork.artwork)
    expect(result.plazaVisitors[0]).not.toBe(plazaVisitors[0])
    expect(result.plazaVisitors[1]).not.toBe(openArtwork.visitors[0])
  })
})
