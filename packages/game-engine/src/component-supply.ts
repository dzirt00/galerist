import { setupComponentCatalog } from './component-catalog.js'
import type { GameState } from './types.js'

/**
 * Проверяет ограниченность физических компонентов при восстановлении снимка (CORE-002).
 * Отклоняет превышение пулов и одновременное размещение одного экземпляра в разных областях.
 * Подготовительные копии запасов не считаются самостоятельными физическими областями.
 */
export function validateComponentSupply(state: GameState): void {
  // Берём только текущие размещения; remainingVisitors и remainingVisitorBag дублируют подготовительные данные.
  const visitors = [...state.visitorBag.visitors, ...state.plazaVisitors,
    ...state.vestibuleVisitors.map(item => item.vestibuleVisitor),
    ...state.playerBoards.flatMap(board => board.gallery.visitors),
    ...state.artistSetup.slots.flatMap(slot => slot.collector ? [slot.collector] : []),
    ...Object.values(state.artworkMarket.openArtworksByGenre).flatMap(slot => slot?.visitors ?? [])]
  if (new Set(visitors.map(item => item.id)).size !== visitors.length) throw new Error('Visitor component has multiple locations')
  for (const color of setupComponentCatalog.ticketColors) {
    // Билет может находиться в кассе, общем сбросе или у игрока; все эти области расходуют один пул цвета.
    const total = state.ticketOffice.ticketsByColor[color] + state.ticketDiscard[color]
      + state.players.reduce((sum, player) => sum + player.ticketsByColor[color], 0)
    if (total > setupComponentCatalog.ticketsPerColor[state.config.playerCount]) throw new Error('Ticket component supply exceeded')
    if (visitors.filter(item => item.type === color).length > setupComponentCatalog.visitorPools[state.config.playerCount][color]) {
      throw new Error('Visitor component supply exceeded')
    }
  }
  const artworks = [...Object.values(state.artworkMarket.openArtworksByGenre).flatMap(slot => slot ? [slot.artwork.id] : []),
    ...Object.values(state.artworkMarket.remainingArtworksByGenre).flatMap(items => items.map(item => item.id)),
    ...state.playerBoards.flatMap(board => [...board.soldArtworkIds, ...board.gallery.artworkSlots.flatMap(item => item ? [item.artworkId] : [])]),
    ...state.masterpieceAuction.artworks.map(item => item.id)]
  // auctionAwards хранит владельца работы с мольберта, а не второй экземпляр этой работы.
  // deferredArtworksByGenre также содержит подготовительные ссылки на те же аукционные работы.
  if (new Set(artworks).size !== artworks.length || artworks.some(id => !setupComponentCatalog.artworks.some(item => item.id === id))) {
    throw new Error('Invalid artwork component supply')
  }
  // ID помощника уникален внутри набора одного игрока; разные игроки используют одинаковые локальные ID.
  for (const board of state.playerBoards) {
    const assistants = [...board.assistants.assistantOfficeIds, ...board.assistants.assistantHireQueueIds,
      ...board.locationAssistants.map(item => item.assistantId),
      ...Object.values(board.boardOrders).flatMap(order => order.assistant ? [order.assistant] : []),
      ...state.internationalMarket.marketAssistants.filter(item => item.playerId === board.playerId).map(item => item.assistantId),
      ...(board.ejectedAssistant ? [board.ejectedAssistant.assistantId] : [])]
    if (assistants.length > 10 || new Set(assistants).size !== assistants.length) throw new Error('Assistant component supply exceeded')
  }
}
