import type { ArtworkDefinition } from "./component-catalog.js";

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
