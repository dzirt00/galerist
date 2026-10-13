import { getAvailableArtworkSales } from './available-artwork-sales.js'
import { freezeTransition, type GameEvent, type GameTransition } from './game-events.js'
import type { BoardOrders, Gallery, OrderRewardSide } from './player-boards.js'
import { returnAssistantToOffice } from './return-assistant-to-office.js'
import type { GameState, PlayerId } from './types.js'

export interface ArtworkSaleRequest {
  readonly playerId: PlayerId
  readonly orderId: string
  readonly artworkId: string
  readonly visitorId?: string | null
  readonly orderRewardSide?: OrderRewardSide
}

/** SALE-002/003: продажа и завершение заказа единым атомарным переходом. */
export function applyArtworkSaleToGameState(
  state: GameState,
  request: ArtworkSaleRequest,
): GameTransition<GameState> {
  if (!['regular_play', 'ending_current_round', 'final_round'].includes(state.phase)) throw new Error('Invalid phase')
  const player = state.players.find(item => item.id === request.playerId)
  const board = state.playerBoards.find(item => item.playerId === request.playerId)
  if (!player || !board) throw new Error('Invalid player')
  if (!getAvailableArtworkSales(board).some(pair => pair.orderId === request.orderId && pair.artworkId === request.artworkId)) {
    throw new Error('Artwork sale is unavailable')
  }
  const artwork = board.gallery.artworkSlots.find(item => item?.artworkId === request.artworkId)!
  const artist = state.artistSetup.slots.find(item => item.artistId === artwork.artistId)
  if (!artist || artist.availableSignatureTokenIds.includes(artwork.signatureTokenId)) throw new Error('Invalid signature location')
  if (!Number.isSafeInteger(artwork.saleValue) || artwork.saleValue < 0) throw new Error('Invalid saleValue')
  const coins = player.coins + artwork.saleValue
  const soldArtworkCount = player.soldArtworkCount + 1
  if (!Number.isSafeInteger(player.coins) || player.coins < 0 || !Number.isSafeInteger(coins)) throw new Error('Invalid coins')
  if (!Number.isSafeInteger(player.soldArtworkCount) || player.soldArtworkCount < 0 || !Number.isSafeInteger(soldArtworkCount)) throw new Error('Invalid soldArtworkCount')
  if (board.soldArtworkIds.includes(artwork.artworkId)) throw new Error('Artwork already sold')

  const visitor = board.gallery.visitors.find(item => item.id === request.visitorId)
  if (board.gallery.visitors.length > 0 && !visitor) throw new Error('Choose a gallery visitor')
  if (board.gallery.visitors.length === 0 && request.visitorId != null) throw new Error('Invalid visitor')
  const automaticSide = visitor?.type === 'B' ? 'coins' : visitor?.type === 'R' ? 'influence' : undefined
  if (request.orderRewardSide !== undefined && request.orderRewardSide !== 'coins' && request.orderRewardSide !== 'influence') {
    throw new Error('Invalid order reward side')
  }
  if (automaticSide && request.orderRewardSide !== undefined && request.orderRewardSide !== automaticSide) {
    throw new Error('Order reward side is determined by visitor')
  }
  const orderRewardSide = automaticSide ?? request.orderRewardSide
  if (!orderRewardSide) throw new Error('Choose an order reward side')
  const orderSlot = ([1, 2, 3] as const).find(slot => board.boardOrders[slot].orderId === request.orderId)!
  const order = board.boardOrders[orderSlot]
  const returned = returnAssistantToOffice(board, order.assistant)

  const remaining = board.gallery.artworkSlots.filter(item => item !== null && item.artworkId !== artwork.artworkId)
  const artworkSlots: Gallery['artworkSlots'] = [remaining[0] ?? null, remaining[1] ?? null, remaining[2] ?? null, remaining[3] ?? null]
  const next: GameState = structuredClone({
    ...state,
    players: state.players.map(item => item.id === player.id ? { ...item, coins, soldArtworkCount } : item),
    playerBoards: state.playerBoards.map(item => item.playerId === player.id ? {
      ...item,
      assistants: returned.assistants,
      boardOrders: { ...item.boardOrders, [orderSlot]: { ...order, orderStatus: 'completed', assistant: null } } as BoardOrders,
      orderRewardSides: { ...item.orderRewardSides, [orderSlot]: orderRewardSide },
      soldArtworkIds: [...item.soldArtworkIds, artwork.artworkId],
      gallery: { ...item.gallery, artworkSlots, visitors: item.gallery.visitors.filter(item => item.id !== visitor?.id) },
    } : item),
    artistSetup: { ...state.artistSetup, slots: state.artistSetup.slots.map(item => item.artistId === artwork.artistId
      ? { ...item, availableSignatureTokenIds: [...item.availableSignatureTokenIds, artwork.signatureTokenId] } : item) },
    plazaVisitors: visitor ? [...state.plazaVisitors, visitor] : state.plazaVisitors,
  })
  const events: GameEvent[] = [
    { type: 'ArtworkSold', playerId: player.id, orderId: request.orderId, artworkId: artwork.artworkId, artistId: artwork.artistId, saleValue: artwork.saleValue, soldArtworkCount },
    { type: 'CoinsReceived', playerId: player.id, coinsReceived: artwork.saleValue },
    { type: 'SignatureReturned', playerId: player.id, artistId: artwork.artistId, signatureTokenId: artwork.signatureTokenId },
  ]
  if (visitor) events.push({ type: 'VisitorMoved', playerId: player.id, visitorId: visitor.id, from: 'gallery', to: 'plaza' })
  if (artwork.isMasterpiece && !remaining.some(item => item!.isMasterpiece)) {
    events.push({ type: 'ExhibitionCapacityChanged', playerId: player.id, capacity: 3 })
  }
  events.push(
    { type: 'OrderCompleted', playerId: player.id, orderSlot, orderId: order.orderId! },
    ...returned.events,
    { type: 'OrderRewardSideSelected', playerId: player.id, orderSlot, orderId: order.orderId!, orderRewardSide },
  )
  return freezeTransition(next, events)
}
