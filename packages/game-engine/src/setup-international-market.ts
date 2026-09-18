import { type SetupRng } from "./setup-rng.js";
import { type ArtworkGenre, deepFreeze, type MarketColumn, setupComponentCatalog, type StartingLocationId  } from "./component-catalog.js";

export interface TableIds{
  readonly tokenId: string
  readonly column: MarketColumn
  readonly genre: ArtworkGenre
  readonly playerCounts: readonly number[]
  readonly cellId: string
}

export interface LocationTokens {
  readonly locationId: StartingLocationId
  readonly tokenId: string
}
export type ShuffleTokenIds = readonly string[]

export interface SetupInternationalMarket {
  readonly tableIds: readonly TableIds[],
  readonly locationTokens: readonly LocationTokens[],
  readonly remainingTokenIds: ShuffleTokenIds
}

export function prepareInternationalMarket(
  reputationTokenIds: readonly string[],
  playerCount: 2 | 3 | 4,
  rng: SetupRng,
): SetupInternationalMarket {
  if ( !( [ 2, 3, 4 ] as number[] ).includes( playerCount ) ) {
    throw new Error( 'Player count must be 2, 3, or 4' );
  }

  if ( new Set( [ ...reputationTokenIds ] ).size !== 20  || reputationTokenIds.length !== 20) {
    throw new Error( 'Reputation tokenId must 20' );
  }

  setupComponentCatalog.reputationTokenIds.forEach( ( tokenId: string ) => {
    if ( !reputationTokenIds.includes( tokenId ) ) {
      throw new Error( 'Exactly 20 tokens are required.' )
    }
  } )

  const sortTokensId = [ ...reputationTokenIds ].sort( ( a, b ) => a < b ? -1 : a > b ? 1 : 0 )
  let shuffleTokenIds = [...rng.shuffle('reputation',sortTokensId)]
  const tableIds = setupComponentCatalog.genreOrder
    .flatMap(genre => (playerCount === 2 ? [1,3] : [1,2,3])
      .map(column => {
        const table ={
          tokenId: `${shuffleTokenIds.shift()!}`,
          column: column as MarketColumn,
          genre: genre as ArtworkGenre,
          playerCounts: column === 2 ? [3, 4] : [2, 3, 4],
          cellId: `MARKET-REP-C${column}-${genre}`
        }

        return table
      })
    )

  const locationTokens = setupComponentCatalog.startingLocationOrder.map(loc => {
    return  {
      locationId: loc,
      tokenId: shuffleTokenIds.shift()!
    }

  })

  return  deepFreeze({
    tableIds: tableIds,
    locationTokens: locationTokens,
    remainingTokenIds: shuffleTokenIds
  })
}
