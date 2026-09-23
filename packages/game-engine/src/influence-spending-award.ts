import type { PlayerState } from "./types.js";
import { calculateCoinsFromInfluenceSpend } from "./influence-spending.js";

/** Оплачивает стоимость монетами и доходом от расхода влияния по INFLUENCE-002. */
export function spendInfluenceForImmediatePayment(
  player: Readonly<PlayerState>,
  cost: number,
  targetInfluence: number
): Readonly<PlayerState> {

  if (
    typeof cost !== 'number'
    || !Number.isSafeInteger(cost)
    || cost < 1
  ) {
    throw new RangeError(`cost invalid`)
  }

  const coins = calculateCoinsFromInfluenceSpend(player.influence,targetInfluence)
  const allSum = player.coins + coins - cost

  if( allSum < 0 ) throw new RangeError(`Coins < 0`)

  return Object.freeze({
    ...player,
    influence: targetInfluence,
    coins: allSum,
  })
}
