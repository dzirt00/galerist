import { describe, expect, it } from 'vitest'
import {
  applyTurn, confirmTurnDraft, createTurnDraft, updateTurnDraft,
  projectGameForViewer, projectEventsForViewer, restoreGameState, setupComponentCatalog,
  type ConfirmedTurnCommand, type ExhibitedArtwork, type GameState,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function scenario(withVisitor = true) {
  const initial = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const playerId = initial.activePlayerId!
  const artist = initial.artistMarket.slots.find(item => item.isOpen)!
  const prepared = initial.artistSetup.slots.find(item => item.artistId === artist.artistId)!
  const work = setupComponentCatalog.artworks.find(item => item.genre === artist.genre)!
  const order = setupComponentCatalog.orders.find(item => item.genre === artist.genre)!
  const artwork: ExhibitedArtwork = {
    artworkId: work.id, artistId: artist.artistId,
    signatureTokenId: prepared.availableSignatureTokenIds[0]!, saleValue: 11, isMasterpiece: false,
  }
  const visitor = initial.plazaVisitors.find(item => item.type === 'R')!
  const state: GameState = {
    ...initial,
    players: initial.players.map(player => player.id === playerId
      ? { ...player, ticketsByColor: { B: 1, R: 1, W: 1 } } : player),
    artistSetup: { ...initial.artistSetup, slots: initial.artistSetup.slots.map(item => item.artistId === artist.artistId
      ? { ...item, availableSignatureTokenIds: item.availableSignatureTokenIds.filter(id => id !== artwork.signatureTokenId) } : item) },
    playerBoards: initial.playerBoards.map(board => board.playerId !== playerId ? board : {
      ...board, galleristPosition: 'HOME',
      boardOrders: { ...board.boardOrders, 1: { orderId: order.id, orderStatus: 'unfulfilled', assistant: null } },
      gallery: { artworkSlots: [artwork, null, null, null], visitors: withVisitor ? [visitor] : [] },
    }),
    plazaVisitors: withVisitor ? initial.plazaVisitors.filter(item => item.id !== visitor.id) : initial.plazaVisitors,
  }
  const command = confirmTurnDraft(updateTurnDraft(updateTurnDraft(createTurnDraft(playerId), {
    type: 'set_movement', movement: { category: 'movement', locationId: 'LOC-SALES_OFFICE' },
  }), {
    type: 'set_location_action', locationAction: { category: 'location_action', artworkSale: {
      playerId: initial.players.find(player => player.id !== playerId)!.id,
      orderId: order.id, artworkId: artwork.artworkId,
      ...(withVisitor ? { visitorId: visitor.id } : { orderRewardSide: 'coins' as const }),
    } },
  }))
  return { state, command, artwork, visitor }
}

describe('TURN-002: sale through the public turn command', () => {
  it.each([false, true])('sells with gallery visitor=%s and preserves the full transition', withVisitor => {
    const { state, command, artwork, visitor } = scenario(withVisitor)
    const before = structuredClone({ state, command })
    const result = applyTurn(state, command)
    const board = result.state.playerBoards.find(item => item.playerId === command.playerId)!
    const player = result.state.players.find(item => item.id === command.playerId)!
    expect(player.coins).toBe(state.players.find(item => item.id === command.playerId)!.coins + 11)
    expect(player.soldArtworkCount).toBe(1)
    expect(board.galleristPosition).toBe('LOC-SALES_OFFICE')
    expect(board.soldArtworkIds).toEqual([artwork.artworkId])
    expect(board.gallery.artworkSlots).toEqual([null, null, null, null])
    expect(board.gallery.visitors).toEqual([])
    expect(board.boardOrders[1].orderStatus).toBe('completed')
    expect(board.orderRewardSides[1]).toBe(withVisitor ? 'influence' : 'coins')
    expect(result.state.artistSetup.slots.find(item => item.artistId === artwork.artistId)!.availableSignatureTokenIds)
      .toContain(artwork.signatureTokenId)
    expect(result.events.map(event => event.type)).toEqual([
      'GalleristMoved', 'ArtworkSold', 'CoinsReceived', 'SignatureReturned',
      ...(withVisitor ? ['VisitorMoved'] : []), 'OrderCompleted', 'OrderRewardSideSelected',
    ])
    expect(result.events.find(event => event.type === 'ArtworkSold')).toEqual({
      type: 'ArtworkSold', playerId: command.playerId, orderId: command.locationAction.artworkSale!.orderId,
      artworkId: artwork.artworkId, artistId: artwork.artistId, saleValue: 11, soldArtworkCount: 1,
    })
    if (withVisitor) expect(result.state.plazaVisitors).toContainEqual(visitor)
    expect(result.state.activePlayerId).toBe(state.activePlayerId)
    expect(result.state.round).toBe(state.round)
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(command)).toBe(true)
    expect(Object.isFrozen(result.state.playerBoards)).toBe(true)
    expect(Object.isFrozen(result.events)).toBe(true)
    expect(projectGameForViewer(result.state, command.playerId).availableArtworkSales).toEqual([])
    expect(projectEventsForViewer(result.events, result.state, null)).toEqual(result.events)
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
  })

  it.each(['before_location', 'after_location'] as const)('preserves sale and ticket effects at %s', timing => {
    const { state, command: base, visitor } = scenario()
    const moved = timing === 'after_location' ? visitor : state.plazaVisitors[0]!
    const command: ConfirmedTurnCommand = { ...base, management: {
      timing, command: { category: 'management_action', visitorMovementSteps: [
        { visitorId: moved.id, destination: 'vestibule' },
      ] },
    } }
    const before = structuredClone({ state, command })
    const result = applyTurn(state, command)
    const sale = ['ArtworkSold', 'CoinsReceived', 'SignatureReturned', 'VisitorMoved', 'OrderCompleted', 'OrderRewardSideSelected']
    const management = ['ManagementActionStarted', 'TicketSpent', 'VisitorMoved']
    expect(result.events.map(event => event.type)).toEqual(['GalleristMoved',
      ...(timing === 'before_location' ? [...management, ...sale] : [...sale, ...management]),
    ])
    expect(result.state.vestibuleVisitors).toContainEqual({ playerId: command.playerId, vestibuleVisitor: moved })
    expect(result.state.plazaVisitors).not.toContainEqual(moved)
    expect(result.state.players.find(item => item.id === command.playerId)!.ticketsByColor[moved.type]).toBe(0)
    expect(result.state.ticketDiscard[moved.type]).toBe(state.ticketDiscard[moved.type] + 1)
    expect(result.state.players.find(item => item.id === command.playerId)!.soldArtworkCount).toBe(1)
    expect(result.events).toContainEqual({ type: 'TicketSpent', playerId: command.playerId, color: moved.type })
    expect({ state, command }).toEqual(before)
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
  })

  it('does not expose a future sale visitor to management before the location action', () => {
    const { state, command: base, visitor } = scenario()
    const command: ConfirmedTurnCommand = { ...base, management: {
      timing: 'before_location', command: { category: 'management_action', visitorMovementSteps: [
        { visitorId: visitor.id, destination: 'vestibule' },
      ] },
    } }
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow('Visitor is unavailable')
    expect({ state, command }).toEqual(before)
  })

  it('uses the increased collector capacity during management after the sale', () => {
    const { state: base, command: sale } = scenario()
    const collectors = base.visitorBag.visitors.filter(item => item.type === 'W').slice(0, 2)
    const [existing, incoming] = collectors
    expect(collectors).toHaveLength(2)
    const state: GameState = {
      ...base,
      visitorBag: { visitors: base.visitorBag.visitors.filter(item => !collectors.some(visitor => visitor.id === item.id)) },
      vestibuleVisitors: [...base.vestibuleVisitors, { playerId: sale.playerId, vestibuleVisitor: incoming! }],
      playerBoards: base.playerBoards.map(board => board.playerId === sale.playerId
        ? { ...board, gallery: { ...board.gallery, visitors: [...board.gallery.visitors, existing!] } } : board),
    }
    const management = { category: 'management_action' as const, visitorMovementSteps: [
      { visitorId: incoming!.id, destination: 'gallery' as const },
    ] }
    const before = structuredClone(state)
    expect(() => applyTurn(state, { ...sale, management: { timing: 'before_location', command: management } }))
      .toThrow('Collector capacity exceeded')
    expect(state).toEqual(before)
    const result = applyTurn(state, { ...sale, management: { timing: 'after_location', command: management } })
    expect(result.state.players.find(player => player.id === sale.playerId)!.soldArtworkCount).toBe(1)
    expect(result.state.playerBoards.find(board => board.playerId === sale.playerId)!.gallery.visitors).toEqual(collectors)
    expect(state).toEqual(before)
  })

  it('rejects a late second ticket step without committing movement, sale or the first ticket step', () => {
    const { state, command: base, visitor } = scenario()
    const command: ConfirmedTurnCommand = { ...base, management: {
      timing: 'after_location', command: { category: 'management_action', visitorMovementSteps: [
        { visitorId: visitor.id, destination: 'vestibule' },
        { visitorId: visitor.id, destination: 'gallery' },
      ] },
    } }
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow('Insufficient tickets')
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(command)).toBe(false)
  })

  it.each(['wrong location', 'mixed actions', 'invalid sale'] as const)('rejects %s atomically', reason => {
    const { state, command: base } = scenario()
    let command: ConfirmedTurnCommand = base
    if (reason === 'wrong location') command = { ...base, movement: { category: 'movement', locationId: 'LOC-MEDIA_CENTER' } }
    if (reason === 'mixed actions') command = { ...base, locationAction: { ...base.locationAction,
      hireAssistants: { playerId: base.playerId, countAssistants: 1 },
    } }
    if (reason === 'invalid sale') command = { ...base, locationAction: { category: 'location_action', artworkSale: {
      ...base.locationAction.artworkSale!, artworkId: 'missing',
    } } }
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow()
    expect({ state, command }).toEqual(before)
  })
})
