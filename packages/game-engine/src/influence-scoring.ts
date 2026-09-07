const FINAL_INFLUENCE_COINS: readonly number[] = Object.freeze([
  0,
  1, 1, 1,
  2, 2, 2, 2,
  3, 3, 3, 3,
  4, 4, 4,
  5, 5, 5,
  6, 6,
  7, 7,
  8, 8,
  9, 9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  20,
])

const INVALID_INFLUENCE_MESSAGE = 'Influence must be an integer from 0 to 35'

export function calculateFinalInfluenceCoins(influence: number): number {
  if (
    typeof influence !== 'number'
    || !Number.isInteger(influence)
    || influence < 0
    || influence > 35
  ) {
    throw new RangeError(INVALID_INFLUENCE_MESSAGE)
  }

  return FINAL_INFLUENCE_COINS[influence]!
}
