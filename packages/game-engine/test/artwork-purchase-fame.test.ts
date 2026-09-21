import { describe, expect, it } from 'vitest'

import {
  calculateArtworkPurchaseFameGain,
  setupComponentCatalog,
} from '../src/index.js'

describe('calculateArtworkPurchaseFameGain', () => {
  it('складывает напечатанный прирост с числом коллекционеров', () => {
    expect(calculateArtworkPurchaseFameGain(2, 3)).toBe(5)
  })

  it('учитывает коллекционеров при нулевом напечатанном приросте', () => {
    expect(calculateArtworkPurchaseFameGain(0, 2)).toBe(2)
  })

  it('не даёт известность за каждую каталожную работу X независимо от коллекционеров', () => {
    const xArtworks = setupComponentCatalog.artworks.filter(
      artwork => artwork.fameGain === 'X',
    )

    expect(xArtworks).toHaveLength(4)
    for (const artwork of xArtworks) {
      expect(calculateArtworkPurchaseFameGain(artwork.fameGain, 3)).toBe(0)
    }
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'отклоняет недопустимое число коллекционеров: %s',
    collectorCount => {
      expect(() => calculateArtworkPurchaseFameGain(2, collectorCount)).toThrow(
        'Invalid fame Gain',
      )
    },
  )
})
