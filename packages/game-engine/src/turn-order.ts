/** Возвращает индекс первого игрока по ADR-001 и SETUP-011. */
export function getFirstPlayerIndex(seed: number, playerCount: number): number {
  return ((seed % playerCount) + playerCount) % playerCount
}
