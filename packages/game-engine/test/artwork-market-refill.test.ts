import { describe, expect, it } from 'vitest'

import {
  refillArtworkMarket,
  type ArtworkDefinition,
  type VisitorInstance,
} from '../src/index.js'

function artwork(
  id: string,
  visitorCount: number,
): ArtworkDefinition {
  return {
    id,
    genre: 'D',
    fameGain: 1,
    ticketReward: 'B',
    visitorCount,
  }
}

function visitor(id: string, type: VisitorInstance['type']): VisitorInstance {
  return { id, type }
}

describe('Пополнение рынка произведений через refillArtworkMarket', () => {
  it('открывает первую работу и размещает напечатанное число посетителей', () => {
    const artworks = [artwork('WORK-D-01', 2), artwork('WORK-D-02', 1)]
    const visitors = [
      visitor('VIS-B-01', 'B'),
      visitor('VIS-R-01', 'R'),
      visitor('VIS-W-01', 'W'),
    ]

    const result = refillArtworkMarket(artworks, { visitors })

    expect(result.openArtwork).toEqual({
      artwork: artworks[0],
      visitors: visitors.slice(0, 2),
    })
    expect(result.remainingArtworks).toEqual([artworks[1]])
    expect(result.remainingVisitorBag.visitors).toEqual([visitors[2]])
  })

  it('при частично пустом мешочке размещает всех оставшихся посетителей', () => {
    const artworks = [artwork('WORK-D-01', 3)]
    const visitors = [visitor('VIS-B-01', 'B')]

    const result = refillArtworkMarket(artworks, { visitors })

    expect(result.openArtwork).toEqual({
      artwork: artworks[0],
      visitors,
    })
    expect(result.remainingArtworks).toEqual([])
    expect(result.remainingVisitorBag.visitors).toEqual([])
  })

  it('при пустой стопке сохраняет мешочек и не открывает работу', () => {
    const visitors = [visitor('VIS-W-01', 'W')]

    const result = refillArtworkMarket([], { visitors })

    expect(result).toEqual({
      openArtwork: null,
      remainingArtworks: [],
      remainingVisitorBag: { visitors },
    })
  })

  it('не меняет и не замораживает входы, возвращая независимый глубоко замороженный результат', () => {
    const artworks = [artwork('WORK-D-01', 1), artwork('WORK-D-02', 1)]
    const visitorBag = {
      visitors: [visitor('VIS-B-01', 'B'), visitor('VIS-R-01', 'R')],
    }
    const artworkSnapshot = structuredClone(artworks)
    const visitorSnapshot = structuredClone(visitorBag)

    const result = refillArtworkMarket(artworks, visitorBag)

    expect(artworks).toEqual(artworkSnapshot)
    expect(visitorBag).toEqual(visitorSnapshot)
    expect(Object.isFrozen(artworks)).toBe(false)
    expect(artworks.every(item => !Object.isFrozen(item))).toBe(true)
    expect(Object.isFrozen(visitorBag)).toBe(false)
    expect(Object.isFrozen(visitorBag.visitors)).toBe(false)
    expect(visitorBag.visitors.every(item => !Object.isFrozen(item))).toBe(true)

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.openArtwork)).toBe(true)
    expect(Object.isFrozen(result.openArtwork?.artwork)).toBe(true)
    expect(Object.isFrozen(result.openArtwork?.visitors)).toBe(true)
    expect(Object.isFrozen(result.openArtwork?.visitors[0])).toBe(true)
    expect(Object.isFrozen(result.remainingArtworks)).toBe(true)
    expect(Object.isFrozen(result.remainingArtworks[0])).toBe(true)
    expect(Object.isFrozen(result.remainingVisitorBag)).toBe(true)
    expect(Object.isFrozen(result.remainingVisitorBag.visitors)).toBe(true)
    expect(Object.isFrozen(result.remainingVisitorBag.visitors[0])).toBe(true)

    expect(result.openArtwork?.artwork).not.toBe(artworks[0])
    expect(result.openArtwork?.visitors[0]).not.toBe(visitorBag.visitors[0])
    expect(result.remainingArtworks[0]).not.toBe(artworks[1])
    expect(result.remainingVisitorBag.visitors[0]).not.toBe(visitorBag.visitors[1])
  })
})
