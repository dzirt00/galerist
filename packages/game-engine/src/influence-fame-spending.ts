const MAX_INFLUENCE = 35

const FAME_CHECKPOINTS: readonly number[] = Object.freeze([
  0, 5, 10, 15, 20, 25, 30, 35,
])

const FAME_CHECKPOINTS_SET = new Set(FAME_CHECKPOINTS)
const INVALID_INFLUENCE_SPEND_MESSAGE = 'Invalid influence spend'

export function calculateAdditionalFameFromInfluenceSpend(
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
    || !FAME_CHECKPOINTS_SET.has(targetInfluence)
  ) {
    throw new RangeError(INVALID_INFLUENCE_SPEND_MESSAGE)
  }
  return FAME_CHECKPOINTS.filter(
    (checkpoint) => checkpoint < currentInfluence && checkpoint >= targetInfluence,
  ).length
}
