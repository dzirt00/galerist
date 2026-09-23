import type { IntermediateIncome, IntermediateVisitorCounts } from './types.js'

const INVALID_VISITOR_COUNT_MESSAGE = 'Invalid visitor count'

/** Проверяет, что значение является неотрицательным целым числом. */
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 0
}

/** Проверяет наличие корректных счётчиков всех типов посетителей. */
function isIntermediateVisitorCounts(
  value: unknown,
): value is IntermediateVisitorCounts {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const visitors = value as Record<string, unknown>

  return isNonNegativeInteger(visitors.investors)
    && isNonNegativeInteger(visitors.celebrities)
    && isNonNegativeInteger(visitors.collectors)
}

/** Рассчитывает доход от посетителей галереи по MID-001 без изменения входа. */
export function calculateIntermediateIncome(
  visitors: IntermediateVisitorCounts,
): Readonly<IntermediateIncome> {
  if (!isIntermediateVisitorCounts(visitors)) {
    throw new Error(INVALID_VISITOR_COUNT_MESSAGE)
  }

  return Object.freeze({
    coins: visitors.investors * 2 + visitors.collectors,
    influence: visitors.celebrities * 2 + visitors.collectors,
  })
}
