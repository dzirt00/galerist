import { describe, expect, it } from 'vitest'

import {
  applyArtworkPurchasePaymentToGameState,
  projectEventsForViewer,
  projectGameForViewer,
  type ArtworkPurchasePaymentRequest,
  type SetupGameState,
} from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState } from './helpers.js'

interface PurchaseStateOptions {
  readonly coins?: number
  readonly initialFame?: number
  readonly currentFame?: number
}

/** Подготавливает независимое состояние с заданными монетами и известностью для проверки оплаты. */
function createPurchaseState({
  coins = 10,
  initialFame = 3,
  currentFame = 7,
}: PurchaseStateOptions = {}): SetupGameState {
  const state = structuredClone(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const openArtist = state.artistMarket.slots.find(artist => artist.isOpen)!

  return {
    ...state,
    players: state.players.map((player, playerIndex) => ({
      ...player,
      coins: playerIndex === 0 ? coins : player.coins,
    })),
    artistMarket: {
      ...state.artistMarket,
      slots: state.artistMarket.slots.map(artist => artist.artistId === openArtist.artistId
        ? { ...artist, initialFame, fame: currentFame }
        : { ...artist }),
    },
  }
}

/** Собирает запрос покупки у открытого художника для указанного способа покупки. */
function requestForOpenArtist(
  state: SetupGameState,
  purchaseType: ArtworkPurchasePaymentRequest['purchaseType'],
): ArtworkPurchasePaymentRequest {
  return {
    playerId: state.players[0]!.id,
    artistId: state.artistMarket.slots.find(artist => artist.isOpen)!.artistId,
    purchaseType,
  }
}

describe('applyArtworkPurchasePaymentToGameState', () => {
  it('применяет обычную цену, переносит посетителей и публикует события по порядку', () => {
    const state = createPurchaseState()
    const request = requestForOpenArtist(state, 'regular')
    const artist = state.artistMarket.slots.find(item => item.artistId === request.artistId)!
    const openArtwork = state.artworkMarket.openArtworksByGenre[artist.genre]!
    const originalPlazaVisitors = [...state.plazaVisitors]
    const stateSnapshot = structuredClone(state)
    const requestSnapshot = structuredClone(request)

    const transition = applyArtworkPurchasePaymentToGameState(state, request)

    expect(transition.state.players[0]!.coins).toBe(3)
    expect(transition.state.artworkMarket.openArtworksByGenre[artist.genre]).toEqual({
      artwork: openArtwork.artwork,
      visitors: [],
    })
    expect(transition.state.plazaVisitors).toEqual([
      ...originalPlazaVisitors,
      ...openArtwork.visitors,
    ])
    expect(transition.events).toEqual([
      {
        type: 'ArtworkSelected',
        playerId: request.playerId,
        artistId: request.artistId,
        artworkId: openArtwork.artwork.id,
      },
      { type: 'CoinsSpent', playerId: request.playerId, paid: 7 },
      ...openArtwork.visitors.map(visitor => ({
        type: 'VisitorMoved' as const,
        visitorId: visitor.id,
        from: 'artwork' as const,
        to: 'plaza' as const,
      })),
    ])
    expect(projectEventsForViewer(transition.events, transition.state, null)).toEqual(
      transition.events,
    )
    const projection = projectGameForViewer(transition.state, null)
    expect(projection.artworkMarket.openArtworksByGenre[artist.genre]!.visitors).toEqual([])
    expect(projection.plazaVisitors).toEqual(transition.state.plazaVisitors)
    expect(state).toEqual(stateSnapshot)
    expect(request).toEqual(requestSnapshot)
    expect(Object.isFrozen(transition)).toBe(true)
    expect(Object.isFrozen(transition.state)).toBe(true)
    expect(Object.isFrozen(transition.state.players)).toBe(true)
    expect(Object.isFrozen(transition.state.artworkMarket)).toBe(true)
    expect(Object.isFrozen(transition.events)).toBe(true)
    expect(transition.events.every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(state.config)).toBe(false)
    expect(Object.isFrozen(state.artistMarket)).toBe(false)
  })

  it('для контрактной покупки использует начальную известность художника', () => {
    const state = createPurchaseState()
    const request = requestForOpenArtist(state, 'contract')

    const transition = applyArtworkPurchasePaymentToGameState(state, request)

    expect(transition.state.players[0]!.coins).toBe(7)
    expect(transition.events[1]).toEqual({
      type: 'CoinsSpent',
      playerId: request.playerId,
      paid: 3,
    })
  })

  it('применяет допустимую доплату влиянием к состоянию игрока', () => {
    const state = createPurchaseState({ coins: 0, currentFame: 3 })
    const request: ArtworkPurchasePaymentRequest = {
      ...requestForOpenArtist(state, 'regular'),
      targetInfluence: 0,
    }

    const transition = applyArtworkPurchasePaymentToGameState(state, request)

    expect(transition.state.players[0]).toMatchObject({
      coins: 1,
      influence: 0,
    })
    expect(transition.events.slice(1, 4)).toEqual([
      {
        type: 'InfluenceSpent',
        playerId: request.playerId,
        spentInfluence: 10,
      },
      {
        type: 'CoinsReceived',
        playerId: request.playerId,
        coinsReceived: 4,
      },
      {
        type: 'CoinsSpent',
        playerId: request.playerId,
        paid: 3,
      },
    ])
    expect(projectEventsForViewer(transition.events, transition.state, null)).toEqual(
      transition.events,
    )
  })

  it('разрешает конвертировать влияние при достаточном числе собственных монет', () => {
    const state = createPurchaseState({ coins: 10, currentFame: 3 })
    const request: ArtworkPurchasePaymentRequest = {
      ...requestForOpenArtist(state, 'regular'),
      targetInfluence: 8,
    }
    const stateSnapshot = structuredClone(state)
    const requestSnapshot = structuredClone(request)

    const transition = applyArtworkPurchasePaymentToGameState(state, request)

    expect(transition.state.players[0]).toMatchObject({
      coins: 8,
      influence: 8,
    })
    expect(transition.events.slice(1, 4)).toEqual([
      {
        type: 'InfluenceSpent',
        playerId: request.playerId,
        spentInfluence: 2,
      },
      {
        type: 'CoinsReceived',
        playerId: request.playerId,
        coinsReceived: 1,
      },
      {
        type: 'CoinsSpent',
        playerId: request.playerId,
        paid: 3,
      },
    ])
    expect(state).toEqual(stateSnapshot)
    expect(request).toEqual(requestSnapshot)
    expect(Object.isFrozen(transition)).toBe(true)
    expect(transition.events.every(Object.isFrozen)).toBe(true)
  })

  it('отклоняет невалидную цель влияния при достаточном числе монет', () => {
    const state = createPurchaseState({ coins: 10, currentFame: 3 })
    const request: ArtworkPurchasePaymentRequest = {
      ...requestForOpenArtist(state, 'regular'),
      targetInfluence: 7,
    }
    const snapshot = structuredClone(state)

    expect(() => applyArtworkPurchasePaymentToGameState(state, request)).toThrow(
      'Invalid influence spend',
    )
    expect(state).toEqual(snapshot)
  })

  it('атомарно отклоняет покупку при недостатке средств', () => {
    const state = createPurchaseState({ coins: 0 })
    const request = requestForOpenArtist(state, 'regular')
    const snapshot = structuredClone(state)

    expect(() => applyArtworkPurchasePaymentToGameState(state, request)).toThrow(
      'Insufficient funds',
    )
    expect(state).toEqual(snapshot)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(state.artworkMarket)).toBe(false)
  })

  it('отклоняет несовпадающий жанр работы до применения эффектов', () => {
    const original = createPurchaseState()
    const request = requestForOpenArtist(original, 'regular')
    const artist = original.artistMarket.slots.find(item => item.artistId === request.artistId)!
    const openArtwork = original.artworkMarket.openArtworksByGenre[artist.genre]!
    const mismatchedGenre = artist.genre === 'D' ? 'P' : 'D'
    const state: SetupGameState = {
      ...original,
      artworkMarket: {
        ...original.artworkMarket,
        openArtworksByGenre: {
          ...original.artworkMarket.openArtworksByGenre,
          [artist.genre]: {
            ...openArtwork,
            artwork: { ...openArtwork.artwork, genre: mismatchedGenre },
          },
        },
      },
    }
    const snapshot = structuredClone(state)

    expect(() => applyArtworkPurchasePaymentToGameState(state, request)).toThrow(
      'Artwork genre must match artist genre',
    )
    expect(state).toEqual(snapshot)
  })

  it('отклоняет неизвестного игрока без изменения состояния', () => {
    const state = createPurchaseState()
    const request = {
      ...requestForOpenArtist(state, 'regular'),
      playerId: 'missing',
    }
    const snapshot = structuredClone(state)

    expect(() => applyArtworkPurchasePaymentToGameState(state, request)).toThrow(
      'Invalid player id missing',
    )
    expect(state).toEqual(snapshot)
  })

  it('отклоняет закрытого художника без изменения состояния', () => {
    const state = createPurchaseState()
    const closedArtist = state.artistMarket.slots.find(artist => !artist.isOpen)!
    const request: ArtworkPurchasePaymentRequest = {
      ...requestForOpenArtist(state, 'regular'),
      artistId: closedArtist.artistId,
    }
    const snapshot = structuredClone(state)

    expect(() => applyArtworkPurchasePaymentToGameState(state, request)).toThrow(
      `Invalid artist id ${closedArtist.artistId}`,
    )
    expect(state).toEqual(snapshot)
  })
})
