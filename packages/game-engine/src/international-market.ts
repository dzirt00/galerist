import { setupComponentCatalog, type MarketColumn } from './component-catalog.js'
import { freezeTransition, type GameEvent, type GameTransition } from './game-events.js'
import { applyInfluenceGainToPlayer } from './influence-gain-award.js'
import { spendInfluenceForImmediatePayment } from './influence-spending-award.js'
import { calculateCoinsFromInfluenceSpend } from './influence-spending.js'
import { applyOrderRewardEffect, type OrderRewardChoices } from './order-reward-effect.js'
import type { GameState, PlayerId } from './types.js'
import { validateInternationalMarketState } from './international-market-validation.js'
import { evaluateEndConditions } from './end-conditions.js'

export interface MarketActionRequest {
  readonly playerId: PlayerId
  readonly cellId: string
  readonly assistantId: string
  readonly assistantSource: 'office' | 'location' | 'ejected'
  readonly choices?: Readonly<OrderRewardChoices>
}
export interface ClaimReputationTokenRequest extends MarketActionRequest {
  readonly boardCellId: string
  readonly visitorId: string
}
export interface PlaceAuctionBidRequest extends MarketActionRequest {
  readonly targetInfluence?: number
}

/** Определяет доступные колонки по посетителям только собственного вестибюля (MARKET-001). */
export function determineAvailableMarketColumns(state: Readonly<GameState>, playerId: PlayerId): readonly MarketColumn[] {
  if (!state.players.some(player => player.id === playerId)) throw new Error('Invalid market player')
  const visitors = state.vestibuleVisitors.filter(item => item.playerId === playerId).map(item => item.vestibuleVisitor.type)
  const columns: MarketColumn[] = []
  if (visitors.length > 0) columns.push(1)
  if (state.config.playerCount !== 2 && visitors.includes('B') && visitors.includes('R')) columns.push(2)
  if (visitors.includes('W') && (visitors.includes('B') || visitors.includes('R'))) columns.push(3)
  return Object.freeze(columns)
}

/** Проверяет фазу, доступ к колонке, свободную ячейку и принадлежность выбранного помощника его источнику. */
function validateAction(state: Readonly<GameState>, request: Readonly<MarketActionRequest>, column: MarketColumn): void {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid market request')
  if (!['regular_play', 'ending_current_round', 'final_round'].includes(state.phase)) throw new Error('Market requires a playing phase')
  validateInternationalMarketState(state)
  if (!determineAvailableMarketColumns(state, request.playerId).includes(column)) throw new Error('Market column unavailable')
  if (state.internationalMarket.marketAssistants.some(item => item.cellId === request.cellId)) throw new Error('Market cell occupied')
  const board = state.playerBoards.find(item => item.playerId === request.playerId)
  if (!board || typeof request.assistantId !== 'string' || !request.assistantId) throw new Error('Invalid market assistant')
  switch (request.assistantSource) {
    case 'office':
      if (!board.assistants.assistantOfficeIds.includes(request.assistantId)) throw new Error('Assistant unavailable in office')
      break
    case 'location':
      if (!board.locationAssistants.some(item => item.assistantId === request.assistantId)) throw new Error('Assistant unavailable at location')
      break
    case 'ejected':
      if (state.phase === 'final_round' || board.ejectedAssistant?.assistantId !== request.assistantId
        || board.ejectedAssistant.displacedByPlayerId === request.playerId
        || !state.players.some(player => player.id === board.ejectedAssistant?.displacedByPlayerId)) {
        throw new Error('Selected ejected assistant has no ejection action')
      }
      break
    default: throw new Error('Invalid assistant source')
  }
}

/** Переносит помощника из офиса, локации или выдворения на рынок, сохраняя ставку либо null для репутации. */
function placeAssistant(state: GameState, request: Readonly<MarketActionRequest>, bid: 1 | 3 | 6 | null): GameState {
  return { ...state,
    playerBoards: state.playerBoards.map(board => {
      if (board.playerId !== request.playerId) return board
      const assistantOfficeIds = request.assistantSource === 'office'
        ? board.assistants.assistantOfficeIds.filter(id => id !== request.assistantId) : board.assistants.assistantOfficeIds
      return { ...board, assistants: { ...board.assistants, assistantOfficeIds, office: assistantOfficeIds.length },
        locationAssistants: request.assistantSource === 'location'
          ? board.locationAssistants.filter(item => item.assistantId !== request.assistantId) : board.locationAssistants,
        ejectedAssistant: request.assistantSource === 'ejected' ? null : board.ejectedAssistant }
    }),
    internationalMarket: { ...state.internationalMarket, marketAssistants: [...state.internationalMarket.marketAssistants,
      { cellId: request.cellId, playerId: request.playerId, assistantId: request.assistantId, bid }] },
  }
}

/** Начисляет влияние колонки до оплаты действия, чтобы его можно было сразу использовать в платеже. */
function receiveColumnInfluence(state: GameState, playerId: PlayerId, column: MarketColumn): GameTransition<GameState> {
  const player = state.players.find(item => item.id === playerId)!
  const updated = applyInfluenceGainToPlayer(player, 4 - column)
  return { state: { ...state, players: state.players.map(item => item.id === playerId ? updated : item) },
    events: [{ type: 'InfluenceReceived', playerId, gainedInfluence: updated.influence - player.influence }] }
}

/**
 * Атомарно получает репутацию по MARKET-002/003: влияние колонки, жетон,
 * награда выбранной клетки планшета, возврат посетителя и размещение помощника.
 */
export function claimReputationToken(state: Readonly<GameState>, request: Readonly<ClaimReputationTokenRequest>): GameTransition<GameState> {
  if (!request || typeof request !== 'object') throw new Error('Invalid reputation request')
  const cell = state.internationalMarket.marketReputationCells.find(item => item.cellId === request.cellId)
  if (!cell) throw new Error('Reputation cell unavailable')
  validateAction(state, request, cell.column)
  const board = state.playerBoards.find(item => item.playerId === request.playerId)!
  if (Object.keys(board.boardReputationTokens).length > 0) throw new Error('Player already owns a market reputation token')
  const artworkIds = [...board.soldArtworkIds, ...board.gallery.artworkSlots.flatMap(item => item ? [item.artworkId] : [])]
  if (!artworkIds.some(id => setupComponentCatalog.artworks.some(artwork => artwork.id === id && artwork.genre === cell.genre))) {
    throw new Error('Reputation genre requires acquired artwork')
  }
  const boardCell = setupComponentCatalog.boardReputationCells.find(item => item.id === request.boardCellId)
  if (!boardCell || board.boardReputationTokens[boardCell.id] !== undefined) throw new Error('Board reputation cell unavailable')
  const visitor = state.vestibuleVisitors.find(item => item.playerId === request.playerId && item.vestibuleVisitor.id === request.visitorId)
  if (!visitor) throw new Error('Selected visitor must be in player vestibule')
  let next: GameState = structuredClone(state)
  const influence = receiveColumnInfluence(next, request.playerId, cell.column)
  next = { ...influence.state,
    internationalMarket: { ...next.internationalMarket,
      marketReputationCells: next.internationalMarket.marketReputationCells.filter(item => item.cellId !== cell.cellId) },
    playerBoards: next.playerBoards.map(item => item.playerId === request.playerId
      ? { ...item, boardReputationTokens: { ...item.boardReputationTokens, [boardCell.id]: cell.tokenId } } : item),
  }
  const events: GameEvent[] = [...influence.events,
    { type: 'ReputationTokenClaimed', playerId: request.playerId, tokenId: cell.tokenId, cellId: cell.cellId, boardCellId: boardCell.id },
    { type: 'BoardRewardClaimed', playerId: request.playerId, boardCellId: boardCell.id, reward: boardCell.reward },
  ]
  const reward = applyOrderRewardEffect(next, request.playerId, boardCell.reward, request.choices ?? {})
  next = { ...reward.state,
    vestibuleVisitors: reward.state.vestibuleVisitors.filter(item => item.playerId !== request.playerId || item.vestibuleVisitor.id !== request.visitorId),
    plazaVisitors: [...reward.state.plazaVisitors, visitor.vestibuleVisitor],
  }
  events.push(...reward.events, { type: 'VisitorMoved', visitorId: request.visitorId, from: 'vestibule', to: 'plaza', playerId: request.playerId, fromPlayerId: request.playerId })
  next = placeAssistant(next, request, null)
  events.push({ type: 'AssistantPlacedOnMarket', playerId: request.playerId, cellId: cell.cellId, assistantId: request.assistantId })
  return evaluateEndConditions(state, next, events)
}

/** Атомарно применяет MARKET-004/005: влияние колонки → оплата → помощник → награда аукционной ячейки. */
export function placeAuctionBid(state: Readonly<GameState>, request: Readonly<PlaceAuctionBidRequest>): GameTransition<GameState> {
  if (!request || typeof request !== 'object') throw new Error('Invalid auction request')
  const cell = setupComponentCatalog.marketBidCells.find(item => item.id === request.cellId)
  if (!cell) throw new Error('Invalid auction cell')
  validateAction(state, request, cell.column)
  let next: GameState = structuredClone(state)
  const influence = receiveColumnInfluence(next, request.playerId, cell.column)
  next = influence.state
  const player = next.players.find(item => item.id === request.playerId)!
  const events: GameEvent[] = [...influence.events]
  let updated = player
  if (request.targetInfluence !== undefined) {
    const coinsReceived = calculateCoinsFromInfluenceSpend(player.influence, request.targetInfluence)
    updated = spendInfluenceForImmediatePayment(player, cell.bid, request.targetInfluence)
    events.push({ type: 'InfluenceSpent', playerId: player.id, spentInfluence: player.influence - updated.influence },
      { type: 'CoinsReceived', playerId: player.id, coinsReceived })
  } else {
    if (player.coins < cell.bid) throw new Error('Insufficient coins for auction bid')
    updated = { ...player, coins: player.coins - cell.bid }
  }
  events.push({ type: 'CoinsSpent', playerId: player.id, paid: cell.bid },
    { type: 'AuctionBidPlaced', playerId: player.id, cellId: cell.id, bid: cell.bid },
    { type: 'AssistantPlacedOnMarket', playerId: player.id, cellId: cell.id, assistantId: request.assistantId })
  next = placeAssistant({ ...next, players: next.players.map(item => item.id === player.id ? updated : item) }, request, cell.bid)
  const reward = applyOrderRewardEffect(next, player.id, cell.reward, request.choices ?? {})
  return freezeTransition(reward.state, [...events, ...reward.events])
}
