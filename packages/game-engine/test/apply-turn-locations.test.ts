import { describe, expect, it } from 'vitest'
import {
  applyTurn, applyGalleristMovementToGameState, applyVisitorMovementTickets,
  applyArtworkPurchaseToGameState, openArtist, receiveOrder, claimReputationToken, placeAuctionBid,
  confirmTurnDraft, createTurnDraft, updateTurnDraft, projectGameForViewer, projectEventsForViewer,
  restoreGameState, setupComponentCatalog,
  type GameState, type GameTransition, type LocationActionCommand, type ConfirmedTurnCommand,
  type StartingLocationId, type SetupTicketColor,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { threePlayerConfigs } from './fixtures.js'

function fixture(): GameState {
  const initial = startGameAfterSetup(createGameState({ playerCount: 3, seed: 42 }, threePlayerConfigs))
  return structuredClone({ ...initial, activePlayerId: 'player-1',
    players: initial.players.map(player => ({ ...player, coins: 30, ticketsByColor: { ...player.ticketsByColor, B: 3 } })),
    playerBoards: initial.playerBoards.map(board => ({ ...board, galleristPosition: 'HOME' as const })),
    plazaVisitors: [...initial.plazaVisitors, { id: 'turn-visitor', type: 'B' as const }],
  })
}
function colors(reward: string): readonly SetupTicketColor[] {
  if (reward === '—') return []
  if (reward === 'B' || reward === 'R' || reward === 'W') return [reward]
  if (reward === 'B+R+W') return ['B', 'R', 'W']
  if (reward === 'R+(B/W)') return ['R', 'B']
  if (reward === 'B+(R/W)' || reward === 'DIFF2') return ['B', 'R']
  return ['B']
}
type Scenario = {
  state: GameState
  locationId: StartingLocationId
  action: LocationActionCommand
  run: (state: GameState) => GameTransition<GameState>
}
function scenario(kind: string): Scenario {
  let state = fixture()
  if (kind === 'order') {
    const orderId = state.orderMarket.visibleOrders[1]!
    return { state, locationId: 'LOC-SALES_OFFICE',
      action: { category: 'location_action', receiveOrder: { orderActions: [{ typeAction: 'ACCEPT_ORDER', orderId, orderSlot: 1 }] } },
      run: next => receiveOrder(next, 'player-1', 'ACCEPT_ORDER', orderId, '1') }
  }
  if (kind === 'open') {
    const artist = state.artistMarket.slots.find(slot => !slot.isOpen)!
    const bonus = setupComponentCatalog.artistBonuses.find(item => item.reward === 'COINS')!
    state = { ...state, artistSetup: { ...state.artistSetup, slots: state.artistSetup.slots.map(slot =>
      slot.artistId === artist.artistId ? { ...slot, bonus } : slot) } }
    const request = { playerId: 'player-2', artistId: artist.artistId }
    return { state, locationId: 'LOC-ARTISTS_COLONY', action: { category: 'location_action', openArtist: request },
      run: next => openArtist(next, { ...request, playerId: 'player-1' }) }
  }
  if (kind === 'purchase') {
    const artist = state.artistMarket.slots.find(slot => slot.isOpen)!
    const artwork = state.artworkMarket.openArtworksByGenre[artist.genre]!.artwork
    const request = { playerId: 'player-2', artistId: artist.artistId, purchaseType: 'regular' as const,
      requestedTicketColors: colors(artwork.ticketReward) }
    return { state, locationId: 'LOC-ARTISTS_COLONY', action: { category: 'location_action', artworkPurchase: request },
      run: next => applyArtworkPurchaseToGameState(next, { ...request, playerId: 'player-1' }) }
  }
  state = { ...state, vestibuleVisitors: [...state.vestibuleVisitors.filter(item => item.playerId !== 'player-1'),
    { playerId: 'player-1', vestibuleVisitor: { id: 'market-visitor', type: 'B' } }],
    playerBoards: state.playerBoards.map(board => board.playerId === 'player-1' ? { ...board,
      soldArtworkIds: setupComponentCatalog.genreOrder.map(genre => setupComponentCatalog.artworks.find(item => item.genre === genre)!.id),
    } : board) }
  if (kind === 'bid') {
    const request = { playerId: 'player-2', cellId: 'MARKET-BID-C1-B3', assistantId: 'ASSISTANT-1', assistantSource: 'office' as const,
      choices: { requestedTicketColors: ['B'] as const } }
    return { state, locationId: 'LOC-INTERNATIONAL_MARKET', action: { category: 'location_action', placeAuctionBid: request },
      run: next => placeAuctionBid(next, { ...request, playerId: 'player-1' }) }
  }
  const request = { playerId: 'player-2', cellId: 'MARKET-REP-C1-D', assistantId: 'ASSISTANT-1', assistantSource: 'office' as const,
    boardCellId: 'BOARD-REP-R2-L', visitorId: 'market-visitor' }
  return { state, locationId: 'LOC-INTERNATIONAL_MARKET', action: { category: 'location_action', claimReputationToken: request },
    run: next => claimReputationToken(next, { ...request, playerId: 'player-1' }) }
}
function commandFor(s: Scenario): ConfirmedTurnCommand {
  return confirmTurnDraft(updateTurnDraft(updateTurnDraft(createTurnDraft('player-1'), {
    type: 'set_movement', movement: { category: 'movement', locationId: s.locationId },
  }), { type: 'set_location_action', locationAction: s.action }))
}
const kinds = ['order', 'open', 'purchase', 'bid', 'reputation']
describe('TURN-002 all location actions', () => {
  for (const kind of kinds) {
    it.each(['none', 'before_location', 'after_location'] as const)(`${kind}: %s preserves effects and event order`, timing => {
      const s = scenario(kind)
      const steps = [{ visitorId: 'turn-visitor', destination: 'vestibule' as const }]
      const command: ConfirmedTurnCommand = { ...commandFor(s), ...(timing === 'none' ? {} : {
        management: { timing, command: { category: 'management_action', visitorMovementSteps: steps } },
      }) }
      const before = structuredClone({ state: s.state, command })
      const movement = applyGalleristMovementToGameState(s.state, command)
      let next = movement.state
      const events = [...movement.events]
      const management = () => {
        events.push({ type: 'ManagementActionStarted', playerId: 'player-1' })
        const result = applyVisitorMovementTickets(next, 'player-1', steps)
        next = result.state
        events.push(...result.events)
      }
      if (timing === 'before_location') management()
      const action = s.run(next)
      next = action.state
      events.push(...action.events)
      if (timing === 'after_location') management()
      const result = applyTurn(s.state, command)
      expect(result).toEqual({ state: next, events })
      expect(result.state.activePlayerId).toBe('player-1')
      expect(result.state.playerBoards[0]!.galleristPosition).toBe(s.locationId)
      expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
      for (const viewer of [null, 'player-1', 'player-2']) {
        expect(projectGameForViewer(result.state, viewer)).toEqual(projectGameForViewer(next, viewer))
        expect(projectEventsForViewer(result.events, result.state, viewer)).toEqual(events)
      }
      expect(Object.isFrozen(result.state)).toBe(true)
      expect(Object.isFrozen(result.events)).toBe(true)
      expect({ state: s.state, command }).toEqual(before)
    })
    it(`${kind}: rejects wrong location and rolls back a late management failure`, () => {
      const s = scenario(kind)
      const command = commandFor(s)
      const before = structuredClone(s.state)
      expect(() => applyTurn(s.state, { ...command, movement: { category: 'movement',
        locationId: s.locationId === 'LOC-MEDIA_CENTER' ? 'LOC-SALES_OFFICE' : 'LOC-MEDIA_CENTER' } })).toThrow()
      expect(() => applyTurn(s.state, { ...command, management: { timing: 'after_location',
        command: { category: 'management_action', visitorMovementSteps: [{ visitorId: 'missing', destination: 'vestibule' }] } } })).toThrow()
      expect(s.state).toEqual(before)
    })
  }
  it('keeps refresh on decline, rejects unfinished refresh and accepts the newly revealed order', () => {
    const s = scenario('order')
    const command = commandFor(s)
    const refreshed = receiveOrder(s.state, 'player-1', 'REFRESH')
    const declined = receiveOrder(refreshed.state, 'player-1', 'DECLINE')
    const result = applyTurn(s.state, { ...command, locationAction: { category: 'location_action', receiveOrder: {
      orderActions: [{ typeAction: 'REFRESH' }, { typeAction: 'DECLINE' }],
    } } })
    expect(result.state.orderMarket).toEqual(declined.state.orderMarket)
    expect(result.state.players[0]!.status).toBe('REFUSAL')
    const orderId = refreshed.state.orderMarket.visibleOrders[1]!
    const accepted = applyTurn(s.state, { ...command, locationAction: { category: 'location_action', receiveOrder: {
      orderActions: [{ typeAction: 'REFRESH' }, { typeAction: 'ACCEPT_ORDER', orderId, orderSlot: 3, requestedColor: 'W' }],
    } } })
    expect(accepted.state.playerBoards[0]!.boardOrders[3]).toMatchObject({ orderId, orderStatus: 'unfulfilled' })
    expect(accepted.state.players[0]!.status).toBe('SUCCESS')
    const before = structuredClone(s.state)
    for (const orderActions of [[], [{ typeAction: 'REFRESH' as const }],
      [{ typeAction: 'REFRESH' as const }, { typeAction: 'ACCEPT_ORDER' as const, orderId: 'missing', orderSlot: 1 as const }]]) {
      expect(() => applyTurn(s.state, { ...command, locationAction: { category: 'location_action', receiveOrder: { orderActions } } })).toThrow()
    }
    expect(s.state).toEqual(before)
  })
  it('rejects mixed, unknown, missing and malformed actions atomically', () => {
    const s = scenario('open')
    const command = commandFor(s)
    const before = structuredClone(s.state)
    for (const action of [
      { ...s.action, artworkPurchase: { playerId: 'player-1', artistId: 'missing', purchaseType: 'regular' } },
      { category: 'location_action', unknown: {} }, { category: 'location_action' },
      { category: 'location_action', openArtist: null }, { category: 'location_action', openArtist: [] },
    ]) {
      expect(() => applyTurn(s.state, { ...command, locationAction: action as unknown as LocationActionCommand })).toThrow()
    }
    expect(s.state).toEqual(before)
  })
  it.each(kinds)('%s: enforces the domain precondition after movement', kind => {
    const s = scenario(kind)
    const command = commandFor(s)
    let state = s.state
    if (kind === 'order') {
      const ids = Object.values(state.orderMarket.visibleOrders).filter((id): id is string => id !== null)
      state = { ...state, playerBoards: state.playerBoards.map(board => board.playerId === 'player-1'
        ? { ...board, boardOrders: {
          1: { orderId: ids[0]!, orderStatus: 'unfulfilled', assistant: null },
          2: { orderId: ids[1]!, orderStatus: 'unfulfilled', assistant: null },
          3: { orderId: ids[2]!, orderStatus: 'unfulfilled', assistant: null },
        } } : board) }
    } else if (kind === 'open') {
      state = s.run(state).state // The contract now prevents opening another artist.
    } else if (kind === 'purchase') {
      state = { ...state, players: state.players.map(player => ({ ...player, coins: 0 })) }
    } else if (kind === 'bid') {
      state = s.run(state).state // The selected market cell is occupied.
    } else {
      state = { ...state, playerBoards: state.playerBoards.map(board => ({ ...board, soldArtworkIds: [] })) }
    }
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow()
    expect({ state, command }).toEqual(before)
  })
  it('accepts an order after a separately confirmed refresh without refreshing or moving twice', () => {
    const s = scenario('order')
    const refreshed = receiveOrder(s.state, 'player-1', 'REFRESH')
    const orderId = refreshed.state.orderMarket.visibleOrders[1]!
    const command: ConfirmedTurnCommand = { ...commandFor(s), locationAction: {
      category: 'location_action', receiveOrder: { orderActions: [{ typeAction: 'ACCEPT_ORDER', orderId, orderSlot: 1 }] },
    } }
    const result = applyTurn(refreshed.state, command)
    expect(result.state.players[0]!.status).toBe('SUCCESS')
    expect(result.events.some(event => event.type === 'OrderMarketRefreshed')).toBe(false)
    expect(result.state.playerBoards[0]!.boardOrders[1].orderId).toBe(orderId)
  })
})
