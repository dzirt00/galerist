import type { PlayerState } from "./types.js";
import { calculateInfluenceAfterGain } from "./influence-gain.js";

export interface PlayerGainedInfluence {
  readonly player:  Readonly<PlayerState>,
  readonly gainedInfluence: number
}
/** Добавляет влияние одному игроку с верхней границей по INFLUENCE-001. */
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

/** Применяет INFLUENCE-001 ко всем игрокам в исходном порядке. */
export function applyInfluenceGainToPlayers(
  entries: readonly PlayerGainedInfluence[]
): readonly Readonly<PlayerState>[] {
  const updatedPlayers = entries.map((entry =>
    applyInfluenceGainToPlayer(entry.player,entry.gainedInfluence)
  ))

  return Object.freeze(updatedPlayers)
}
