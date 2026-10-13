import { deepFreeze, setupComponentCatalog } from './component-catalog.js'
import type { PlayerBoard } from './player-boards.js'

/** SALE-001: пары заказа и работы в порядке клеток заказа и галереи. */
export function getAvailableArtworkSales(
  playerBoard: PlayerBoard,
): readonly { readonly orderId: string; readonly artworkId: string }[] {
  const availableArtworkSales: { orderId: string; artworkId: string }[] = []
  for (const order of Object.values(playerBoard.boardOrders)) {
    if (order.orderId === null || order.orderStatus !== 'unfulfilled') continue
    const definition = setupComponentCatalog.orders.find(item => item.id === order.orderId)
    if (!definition) throw new Error('Unknown order')
    for (const artwork of playerBoard.gallery.artworkSlots) {
      if (artwork === null) continue
      const artworkDefinition = setupComponentCatalog.artworks.find(item => item.id === artwork.artworkId)
      if (!artworkDefinition) throw new Error('Unknown artwork')
      if (artworkDefinition.genre === definition.genre) {
        availableArtworkSales.push({ orderId: order.orderId, artworkId: artwork.artworkId })
      }
    }
  }
  return deepFreeze(availableArtworkSales)
}
