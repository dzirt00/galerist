import { describe, expect, it } from 'vitest'
import { calculateArtworkSaleValue } from '../src/index.js'

describe('calculateArtworkSaleValue', () => {
  it.each([
    ['ART-D-BLUE-1', 1, 0],
    ['ART-D-BLUE-1', 2, 5],
    ['ART-D-BLUE-1', 7, 8],
    ['ART-D-BLUE-1', 19, 20],
    ['ART-S-RED-10', 10, 11],
    ['ART-S-RED-10', 14, 14],
  ] as const)('считает цену %s при известности %i', (artistId, fame, saleValue) => {
    expect(calculateArtworkSaleValue(artistId, fame)).toBe(saleValue)
  })

  it('отклоняет неизвестного художника', () => {
    expect(() => calculateArtworkSaleValue('missing', 5)).toThrow('Unknown artist')
  })
})
