import type { ArtworkDefinition } from "./component-catalog.js";

/** Рассчитывает прирост известности при покупке произведения по ARTWORK-004. */
export function calculateArtworkPurchaseFameGain(
  fameGain: ArtworkDefinition['fameGain'],
  collectorCount: number,
): number {
  if( (fameGain !== 'X' && !Number.isSafeInteger(fameGain))
    || !Number.isSafeInteger(collectorCount)
    || collectorCount < 0
  ) {
    throw new Error('Invalid fame Gain');
  }

  if(fameGain === 'X') return 0;
  return fameGain + collectorCount;

}
