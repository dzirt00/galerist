const MAX_INFLUENCE = 35;

export function calculateInfluenceAfterGain(
  currentInfluence: number,
  gainedInfluence: number,
): number {
  // 1. Проверяем валидность типов и ограничений для currentInfluence
  if (
    typeof currentInfluence !== 'number' ||
    !Number.isInteger(currentInfluence) ||
    currentInfluence < 0 ||
    currentInfluence > MAX_INFLUENCE
  ) {
    throw new Error(`currentInfluence must be an integer from 0 to ${MAX_INFLUENCE}`);
  }

  // 2. Проверяем валидность типов и ограничений для gainedInfluence (включая safe integer)
  if (
    typeof gainedInfluence !== 'number' ||
    !Number.isSafeInteger(gainedInfluence) ||
    gainedInfluence < 0
  ) {
    throw new Error('gainedInfluence must be a non-negative safe integer');
  }

  // 3. Считаем сумму и ограничиваем её максимальным значением
  const totalInfluence = currentInfluence + gainedInfluence;

  return totalInfluence > MAX_INFLUENCE ? MAX_INFLUENCE : totalInfluence;
}
