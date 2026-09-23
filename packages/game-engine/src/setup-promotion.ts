import type { PromotionTokenDefinition } from "./component-catalog.js";

export interface PreparedPromotionSupply {
  readonly tokenIdsByLevel: Readonly<Record<1 | 2 | 3 | 4 | 5, readonly string[]>>
}

/** Подготавливает запас рекламных жетонов по SETUP-007. */
export function preparePromotionSupply(
  tokens: readonly PromotionTokenDefinition[],
): PreparedPromotionSupply {

 const tokensSet = new Set(tokens.map((token) => token.id))

  if ( tokensSet.size !== 20 ) {
    throw new Error('Invalid tokens')
  }

  const tokenIdsByLevel: Record<1 | 2 | 3 | 4 | 5, string[]> = { 1: [], 2: [],3: [],4: [],5: []}

  tokens.forEach(token => {
    tokenIdsByLevel[token.level].push(token.id)
  })

  for (const tokenIds of Object.values(tokenIdsByLevel)) {
    if(tokenIds.length !== 4) throw new Error('Invalid tokens')
  }
  for (const array of Object.values(tokenIdsByLevel)) {
    Object.freeze(array);
  }

  return Object.freeze({tokenIdsByLevel: Object.freeze(tokenIdsByLevel)})
}
