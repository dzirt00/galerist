import { setupComponentCatalog } from './component-catalog.js'
import type { GameState } from './types.js'

/** Validates saved market placements and unique component ownership. */
export function validateInternationalMarketState(state: Readonly<GameState>): void {
  const fail = (): never => { throw new Error('Invalid game state: international market') }
  const market = state.internationalMarket
  if (!Array.isArray(market.marketAssistants) || !Array.isArray(market.marketReputationCells)) fail()
  const cells = new Set<string>()
  const tokens = new Set<string>()
  const addToken = (id: unknown) => {
    if (typeof id !== 'string' || !setupComponentCatalog.reputationTokenIds.includes(id) || tokens.has(id)) fail()
    tokens.add(id as string)
  }
  for (const id of market.remainingReputationTokenIds) addToken(id)
  for (const item of market.locationReputationTokens) addToken(item.tokenId)
  for (const cell of market.marketReputationCells) {
    const definition = setupComponentCatalog.marketReputationCells.find(item => item.id === cell?.cellId)
    if (!definition || !definition.playerCounts.includes(state.config.playerCount) || definition.column !== cell.column
      || definition.genre !== cell.genre || cells.has(cell.cellId)) fail()
    cells.add(cell.cellId)
    addToken(cell.tokenId)
  }
  const occupied = new Set<string>()
  for (const placement of market.marketAssistants) {
    if (!placement || typeof placement !== 'object') fail()
    const bid = setupComponentCatalog.marketBidCells.find(item => item.id === placement.cellId)
    const reputation = setupComponentCatalog.marketReputationCells.find(item => item.id === placement.cellId)
    if ((!bid && !reputation) || occupied.has(placement.cellId) || !state.players.some(player => player.id === placement.playerId)
      || typeof placement.assistantId !== 'string' || !placement.assistantId
      || (bid ? placement.bid !== bid.bid : placement.bid !== null)
      || (bid?.column === 2 || reputation?.column === 2) && state.config.playerCount === 2
      || reputation && cells.has(placement.cellId)) fail()
    occupied.add(placement.cellId)
  }
  for (const board of state.playerBoards) {
    if (!board.boardReputationTokens || typeof board.boardReputationTokens !== 'object' || Array.isArray(board.boardReputationTokens)
      || !Array.isArray(board.locationAssistants) || board.ejectedAssistant === undefined) fail()
    const entries = Object.entries(board.boardReputationTokens)
    if (entries.length > 1) fail()
    if (market.marketAssistants.filter(item => item.playerId === board.playerId && item.bid === null).length !== entries.length) fail()
    for (const [id, token] of entries) {
      if (!setupComponentCatalog.boardReputationCells.some(item => item.id === id)) fail()
      addToken(token)
    }
    const assistantIds = [...board.assistants.assistantOfficeIds, ...board.assistants.assistantHireQueueIds,
      ...Object.values(board.boardOrders).flatMap(order => order.assistant === null ? [] : [order.assistant]),
      ...market.marketAssistants.filter(item => item.playerId === board.playerId).map(item => item.assistantId)]
    for (const item of board.locationAssistants) {
      if (!item || typeof item.assistantId !== 'string' || !item.assistantId
        || !setupComponentCatalog.startingLocationOrder.includes(item.locationId)) fail()
      assistantIds.push(item.assistantId)
    }
    if (board.ejectedAssistant !== null) {
      const item = board.ejectedAssistant
      if (!item || typeof item.assistantId !== 'string' || !item.assistantId
        || !state.players.some(player => player.id === item.displacedByPlayerId)) fail()
      assistantIds.push(item.assistantId)
    }
    if (new Set(assistantIds).size !== assistantIds.length) fail()
  }
  for (const definition of setupComponentCatalog.marketReputationCells) {
    if (definition.playerCounts.includes(state.config.playerCount) && !cells.has(definition.id) && !occupied.has(definition.id)) fail()
  }
}
