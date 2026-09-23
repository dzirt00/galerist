import type { ApplyAdditionalFameSpendInput, ApplyAdditionalFameSpendResult, ArtistFameState, PlayerState } from "./types.js";
import { calculateAdditionalFameFromInfluenceSpend } from "./influence-fame-spending.js";

/** Тратит влияние и начисляет художнику дополнительную известность по INFLUENCE-003. */
export function applyAdditionalFameSpend(
  input: ApplyAdditionalFameSpendInput
): ApplyAdditionalFameSpendResult {
  if (input.fameIncrease.kind === 'blocked_by_artwork_x') {
    throw new Error(`Spending is blocked by artwork X`);
  }

  if( !Number.isSafeInteger(input.fameIncrease.baseFameGain)
  || input.fameIncrease.baseFameGain < 1
  ) {
    throw new RangeError(`baseFameGain < 1`)
  }

  const additionalFame = calculateAdditionalFameFromInfluenceSpend(input.player.influence, input.targetInfluence)

  const player: Readonly<PlayerState> = Object.freeze({ ...input.player, influence: input.targetInfluence })
  const artist: Readonly<ArtistFameState>  =Object.freeze({ ...input.artist, fame: input.artist.fame + additionalFame })
  return Object.freeze({
    player: player,
    artist: artist
  })

}
