import type { PlayerState } from "./types.js";
import { calculateInfluenceAfterGain } from "./influence-gain.js";

export interface PlayerGainedInfluence {
  readonly player:  Readonly<PlayerState>,
  readonly gainedInfluence: number
}
export function applyInfluenceGainToPlayer(
  player:  Readonly<PlayerState>,
  gainedInfluence: number
): Readonly<PlayerState> {
  const resInfluence = calculateInfluenceAfterGain(player.influence,gainedInfluence)

  return Object.freeze({
    ...player,
    influence: resInfluence
  })
}

export function applyInfluenceGainToPlayers(
  entries: readonly PlayerGainedInfluence[]
): readonly Readonly<PlayerState>[] {
  const res = entries.map((entry =>
    applyInfluenceGainToPlayer(entry.player,entry.gainedInfluence)
  ))

  return Object.freeze(res)
}
