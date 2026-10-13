import { describe, expect, it } from 'vitest'
import {
  applyArtworkPurchaseToGameState, applyArtworkSaleToGameState, applyVisitorMovementTickets,
  projectGameForViewer, restoreGameState, setupComponentCatalog,
  type GameState, type SetupTicketColor,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function fixture() {
  const initial = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const artist = initial.artistMarket.slots.find(item => item.isOpen)!
  const orders = setupComponentCatalog.orders.filter(item => item.genre === artist.genre)
  const visitors = [...initial.visitorBag.visitors, ...initial.plazaVisitors, ...initial.vestibuleVisitors.map(item => item.vestibuleVisitor),
    ...Object.values(initial.artworkMarket.openArtworksByGenre).flatMap(slot => slot?.visitors ?? [])]
  const collectors = visitors.filter(item => item.type === 'W').slice(0, 4)
  const investors = visitors.filter(item => item.type === 'B').slice(0, 2)
  const movedIds = new Set([...collectors, ...investors].map(item => item.id))
  const state: GameState = {
    ...initial,
    players: initial.players.map((player, index) => index === 0
      ? { ...player, coins: 30, ticketsByColor: { ...player.ticketsByColor, W: 3 } } : player),
    ticketOffice: { ticketsByColor: { ...initial.ticketOffice.ticketsByColor, W: initial.ticketOffice.ticketsByColor.W - (3 - initial.players[0]!.ticketsByColor.W) } },
    visitorBag: { visitors: initial.visitorBag.visitors.filter(item => !movedIds.has(item.id)) },
    artworkMarket: { ...initial.artworkMarket, openArtworksByGenre: Object.fromEntries(
      Object.entries(initial.artworkMarket.openArtworksByGenre).map(([genre, slot]) => [genre, slot
        ? { ...slot, visitors: slot.visitors.filter(item => !movedIds.has(item.id)) } : null]),
    ) as GameState['artworkMarket']['openArtworksByGenre'] },
    plazaVisitors: initial.plazaVisitors.filter(item => !movedIds.has(item.id)),
    vestibuleVisitors: [
      ...initial.vestibuleVisitors.filter(item => !movedIds.has(item.vestibuleVisitor.id)),
      ...collectors.slice(1).map(vestibuleVisitor => ({ playerId: 'player-1', vestibuleVisitor })),
    ],
    playerBoards: initial.playerBoards.map((board, index) => index === 0 ? {
      ...board,
      gallery: { ...board.gallery, visitors: [collectors[0]!, ...investors] },
      boardOrders: {
        ...board.boardOrders,
        1: { orderId: orders[0]!.id, orderStatus: 'unfulfilled', assistant: null },
        2: { orderId: orders[1]!.id, orderStatus: 'unfulfilled', assistant: null },
      },
    } : board),
  }
  return { state, artist, collectors, investors, orders }
}

function buy(state: GameState, artistId: string): GameState {
  const artist = state.artistMarket.slots.find(item => item.artistId === artistId)!
  const reward = state.artworkMarket.openArtworksByGenre[artist.genre]!.artwork.ticketReward
  const requestedTicketColors: readonly SetupTicketColor[] = reward === '—' ? [] : reward === 'B+R+W' ? ['B', 'R', 'W']
    : reward === 'R+(B/W)' ? ['R', 'B'] : reward === 'B+(R/W)' || reward === 'DIFF2' ? ['B', 'R']
      : reward === 'R' ? ['R'] : reward === 'W' ? ['W'] : ['B']
  return applyArtworkPurchaseToGameState(state, { playerId: 'player-1', artistId, purchaseType: 'regular', requestedTicketColors }).state
}

function expectCollectorRejected(state: GameState, visitorId: string) {
  const before = structuredClone(state)
  expect(() => applyVisitorMovementTickets(state, 'player-1', [{ visitorId, destination: 'gallery' }]))
    .toThrow('Collector capacity exceeded')
  expect(state).toEqual(before)
}

describe('SALE-004 collector capacity after actual sales', () => {
  it('raises the limit from 1 to 2 to 3 after consecutive public purchases and sales', () => {
    const { state: initial, artist, collectors, investors, orders } = fixture()
    const initialBefore = structuredClone(initial)
    expect(initial.players[0]!.soldArtworkCount).toBe(0)
    expectCollectorRejected(initial, collectors[1]!.id)
    let state: GameState = initial

    for (let index = 0; index < 2; index++) {
      const purchased = buy(state, artist.artistId)
      const before = structuredClone(purchased)
      const artwork = purchased.playerBoards[0]!.gallery.artworkSlots[0]!
      const sold = applyArtworkSaleToGameState(purchased, {
        playerId: 'player-1', orderId: orders[index]!.id, artworkId: artwork.artworkId, visitorId: investors[index]!.id,
      })
      expect(sold.state.players[0]!.soldArtworkCount).toBe(index + 1)
      expect(sold.state.players[1]!.soldArtworkCount).toBe(0)
      expect(sold.events.find(event => event.type === 'ArtworkSold')).toMatchObject({ soldArtworkCount: index + 1 })
      expect(sold.events.map(event => event.type)).toEqual([
        'ArtworkSold', 'CoinsReceived', 'SignatureReturned', 'VisitorMoved', 'OrderCompleted', 'OrderRewardSideSelected',
      ])
      expect(purchased).toEqual(before)
      const restored = restoreGameState(JSON.parse(JSON.stringify(sold.state)))
      expect(restored).toEqual(sold.state)
      expect(projectGameForViewer(restored, 'player-1').players[0]!.soldArtworkCount).toBe(index + 1)
      const moved = applyVisitorMovementTickets(restored, 'player-1', [{ visitorId: collectors[index + 1]!.id, destination: 'gallery' }])
      expect(moved.state.playerBoards[0]!.gallery.visitors.filter(visitor => visitor.type === 'W')).toHaveLength(index + 2)
      expect(moved.state.players[0]!.soldArtworkCount).toBe(index + 1)
      expectCollectorRejected(moved.state, collectors[index + 2]!.id)
      state = moved.state
    }
    expect(state.playerBoards[0]!.soldArtworkIds).toHaveLength(2)
    expect(initial).toEqual(initialBefore)
  })

  it('does not unlock a collector after a rejected sale or after purchase alone', () => {
    const { state, artist, collectors, orders, investors } = fixture()
    const purchased = buy(state, artist.artistId)
    const before = structuredClone(purchased)
    expectCollectorRejected(purchased, collectors[1]!.id)
    expect(() => applyArtworkSaleToGameState(purchased, {
      playerId: 'player-1', orderId: orders[0]!.id,
      artworkId: purchased.playerBoards[0]!.gallery.artworkSlots[0]!.artworkId,
      visitorId: investors[0]!.id, orderRewardSide: 'influence',
    })).toThrow('Order reward side is determined by visitor')
    expect(purchased.players[0]!.soldArtworkCount).toBe(0)
    expect(purchased).toEqual(before)
    expectCollectorRejected(purchased, collectors[1]!.id)
  })
})
