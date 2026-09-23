const MAX_INFLUENCE = 35;

/** Рассчитывает получение влияния с верхней границей по INFLUENCE-001. */
export function calculateInfluenceAfterGain(
  currentInfluence: number,
  gainedInfluence: number,
): number {
  if (
    typeof currentInfluence !== 'number' ||
    !Number.isInteger(currentInfluence) ||
    currentInfluence < 0 ||
    currentInfluence > MAX_INFLUENCE
  ) {
    throw new Error(`currentInfluence must be an integer from 0 to ${MAX_INFLUENCE}`);
  }

  if (
    typeof gainedInfluence !== 'number' ||
    !Number.isSafeInteger(gainedInfluence) ||
    gainedInfluence < 0
  ) {
    throw new Error('gainedInfluence must be a non-negative safe integer');
  }

  const totalInfluence = currentInfluence + gainedInfluence;

  // Избыток сгорает: шкала влияния не хранит отложенное превышение.
  return totalInfluence > MAX_INFLUENCE ? MAX_INFLUENCE : totalInfluence;
}
