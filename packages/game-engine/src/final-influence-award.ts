import type { PlayerState } from "./types.js";
import { calculateFinalInfluenceCoins } from "./influence-scoring.js";

export function applyFinalInfluenceScoreToPlayer(player: Readonly<PlayerState>): Readonly<PlayerState> {
  const coins = calculateFinalInfluenceCoins(player.influence)

  return Object.freeze( {...player, coins: coins + player.coins })
}

export function applyFinalInfluenceScoreToPlayers(players: readonly Readonly<PlayerState>[]): readonly Readonly<PlayerState>[] {
  const score: PlayerState[] = []
  players.forEach(player =>  score.push(applyFinalInfluenceScoreToPlayer(player)))

  return  Object.freeze([...score])
}
