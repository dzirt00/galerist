import { calculateArtworkSaleValue } from './artwork-sale-value.js'
import { freezeTransition, type GameEvent, type GameTransition } from './game-events.js'
import type { GameState, PlayerId } from './types.js'
import type { Gallery } from './player-boards.js'

/** Общий переход цен и суперзвезды после расчёта новой известности. */
export function applyArtistFameEffects(
  state: Readonly<GameState>, playerId: PlayerId, artistId: string, requestedFame: number,
): GameTransition<GameState> {
  const artist = state.artistMarket.slots.find(slot => slot.artistId === artistId)
  if (!artist?.isOpen || artist.fame === null) throw new Error('Fame requires an open artist')
  const fame = Math.min(19, requestedFame)
  const saleValue = calculateArtworkSaleValue(artistId, fame)
  // Статус сохраняется отдельно от числа известности, чтобы повторное достижение предела не выдавало пять монет.
  const becameSuperstar = !artist.isSuperstar && fame === 19
  const masterpieceEvents: GameEvent[] = []
  let saleValuesChanged = false
  const playerBoards = state.playerBoards.map(board => {
    /** Обновляет цену и статус только работ выбранного художника, сохраняя пустые и чужие позиции. */
    const updateArtwork = (artwork: Gallery['artworkSlots'][number]): Gallery['artworkSlots'][number] => {
      if (!artwork || artwork.artistId !== artistId) return artwork
      if (artwork.saleValue !== saleValue) saleValuesChanged = true
      if (becameSuperstar && !artwork.isMasterpiece) {
        masterpieceEvents.push({ type: 'ArtworkBecameMasterpiece', playerId: board.playerId, artworkId: artwork.artworkId })
      }
      return { ...artwork, saleValue, isMasterpiece: artwork.isMasterpiece || becameSuperstar }
    }
    const slots = board.gallery.artworkSlots
    return { ...board, gallery: { ...board.gallery, artworkSlots: [
      updateArtwork(slots[0]), updateArtwork(slots[1]), updateArtwork(slots[2]), updateArtwork(slots[3]),
    ] as Gallery['artworkSlots'] } }
  })
  const events: GameEvent[] = []
  if (saleValuesChanged) events.push({ type: 'ArtworkSaleValuesChanged', artistId, saleValue })
  if (becameSuperstar) events.push({ type: 'ArtistBecameSuperstar', artistId },
    { type: 'CoinsReceived', playerId, coinsReceived: 5 })
  events.push(...masterpieceEvents)
  return freezeTransition({
    ...state, playerBoards,
    players: state.players.map(player => becameSuperstar && player.id === playerId
      ? { ...player, coins: player.coins + 5 } : player),
    artistMarket: { ...state.artistMarket, slots: state.artistMarket.slots.map(slot => slot.artistId === artistId
      ? { ...slot, fame, isSuperstar: slot.isSuperstar || becameSuperstar } : slot) },
  }, events)
}
