/** Возвращает индекс первого игрока по согласованному seed-контракту. */
export function getFirstPlayerIndex(seed: number, playerCount: number): number {
  return ((seed % playerCount) + playerCount) % playerCount
}
