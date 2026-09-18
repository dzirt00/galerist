import { type ArtworkDefinition, setupComponentCatalog } from './component-catalog.js'
import type { SetupRng } from './setup-rng.js'

export interface PreparedMasterpieceAuction {
  readonly artworks: readonly ArtworkDefinition[]
}

/** Проверяет отложенные работы и выбирает для аукциона число работ по составу игроков. */
export function prepareMasterpieceAuction(
  artworks: readonly ArtworkDefinition[],
  playerCount: 2 | 3 | 4,
  rng: SetupRng,
): PreparedMasterpieceAuction {

  if (playerCount !== 2 && playerCount !== 3 && playerCount !== 4) {
    throw new Error('Player count must be 2, 3, or 4')
  }
  if (!Array.isArray(artworks) || artworks.length !== 4) {
    throw new Error('Exactly four deferred artworks are required')
  }

  for (const artwork of artworks) {
    if (
      artwork === null || typeof artwork !== 'object'
      || typeof artwork.id !== 'string' || !/^[\x00-\x7F]+$/.test(artwork.id)
      || !setupComponentCatalog.genreOrder.includes(artwork.genre)
      || !(artwork.fameGain === 'X'
        || (Number.isInteger(artwork.fameGain) && artwork.fameGain >= 0))
      || typeof artwork.ticketReward !== 'string'
      || !Number.isInteger(artwork.visitorCount) || artwork.visitorCount < 0
    ) {
      throw new Error('Invalid deferred artwork')
    }
  }

  if (new Set(artworks.map(artwork => artwork.id)).size !== 4) {
    throw new Error('Deferred artworks must have unique IDs')
  }
  if (new Set(artworks.map(artwork => artwork.genre)).size !== 4) {
    throw new Error('Deferred artworks must contain exactly one artwork per genre')
  }

  const sortedArtworks = [...artworks].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  )
  const shuffled = rng.shuffle('auction-artworks', sortedArtworks)
  const selected = shuffled.slice(0, playerCount - 1).map(artwork => Object.freeze({
    id: artwork.id,
    genre: artwork.genre,
    fameGain: artwork.fameGain,
    ticketReward: artwork.ticketReward,
    visitorCount: artwork.visitorCount,
  }))

  return Object.freeze({
    artworks: Object.freeze(selected),
  })
}
