import {type SetupRng} from "./setup-rng.js";
import {
  type ArtworkGenre,
  deepFreeze,
  type MarketColumn,
  setupComponentCatalog,
  type StartingLocationId
} from "./component-catalog.js";

export interface MarketReputationCell {
  readonly tokenId: string
  readonly column: MarketColumn
  readonly genre: ArtworkGenre
  readonly playerCounts: readonly number[]
  readonly cellId: string
}

export interface LocationReputationToken {
  readonly locationId: StartingLocationId
  readonly tokenId: string
}

export type ReputationTokenIds = readonly string[]

export interface SetupInternationalMarket {
  readonly marketReputationCells: readonly MarketReputationCell[]
  readonly locationReputationTokens: readonly LocationReputationToken[]
  readonly remainingReputationTokenIds: ReputationTokenIds
}

export function prepareInternationalMarket(
  reputationTokenIds: readonly string[],
  playerCount: 2 | 3 | 4,
  rng: SetupRng,
): SetupInternationalMarket {
  if (!([2, 3, 4] as number[]).includes(playerCount)) {
    throw new Error('Player count must be 2, 3, or 4');
  }

  if (new Set([...reputationTokenIds]).size !== 20 || reputationTokenIds.length !== 20) {
    throw new Error('Reputation tokenId must 20');
  }

  setupComponentCatalog.reputationTokenIds.forEach((tokenId: string) => {
    if (!reputationTokenIds.includes(tokenId)) {
      throw new Error('Exactly 20 tokens are required.')
    }
  })

  const sortedReputationTokenIds = [...reputationTokenIds].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
  const shuffledReputationTokenIds = [...rng.shuffle('reputation', sortedReputationTokenIds)]
  const marketReputationCells = setupComponentCatalog.genreOrder
    .flatMap(genre => (playerCount === 2 ? [1, 3] : [1, 2, 3])
      .map(column => {
        return {
          tokenId: shuffledReputationTokenIds.shift()!,
          column: column as MarketColumn,
          genre: genre as ArtworkGenre,
          playerCounts: column === 2 ? [3, 4] : [2, 3, 4],
          cellId: `MARKET-REP-C${column}-${genre}`
        }
      })
    )

  const locationReputationTokens = setupComponentCatalog.startingLocationOrder.map(locationId => {
    return {
      locationId,
      tokenId: shuffledReputationTokenIds.shift()!
    }

  })

  return deepFreeze({
    marketReputationCells,
    locationReputationTokens,
    remainingReputationTokenIds: shuffledReputationTokenIds,
  })
}
