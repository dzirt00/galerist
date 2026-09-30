interface SaleValueThreshold {
  readonly fame: number
  readonly saleValue: number
}

const THRESHOLDS_BY_ARTIST_ID: Readonly<Record<string, readonly SaleValueThreshold[]>> = Object.freeze({
  'ART-D-BLUE-1': [{ fame: 2, saleValue: 5 }, { fame: 5, saleValue: 8 }, { fame: 8, saleValue: 11 }, { fame: 11, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-P-BLUE-1': [{ fame: 2, saleValue: 5 }, { fame: 5, saleValue: 8 }, { fame: 8, saleValue: 11 }, { fame: 11, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-D-BLUE-4': [{ fame: 4, saleValue: 5 }, { fame: 6, saleValue: 8 }, { fame: 9, saleValue: 11 }, { fame: 12, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-D-RED-5': [{ fame: 5, saleValue: 5 }, { fame: 6, saleValue: 8 }, { fame: 9, saleValue: 11 }, { fame: 12, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-P-BLUE-4': [{ fame: 4, saleValue: 5 }, { fame: 6, saleValue: 8 }, { fame: 9, saleValue: 11 }, { fame: 12, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-P-RED-5': [{ fame: 5, saleValue: 5 }, { fame: 6, saleValue: 8 }, { fame: 9, saleValue: 11 }, { fame: 12, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-S-BLUE-5': [{ fame: 5, saleValue: 5 }, { fame: 6, saleValue: 8 }, { fame: 9, saleValue: 11 }, { fame: 12, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-A-BLUE-5': [{ fame: 5, saleValue: 5 }, { fame: 6, saleValue: 8 }, { fame: 9, saleValue: 11 }, { fame: 12, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-D-RED-8': [{ fame: 8, saleValue: 8 }, { fame: 9, saleValue: 11 }, { fame: 12, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-P-RED-8': [{ fame: 8, saleValue: 8 }, { fame: 9, saleValue: 11 }, { fame: 12, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-S-BLUE-3': [{ fame: 3, saleValue: 5 }, { fame: 5, saleValue: 8 }, { fame: 8, saleValue: 11 }, { fame: 11, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-A-BLUE-3': [{ fame: 3, saleValue: 5 }, { fame: 5, saleValue: 8 }, { fame: 8, saleValue: 11 }, { fame: 11, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-S-RED-7': [{ fame: 7, saleValue: 8 }, { fame: 9, saleValue: 11 }, { fame: 12, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-A-RED-7': [{ fame: 7, saleValue: 8 }, { fame: 9, saleValue: 11 }, { fame: 12, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-S-RED-10': [{ fame: 10, saleValue: 11 }, { fame: 12, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
  'ART-A-RED-10': [{ fame: 10, saleValue: 11 }, { fame: 12, saleValue: 14 }, { fame: 15, saleValue: 17 }, { fame: 19, saleValue: 20 }],
})

/** Возвращает цену продажи работы художника по таблице 17.3. */
export function calculateArtworkSaleValue(artistId: string, fame: number): number {
  if (!Number.isSafeInteger(fame) || fame < 0) throw new Error('Invalid artist fame')
  const thresholds = THRESHOLDS_BY_ARTIST_ID[artistId]
  if (thresholds === undefined) throw new Error(`Unknown artist ${artistId}`)
  return thresholds.reduce(
    (saleValue, threshold) => fame >= threshold.fame ? threshold.saleValue : saleValue,
    0,
  )
}
