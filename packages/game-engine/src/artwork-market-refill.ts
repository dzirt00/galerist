import type { PreparedVisitorBag } from "./setup-visitors.js";
import { type ArtworkDefinition, deepFreeze, type VisitorInstance } from "./component-catalog.js";
import type { OpenArtworkSlot } from "./setup-artworks.js";

export interface ArtworkMarketRefillResult {
  readonly openArtwork: OpenArtworkSlot | null
  readonly remainingArtworks: readonly ArtworkDefinition[]
  readonly remainingVisitorBag: PreparedVisitorBag
}

/**
 * Пополняет рынок одного жанра после покупки работы по ARTWORK-006.
 *
 * Первая работа оставшейся стопки становится открытой и получает с начала
 * подготовленного мешочка не больше посетителей, чем напечатано на работе.
 * Если стопка пуста, рынок остаётся без открытой работы, а мешочек сохраняется.
 * Функция не изменяет и не замораживает входы; возвращаемый снимок состоит из
 * независимых копий и глубоко заморожен.
 */
export function refillArtworkMarket(
  remainingArtworks: readonly ArtworkDefinition[],
  visitorBag: PreparedVisitorBag,
): ArtworkMarketRefillResult {

  if ( remainingArtworks.length === 0 ) {
    return deepFreeze( {
      openArtwork: null,
      remainingArtworks: [],
      remainingVisitorBag: {
        visitors: visitorBag.visitors.map( visitor => ( { ...visitor } ) ),
      },
    } )
  }

  const copyRemainingArtworks: ArtworkDefinition[] = remainingArtworks.map( item => ( { ...item } ) )
  const visitorCopies: VisitorInstance[] = visitorBag.visitors.map( item => ( { ...item } ) )
  const [ nextArtwork ] = copyRemainingArtworks.splice( 0, 1 )

  if ( nextArtwork === undefined ) {
    throw new Error( 'Invalid artwork' )
  }

  const visitorCount = Math.min( nextArtwork.visitorCount, visitorBag.visitors.length )
  const visitors = visitorCopies.splice( 0, visitorCount )

  const openArtwork: OpenArtworkSlot = {
    artwork: nextArtwork,
    visitors: visitors
  }

  return deepFreeze( {
    openArtwork,
    remainingArtworks: copyRemainingArtworks,
    remainingVisitorBag: {
      visitors: visitorCopies,
    },
  } )

}
