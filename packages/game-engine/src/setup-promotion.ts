import type { PromotionTokenDefinition } from "./component-catalog.js";

export interface PreparedPromotionSupply {
  readonly tokenIdsByLevel: Readonly<Record<1 | 2 | 3 | 4 | 5, readonly string[]>>
}

/** Группирует рекламные жетоны по уровню в замороженном запасе. */
export function preparePromotionSupply(
  tokens: readonly PromotionTokenDefinition[],
): PreparedPromotionSupply {

 const tokensSet = new Set(tokens.map((token) => token.id))

  if ( tokensSet.size !== 20 ) {
    throw new Error('Invalid tokens')
  }

  const res: Record<1 | 2 | 3 | 4 | 5, string[]> = { 1: [], 2: [],3: [],4: [],5: []}

  tokens.forEach(token => {
    res[token.level].push(token.id)
  })

  for(let val of Object.values(res)) {
    if(val.length !== 4) throw new Error('Invalid tokens')
  }
  for (const array of Object.values(res)) {
    Object.freeze(array);
  }

  return Object.freeze({tokenIdsByLevel: Object.freeze(res)})
}
