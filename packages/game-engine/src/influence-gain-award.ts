import type { PlayerState } from "./types.js";
import { calculateInfluenceAfterGain } from "./influence-gain.js";

export interface PlayerGainedInfluence {
  readonly player:  Readonly<PlayerState>,
  readonly gainedInfluence: number
}
/** Добавляет влияние одному игроку с учётом максимума шкалы. */
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

/** Применяет прирост влияния ко всем записям в исходном порядке. */
export function applyInfluenceGainToPlayers(
  entries: readonly PlayerGainedInfluence[]
): readonly Readonly<PlayerState>[] {
  const res = entries.map((entry =>
    applyInfluenceGainToPlayer(entry.player,entry.gainedInfluence)
  ))

  return Object.freeze(res)
}
