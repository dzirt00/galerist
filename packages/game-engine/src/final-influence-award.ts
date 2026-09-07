import type { PlayerState } from "./types.js";
import { calculateFinalInfluenceCoins } from "./influence-scoring.js";

export function applyFinalInfluenceScoreToPlayer(player: Readonly<PlayerState>): Readonly<PlayerState> {
  const coins = calculateFinalInfluenceCoins(player.influence)

  return Object.freeze( {...player, coins: coins + player.coins })
}
