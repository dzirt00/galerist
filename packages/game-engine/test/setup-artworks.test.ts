import { describe, expect, it } from 'vitest'
import {
  createSetupRng,
  prepareArtworkMarket,
  prepareVisitorBag,
  setupComponentCatalog,
  type ArtworkDefinition,
  type ArtworkGenre,
  type SetupRng,
  type SetupRngConfig,
  type VisitorInstance,
} from '../src/index.js'

const config: SetupRngConfig = {
  rulesVersion: 'galerist-rules-2026-09-15-v1',
  componentsVersion: 'components-transcription-2026-09-15-v4',
  seed: 41,
  playerIds: ['player-1', 'player-2', 'player-3', 'player-4'],
}

/** Возвращает изменяемые копии каталога для проверки отсутствия побочных эффектов. */
function inputArtworks(): ArtworkDefinition[] {
  return setupComponentCatalog.artworks.map(artwork => ({ ...artwork }))
}

/** Возвращает заранее перемешанный мешочек, с которого начинается SETUP-006. */
function inputVisitorBag(): { visitors: VisitorInstance[] } {
  const visitors = setupComponentCatalog.visitorInstancesByPlayerCount[4]
    .map(visitor => ({ ...visitor }))

  return {
    visitors: prepareVisitorBag(visitors, createSetupRng(config)).visitors
      .map(visitor => ({ ...visitor })),
  }
}

/** Сравнивает ASCII-идентификаторы без локалезависимой сортировки. */
function compareAsciiIds(left: ArtworkDefinition, right: ArtworkDefinition): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

describe('Подготовка рынка произведений через prepareArtworkMarket', () => {
  it('отдельно перемешивает четыре жанра и последовательно размещает посетителей', () => {
    const artworks = inputArtworks()
    const visitorsBag = inputVisitorBag()
    const expectedRng = createSetupRng(config)
    const expectedByGenre = {} as Record<ArtworkGenre, readonly ArtworkDefinition[]>

    for (const genre of setupComponentCatalog.genreOrder) {
      const sorted = artworks
        .filter(artwork => artwork.genre === genre)
        .sort(compareAsciiIds)
      expectedByGenre[genre] = expectedRng.shuffle(`artworks/${genre}`, sorted)
    }

    const rng = createSetupRng(config)
    const shuffleCalls: {
      readonly stageId: string
      readonly items: readonly unknown[]
    }[] = []
    const trackingRng: SetupRng = {
      ...rng,
      shuffle<T>(stageId: string, items: readonly T[]): readonly T[] {
        shuffleCalls.push({ stageId, items })
        return rng.shuffle(stageId, items)
      },
    }
    const result = prepareArtworkMarket(artworks, visitorsBag, trackingRng)
    let visitorOffset = 0

    expect(shuffleCalls).toHaveLength(4)
    for (const [genreIndex, genre] of setupComponentCatalog.genreOrder.entries()) {
      const expectedStack = expectedByGenre[genre]
      const expectedOpen = expectedStack[1]!
      const nextVisitorOffset = visitorOffset + expectedOpen.visitorCount

      expect(shuffleCalls[genreIndex]).toEqual({
        stageId: `artworks/${genre}`,
        items: artworks.filter(artwork => artwork.genre === genre).sort(compareAsciiIds),
      })
      expect(result.deferredArtworksByGenre[genre]).toEqual(expectedStack[0])
      expect(result.openArtworksByGenre[genre].artwork).toEqual(expectedOpen)
      expect(result.openArtworksByGenre[genre].visitors).toEqual(
        visitorsBag.visitors.slice(visitorOffset, nextVisitorOffset),
      )
      expect(result.openArtworksByGenre[genre].visitors).toHaveLength(expectedOpen.visitorCount)
      expect(result.remainingArtworksByGenre[genre]).toEqual(expectedStack.slice(2))
      visitorOffset = nextVisitorOffset
    }

    expect(result.remainingVisitorBag.visitors).toEqual(
      visitorsBag.visitors.slice(visitorOffset),
    )
  })

  it('не зависит от порядка входных работ, сохраняет все компоненты и не меняет вход', () => {
    const artworks = inputArtworks()
    const visitorsBag = inputVisitorBag()
    const artworkSnapshot = structuredClone(artworks)
    const visitorSnapshot = structuredClone(visitorsBag)

    const forward = prepareArtworkMarket(artworks, visitorsBag, createSetupRng(config))
    const reversed = prepareArtworkMarket(
      [...artworks].reverse(),
      { visitors: visitorsBag.visitors.map(visitor => ({ ...visitor })) },
      createSetupRng(config),
    )

    expect(forward).toEqual(reversed)
    expect(artworks).toEqual(artworkSnapshot)
    expect(visitorsBag).toEqual(visitorSnapshot)
    expect(Object.isFrozen(artworks)).toBe(false)
    expect(artworks.every(artwork => !Object.isFrozen(artwork))).toBe(true)
    expect(Object.isFrozen(visitorsBag)).toBe(false)
    expect(Object.isFrozen(visitorsBag.visitors)).toBe(false)
    expect(visitorsBag.visitors.every(visitor => !Object.isFrozen(visitor))).toBe(true)

    const outputArtworkIds = setupComponentCatalog.genreOrder.flatMap(genre => [
      forward.deferredArtworksByGenre[genre].id,
      forward.openArtworksByGenre[genre].artwork.id,
      ...forward.remainingArtworksByGenre[genre].map(artwork => artwork.id),
    ])
    expect(outputArtworkIds.sort()).toEqual(artworks.map(artwork => artwork.id).sort())
    expect(new Set(outputArtworkIds).size).toBe(artworks.length)

    const outputVisitorIds = [
      ...setupComponentCatalog.genreOrder.flatMap(genre =>
        forward.openArtworksByGenre[genre].visitors.map(visitor => visitor.id)),
      ...forward.remainingVisitorBag.visitors.map(visitor => visitor.id),
    ]
    expect(outputVisitorIds).toEqual(visitorsBag.visitors.map(visitor => visitor.id))
    expect(new Set(outputVisitorIds).size).toBe(visitorsBag.visitors.length)
  })

  it('возвращает независимый глубоко замороженный результат', () => {
    const artworks = inputArtworks()
    const visitorsBag = inputVisitorBag()
    const first = prepareArtworkMarket(artworks, visitorsBag, createSetupRng(config))
    const second = prepareArtworkMarket(artworks, visitorsBag, createSetupRng(config))

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.deferredArtworksByGenre)).toBe(true)
    expect(Object.isFrozen(first.openArtworksByGenre)).toBe(true)
    expect(Object.isFrozen(first.remainingArtworksByGenre)).toBe(true)
    expect(Object.isFrozen(first.remainingVisitorBag)).toBe(true)
    expect(Object.isFrozen(first.remainingVisitorBag.visitors)).toBe(true)

    for (const genre of setupComponentCatalog.genreOrder) {
      expect(Object.isFrozen(first.deferredArtworksByGenre[genre])).toBe(true)
      expect(Object.isFrozen(first.openArtworksByGenre[genre])).toBe(true)
      expect(Object.isFrozen(first.openArtworksByGenre[genre].artwork)).toBe(true)
      expect(Object.isFrozen(first.openArtworksByGenre[genre].visitors)).toBe(true)
      expect(Object.isFrozen(first.remainingArtworksByGenre[genre])).toBe(true)

      expect(artworks).not.toContain(first.deferredArtworksByGenre[genre])
      expect(artworks).not.toContain(first.openArtworksByGenre[genre].artwork)
      expect(second.deferredArtworksByGenre[genre])
        .not.toBe(first.deferredArtworksByGenre[genre])
    }
  })

  it('отклоняет отсутствующую стопку жанра до обращения к RNG', () => {
    const artworks = inputArtworks().filter(artwork => artwork.genre !== 'A')
    const visitorsBag = inputVisitorBag()
    const baseRng = createSetupRng(config)
    let shuffleCallCount = 0
    const trackingRng: SetupRng = {
      ...baseRng,
      shuffle<T>(stageId: string, items: readonly T[]): readonly T[] {
        shuffleCallCount += 1
        return baseRng.shuffle(stageId, items)
      },
    }

    expect(() => prepareArtworkMarket(artworks, visitorsBag, trackingRng))
      .toThrow('At least two artworks are required for genre A')
    expect(shuffleCallCount).toBe(0)
  })

  it('отклоняет нехватку посетителей для четырёх открытых работ', () => {
    const artworks = setupComponentCatalog.genreOrder.flatMap(genre => [
      {
        id: `WORK-${genre}-01`,
        genre,
        fameGain: 0,
        ticketReward: 'ANY',
        visitorCount: 1,
      },
      {
        id: `WORK-${genre}-02`,
        genre,
        fameGain: 1,
        ticketReward: 'B',
        visitorCount: 1,
      },
    ] satisfies ArtworkDefinition[])
    const visitorsBag = {
      visitors: (['B', 'R', 'W'] as const).map((type, index) => ({
        id: `VIS-${type}-0${index + 1}`,
        type,
      })),
    }

    expect(() => prepareArtworkMarket(artworks, visitorsBag, createSetupRng(config)))
      .toThrow('Not enough visitors for open artworks')
  })

  it('отклоняет повторяющиеся ID работ и посетителей', () => {
    const artworks = inputArtworks()
    artworks[1] = { ...artworks[1]!, id: artworks[0]!.id }
    const visitorsBag = inputVisitorBag()
    visitorsBag.visitors[1] = { ...visitorsBag.visitors[1]!, id: visitorsBag.visitors[0]!.id }

    expect(() => prepareArtworkMarket(artworks, inputVisitorBag(), createSetupRng(config)))
      .toThrow('Artwork IDs must be unique')
    expect(() => prepareArtworkMarket(inputArtworks(), visitorsBag, createSetupRng(config)))
      .toThrow('Visitor IDs must be unique')
  })
})
