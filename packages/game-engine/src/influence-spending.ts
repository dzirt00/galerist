const MAX_INFLUENCE = 35

const MONEY_CHECKPOINTS: readonly number[] = Object.freeze([
  0,
  1,
  4,
  8,
  12,
  15,
  18,
  20,
  22,
  24,
  26,
  27,
  28,
  29,
  30,
  31,
  32,
  33,
  34,
  35,
])

const MONEY_CHECKPOINT_SET = new Set(MONEY_CHECKPOINTS)
const INVALID_INFLUENCE_SPEND_MESSAGE = 'Invalid influence spend'

export function calculateCoinsFromInfluenceSpend(
  currentInfluence: number,
  targetInfluence: number,
): number {
  if (
    typeof currentInfluence !== 'number'
    || !Number.isInteger(currentInfluence)
    || currentInfluence < 0
    || currentInfluence > MAX_INFLUENCE
    || typeof targetInfluence !== 'number'
    || !Number.isInteger(targetInfluence)
    || targetInfluence < 0
    || targetInfluence > MAX_INFLUENCE
    || targetInfluence >= currentInfluence
    || !MONEY_CHECKPOINT_SET.has(targetInfluence)
  ) {
    throw new RangeError(INVALID_INFLUENCE_SPEND_MESSAGE)
  }

  return MONEY_CHECKPOINTS.filter(
    (checkpoint) => checkpoint < currentInfluence && checkpoint >= targetInfluence,
  ).length
}
