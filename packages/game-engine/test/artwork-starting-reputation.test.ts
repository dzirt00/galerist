import { describe, expect, it } from 'vitest'
import {
  applyArtworkPurchaseToGameState,
  projectGameForViewer,
  restoreGameState,
  type ArtworkPurchaseRequest,
  type SetupTicketColor,
} from '../src/index.js'
import { completeStartingLocationSelection, createGameState } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

/** Подготавливает покупку с заданной заполненностью галереи, статусом шедевра и остатком рынка. */
function preparePurchase({ occupied = 2, masterpiece = false, lastArtwork = false } = {}) {
  const base = completeStartingLocationSelection(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const artist = base.artistMarket.slots.find(slot => slot.isOpen)!
  const open = base.artworkMarket.openArtworksByGenre[artist.genre]!
  /** Создаёт уже выставленную работу другого художника для проверки вместимости галереи. */
  const existing = (index: number) => ({
    artworkId: `existing-${index}`,
    artistId: `other-artist-${index}`,
    signatureTokenId: `other-signature-${index}`,
    saleValue: 5,
    isMasterpiece: false,
  })
  const state = {
    ...base,
    players: base.players.map(player => ({ ...player, coins: 30 })),
    artistMarket: {
      ...base.artistMarket,
      slots: base.artistMarket.slots.map(slot => slot.artistId === artist.artistId && masterpiece
        ? { ...slot, fame: 18 } : slot),
    },
    artworkMarket: {
      ...base.artworkMarket,
      openArtworksByGenre: {
        ...base.artworkMarket.openArtworksByGenre,
        [artist.genre]: { ...open, artwork: { ...open.artwork, fameGain: 1 as const, ticketReward: '—' } },
      },
      remainingArtworksByGenre: {
        ...base.artworkMarket.remainingArtworksByGenre,
        [artist.genre]: lastArtwork ? [] : base.artworkMarket.remainingArtworksByGenre[artist.genre],
      },
    },
    playerBoards: base.playerBoards.map((board, index) => index === 0 ? {
      ...board,
      gallery: {
        ...board.gallery,
        artworkSlots: [
          occupied > 0 ? existing(1) : null,
          occupied > 1 ? existing(2) : null,
          null,
          null,
        ] as const,
      },
    // Несовпадение порядка планшетов и players выявляет поиск по индексу вместо playerId.
    } : board).reverse(),
  }
  const request: ArtworkPurchaseRequest = {
    playerId: base.players[0]!.id,
    artistId: artist.artistId,
    purchaseType: 'regular',
    requestedTicketColors: [] as readonly SetupTicketColor[],
  }
  return { state, request, artist, artworkId: open.artwork.id }
}

describe('ARTWORK-006: стартовый жетон на третьей работе', () => {
  it.each([
    { masterpiece: false, lastArtwork: false, position: 2 },
    { masterpiece: true, lastArtwork: false, position: 3 },
    { masterpiece: false, lastArtwork: true, position: 2 },
    { masterpiece: true, lastArtwork: true, position: 3 },
  ])('закрепляет жетон при покупке: %j', ({ masterpiece, lastArtwork, position }) => {
    const { state, request, artist, artworkId } = preparePurchase({ masterpiece, lastArtwork })
    const before = structuredClone(state)
    const requestBefore = structuredClone(request)
    const boardBefore = state.playerBoards.find(board => board.playerId === request.playerId)!
    const tokenId = boardBefore.thirdPartitionReputationTokenId!
    expect(tokenId).not.toBeNull()

    const transition = applyArtworkPurchaseToGameState(state, request)
    const board = transition.state.playerBoards.find(board => board.playerId === request.playerId)!

    expect(board.gallery.artworkSlots[position]).toMatchObject({ artworkId, isMasterpiece: masterpiece })
    expect(board.gallery.artworkSlots.filter(slot => slot !== null)).toHaveLength(3)
    expect(board.thirdPartitionReputationTokenId).toBeNull()
    expect(board.reputationTokenArtworkIds).toEqual({ [tokenId]: artworkId })
    expect(transition.state.playerBoards.find(other => other.playerId !== request.playerId))
      .toEqual(state.playerBoards.find(other => other.playerId !== request.playerId))
    expect(projectGameForViewer(transition.state, null).playerBoards.find(other => other.playerId === request.playerId)!
      .reputationTokenArtworkIds).toEqual({ [tokenId]: artworkId })
    expect(restoreGameState(structuredClone(transition.state))).toEqual(transition.state)
    expect(Object.isFrozen(board.reputationTokenArtworkIds)).toBe(true)
    expect(state).toEqual(before)
    expect(request).toEqual(requestBefore)
    expect(transition.events.map(event => event.type)).toEqual([
      'ArtworkSelected', 'CoinsSpent', 'VisitorMoved', 'ArtistFameIncreased',
      ...(masterpiece ? ['ArtistBecameSuperstar', 'CoinsReceived'] : []),
      'ArtworkExhibited', 'SignaturePriceSet',
      ...(masterpiece ? ['ExhibitionCapacityChanged'] : []),
      ...(lastArtwork ? [] : ['ArtworkMarketRefilled']),
    ])
    if (lastArtwork) {
      expect(transition.state.artworkMarket.openArtworksByGenre[artist.genre]).toBeNull()
      expect(transition.state.visitorBag).toEqual(state.visitorBag)
    }
  })

  it.each([0, 1])('не активирует жетон после покупки при %i исходных работах', occupied => {
    const { state, request } = preparePurchase({ occupied })
    const before = state.playerBoards.find(board => board.playerId === request.playerId)!
    const transition = applyArtworkPurchaseToGameState(state, request)
    const board = transition.state.playerBoards.find(board => board.playerId === request.playerId)!
    expect(board.thirdPartitionReputationTokenId).toBe(before.thirdPartitionReputationTokenId)
    expect(board.reputationTokenArtworkIds).toBeNull()
  })

  it('сохраняет ранее закреплённый жетон, если на перегородке жетона уже нет', () => {
    const { state: base, request } = preparePurchase()
    const state = {
      ...base,
      playerBoards: base.playerBoards.map(board => board.playerId === request.playerId ? {
        ...board,
        thirdPartitionReputationTokenId: null,
        reputationTokenArtworkIds: { 'already-attached': 'existing-1' },
      } : board),
    }
    const transition = applyArtworkPurchaseToGameState(state, request)
    const board = transition.state.playerBoards.find(board => board.playerId === request.playerId)!
    expect(board.thirdPartitionReputationTokenId).toBeNull()
    expect(board.reputationTokenArtworkIds).toEqual({ 'already-attached': 'existing-1' })
  })

  it('отказ покупки сохраняет жетон на перегородке и весь вход', () => {
    const { state, request } = preparePurchase()
    const before = structuredClone(state)
    expect(() => applyArtworkPurchaseToGameState(state, { ...request, playerId: 'unknown' })).toThrow()
    expect(state).toEqual(before)
  })
})
