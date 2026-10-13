import { describe, expect, it } from 'vitest'
import { getAvailableArtworkSales, projectGameForViewer, setupComponentCatalog, type RegularPlayGameState, type PlayerBoard } from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

const orders = setupComponentCatalog.orders.filter(order => order.genre === 'D')
const artworks = setupComponentCatalog.artworks.filter(artwork => artwork.genre === 'D')
const otherArtwork = setupComponentCatalog.artworks.find(artwork => artwork.genre === 'P')!
const artists = setupComponentCatalog.artists.filter(artist => artist.genre === 'D')

function saleState(): RegularPlayGameState {
  const initial = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  return {
    ...initial,
    playerBoards: initial.playerBoards.map((board, index): PlayerBoard => index !== 0 ? board : {
      ...board,
      boardOrders: {
        1: { orderId: orders[0]!.id, orderStatus: 'unfulfilled', assistant: null },
        2: { orderId: orders[1]!.id, orderStatus: 'completed', assistant: null },
        3: { orderId: null, orderStatus: null, assistant: null },
      },
      gallery: {
        ...board.gallery,
        artworkSlots: [
          { artworkId: artworks[0]!.id, artistId: artists[0]!.id, signatureTokenId: 'signature-1', saleValue: 5, isMasterpiece: false },
          { artworkId: artworks[1]!.id, artistId: artists[1]!.id, signatureTokenId: 'signature-2', saleValue: 8, isMasterpiece: false },
          { artworkId: otherArtwork.id, artistId: 'ART-P-BLUE-1', signatureTokenId: 'signature-3', saleValue: 5, isMasterpiece: false },
          null,
        ],
      },
    }),
  }
}

describe('SALE-001 available artwork sales through public projection', () => {
  it('preserves the choice between artists and excludes completed orders and other genres', () => {
    const state = structuredClone(saleState())
    const before = structuredClone(state)
    const projection = projectGameForViewer(state, 'player-1')
    expect(projection.availableArtworkSales).toEqual([
      { orderId: orders[0]!.id, artworkId: artworks[0]!.id },
      { orderId: orders[0]!.id, artworkId: artworks[1]!.id },
    ])
    expect(state).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(projection.availableArtworkSales)).toBe(true)
    expect(Object.isFrozen(projection.availableArtworkSales[0])).toBe(true)
  })

  it('returns a single match and every pairing when two orders match it', () => {
    const state = saleState()
    const board = state.playerBoards[0]!
    const single: PlayerBoard = { ...board, gallery: { ...board.gallery, artworkSlots: [board.gallery.artworkSlots[0], null, null, null] } }
    expect(getAvailableArtworkSales(single)).toEqual([{ orderId: orders[0]!.id, artworkId: artworks[0]!.id }])
    const twoOrders: PlayerBoard = { ...single, boardOrders: { ...single.boardOrders, 2: { ...single.boardOrders[2], orderStatus: 'unfulfilled' } } }
    const next = { ...state, playerBoards: [twoOrders, state.playerBoards[1]!] }
    expect(projectGameForViewer(next, 'player-1').availableArtworkSales).toEqual([
      { orderId: orders[0]!.id, artworkId: artworks[0]!.id },
      { orderId: orders[1]!.id, artworkId: artworks[0]!.id },
    ])
  })

  it.each(['empty gallery', 'no matching genre', 'no unfulfilled order'] as const)('returns no options for %s', scenario => {
    const state = saleState()
    const board = state.playerBoards[0]!
    const changed: PlayerBoard = scenario === 'no unfulfilled order'
      ? { ...board, boardOrders: { ...board.boardOrders, 1: { ...board.boardOrders[1], orderStatus: 'completed' } } }
      : { ...board, gallery: { ...board.gallery, artworkSlots: [scenario === 'empty gallery' ? null : board.gallery.artworkSlots[2], null, null, null] } }
    expect(projectGameForViewer({ ...state, playerBoards: [changed, state.playerBoards[1]!] }, 'player-1').availableArtworkSales).toEqual([])
  })

  it('computes only the viewer options, including for an inactive player, and none for a spectator', () => {
    const state = saleState()
    const inactive = { ...state, activePlayerId: 'player-2' }
    expect(projectGameForViewer(inactive, 'player-1').availableArtworkSales).toHaveLength(2)
    expect(projectGameForViewer(state, 'player-2').availableArtworkSales).toEqual([])
    expect(projectGameForViewer(state, null).availableArtworkSales).toEqual([])
  })

  it('rejects an unknown viewer without changing the input', () => {
    const state = structuredClone(saleState())
    const before = structuredClone(state)
    expect(() => projectGameForViewer(state, 'missing')).toThrow('Viewer must be a player or null')
    expect(state).toEqual(before)
  })
})
