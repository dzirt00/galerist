import type { PlayerState, IntermediateVisitorCounts } from "./types.js";
import { calculateIntermediateIncome } from "./intermediate-income.js";
import { calculateInfluenceAfterGain } from "./influence-gain.js";

export interface IntermediateIncomeAwardInput {
  readonly player: Readonly<PlayerState>
  readonly visitors: IntermediateVisitorCounts
}

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

export function applyIntermediateIncomeToPlayers(
  entries: readonly IntermediateIncomeAwardInput[],
): readonly Readonly<PlayerState>[] {
  const res = entries.map(entry =>
    applyIntermediateIncomeToPlayer(entry.player, entry.visitors)
  )

  return Object.freeze(res)
}
