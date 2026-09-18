import type { PromotionTokenDefinition } from "./component-catalog.js";

export interface PreparedPromotionSupply {
  readonly tokenIdsByLevel: Readonly<Record<1 | 2 | 3 | 4 | 5, readonly string[]>>
}

/** Группирует рекламные жетоны по уровню в замороженном запасе. */
export function preparePromotionSupply(
  tokens: readonly PromotionTokenDefinition[],
): PreparedPromotionSupply {
  const res: Record<1 | 2 | 3 | 4 | 5, string[]> = { 1: [], 2: [],3: [],4: [],5: []}

  tokens.forEach(token => {
    res[token.level].push(token.id)
  })

  for (const array of Object.values(res)) {
    Object.freeze(array);
  }

  return Object.freeze({tokenIdsByLevel: Object.freeze(res)})
}
