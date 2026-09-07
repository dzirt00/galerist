import type { PlayerState, IntermediateVisitorCounts } from "./types.js";
import { calculateIntermediateIncome } from "./intermediate-income.js";
import { calculateInfluenceAfterGain } from "./influence-gain.js";

export function applyIntermediateIncomeToPlayer(
  player: Readonly<PlayerState>,
  visitors: IntermediateVisitorCounts,
): Readonly<PlayerState> {
  const income =  calculateIntermediateIncome(visitors)
  const influence = calculateInfluenceAfterGain(player.influence, income.influence)

  return Object.freeze({
    ...player,
    coins: income.coins + player.coins,
    influence: influence,
  })
}
