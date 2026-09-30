import { describe, expect, it } from 'vitest'
import {
  applyArtworkPurchaseToGameState,
  projectEventsForViewer,
  projectGameForViewer,
  restoreGameState,
  type ArtworkPurchaseRequest,
  type GameState,
  type SetupTicketColor,
} from '../src/index.js'
import { createGameState } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function colorsForReward(reward: string): readonly SetupTicketColor[] {
  if (reward === '—') return []
  if (reward === 'B' || reward === 'R' || reward === 'W') return [reward]
  if (reward === 'B+R+W') return ['B', 'R', 'W']
  if (reward === 'R+(B/W)') return ['R', 'B']
  if (reward === 'B+(R/W)') return ['B', 'R']
  if (reward === 'DIFF2') return ['B', 'R']
  return ['B']
}

function regularRequest(state: GameState): ArtworkPurchaseRequest {
  const artist = state.artistMarket.slots.find(slot => slot.isOpen)!
  const artwork = state.artworkMarket.openArtworksByGenre[artist.genre]!.artwork
  return {
    playerId: state.players[0]!.id,
    artistId: artist.artistId,
    purchaseType: 'regular',
    requestedTicketColors: colorsForReward(artwork.ticketReward),
  }
}

describe('applyArtworkPurchaseToGameState', () => {
  it('атомарно покупает, размещает работу, переносит подпись и пополняет рынок', () => {
    const state = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const request = regularRequest(state)
    const artist = state.artistMarket.slots.find(slot => slot.artistId === request.artistId)!
    const artwork = state.artworkMarket.openArtworksByGenre[artist.genre]!.artwork
    const signatureTokenId = state.artistSetup.slots.find(slot => slot.artistId === artist.artistId)!
      .availableSignatureTokenIds[0]!
    const stateSnapshot = structuredClone(state)
    const requestSnapshot = structuredClone(request)

    const transition = applyArtworkPurchaseToGameState(state, request)
    const board = transition.state.playerBoards[0]!
    const exhibited = board.gallery.artworkSlots[0]!

    expect(exhibited).toMatchObject({ artworkId: artwork.id, artistId: artist.artistId, signatureTokenId })
    expect(transition.state.artistSetup.slots.find(slot => slot.artistId === artist.artistId)!
      .availableSignatureTokenIds).not.toContain(signatureTokenId)
    expect(transition.state.artworkMarket.openArtworksByGenre[artist.genre]?.artwork.id).not.toBe(artwork.id)
    expect(transition.events[0]?.type).toBe('ArtworkSelected')
    expect(transition.events.map(event => event.type)).toContain('ArtworkExhibited')
    expect(projectEventsForViewer(transition.events, transition.state, request.playerId)).toEqual(transition.events)
    expect(projectGameForViewer(transition.state, request.playerId).playerBoards[0]!.gallery.artworkSlots[0]).toEqual(exhibited)
    expect(restoreGameState(structuredClone(transition.state))).toEqual(transition.state)
    expect(Object.isFrozen(transition.state)).toBe(true)
    expect(state).toEqual(stateSnapshot)
    expect(request).toEqual(requestSnapshot)
  })

  it('использует подпись контракта при пустом общем запасе и очищает контракт', () => {
    const baseState = structuredClone(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
    const artist = baseState.artistMarket.slots.find(slot => slot.isOpen)!
    const setupSlotIndex = baseState.artistSetup.slots.findIndex(slot => slot.artistId === artist.artistId)
    const signatureTokenId = baseState.artistSetup.slots[setupSlotIndex]!.availableSignatureTokenIds[0]!
    const otherSignatureTokenId = baseState.artistSetup.slots[setupSlotIndex]!.availableSignatureTokenIds[1]!
    const state = {
      ...baseState,
      artistSetup: {
        ...baseState.artistSetup,
        slots: baseState.artistSetup.slots.map((slot, index) => index === setupSlotIndex
          ? { ...slot, availableSignatureTokenIds: [] }
          : slot),
      },
      playerBoards: baseState.playerBoards.map((board, index) => {
        if (index === 0) return { ...board, contract: { artistId: artist.artistId, signatureTokenId } }
        return {
          ...board,
          gallery: {
            ...board.gallery,
            artworkSlots: [{
              artworkId: 'existing-contract-artwork',
              artistId: artist.artistId,
              signatureTokenId: otherSignatureTokenId,
              saleValue: 0,
              isMasterpiece: false,
            }, null, null, null] as const,
          },
        }
      }),
    }
    const artwork = state.artworkMarket.openArtworksByGenre[artist.genre]!.artwork

    const transition = applyArtworkPurchaseToGameState(state, {
      playerId: state.players[0]!.id,
      artistId: artist.artistId,
      purchaseType: 'contract',
      requestedTicketColors: colorsForReward(artwork.ticketReward),
    })

    expect(transition.state.playerBoards[0]!.contract).toBeNull()
    expect(transition.state.playerBoards[0]!.gallery.artworkSlots[0]!.signatureTokenId).toBe(signatureTokenId)
    const locatedSignatureIds = transition.state.playerBoards.flatMap(board => [
      ...(board.contract === null ? [] : [board.contract.signatureTokenId]),
      ...board.gallery.artworkSlots.flatMap(slot => slot === null ? [] : [slot.signatureTokenId]),
    ])
    expect(locatedSignatureIds.filter(id => id === signatureTokenId)).toHaveLength(1)
    expect(locatedSignatureIds.filter(id => id === otherSignatureTokenId)).toHaveLength(1)
  })

  it('доводит художника до 19, выдаёт награду один раз и размещает шедевр', () => {
    const baseState = structuredClone(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
    const artistIndex = baseState.artistMarket.slots.findIndex(slot => slot.isOpen)
    const artist = baseState.artistMarket.slots[artistIndex]!
    const open = baseState.artworkMarket.openArtworksByGenre[artist.genre]!
    const state = {
      ...baseState,
      artistMarket: {
        ...baseState.artistMarket,
        slots: baseState.artistMarket.slots.map((slot, index) => index === artistIndex
          ? { ...slot, fame: 18 }
          : slot),
      },
      players: baseState.players.map((player, index) => index === 0 ? { ...player, coins: 30 } : player),
      artworkMarket: {
        ...baseState.artworkMarket,
        openArtworksByGenre: {
          ...baseState.artworkMarket.openArtworksByGenre,
          [artist.genre]: { ...open, artwork: { ...open.artwork, fameGain: 1 as const } },
        },
      },
    }

    const transition = applyArtworkPurchaseToGameState(state, regularRequest(state))

    expect(transition.state.artistMarket.slots[artistIndex]).toMatchObject({ fame: 19, isSuperstar: true })
    expect(transition.state.playerBoards[0]!.gallery.artworkSlots[0]!.isMasterpiece).toBe(true)
    expect(transition.events.filter(event => event.type === 'ArtistBecameSuperstar')).toHaveLength(1)
    expect(transition.events.some(event => event.type === 'CoinsReceived' && event.coinsReceived === 5)).toBe(true)
  })

  it('оставляет вход неизменным при отказе оплаты', () => {
    const baseState = structuredClone(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
    const state = {
      ...baseState,
      players: baseState.players.map((player, index) => index === 0 ? { ...player, coins: 0 } : player),
    }
    const snapshot = structuredClone(state)

    expect(() => applyArtworkPurchaseToGameState(state, regularRequest(state))).toThrow()
    expect(state).toEqual(snapshot)
  })

  it('отклоняет обычную покупку без доступной подписи без частичных эффектов', () => {
    const baseState = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const artist = baseState.artistMarket.slots.find(slot => slot.isOpen)!
    const state = {
      ...baseState,
      artistSetup: {
        ...baseState.artistSetup,
        slots: baseState.artistSetup.slots.map(slot => slot.artistId === artist.artistId
          ? { ...slot, availableSignatureTokenIds: [] }
          : slot),
      },
    }
    const snapshot = structuredClone(state)

    expect(() => applyArtworkPurchaseToGameState(state, regularRequest(state))).toThrow('no available signature')
    expect(state).toEqual(snapshot)
  })

  it('работа X выдаёт билеты, но не увеличивает известность', () => {
    const baseState = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const artist = baseState.artistMarket.slots.find(slot => slot.isOpen)!
    const oldFame = artist.fame!
    const open = baseState.artworkMarket.openArtworksByGenre[artist.genre]!
    const state = {
      ...baseState,
      artworkMarket: {
        ...baseState.artworkMarket,
        openArtworksByGenre: {
          ...baseState.artworkMarket.openArtworksByGenre,
          [artist.genre]: { ...open, artwork: { ...open.artwork, fameGain: 'X' as const, ticketReward: 'B+R+W' } },
        },
      },
    }

    const transition = applyArtworkPurchaseToGameState(state, regularRequest(state))

    expect(transition.state.artistMarket.slots.find(slot => slot.artistId === artist.artistId)!.fame).toBe(oldFame)
    expect(transition.state.players[0]!.ticketsByColor).toEqual({ B: 1, R: 1, W: 1 })
    expect(transition.events.some(event => event.type === 'ArtistFameIncreased')).toBe(false)
  })

  it('назначает промежуточный подсчёт при опустошении кассы покупкой', () => {
    const baseState = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const artist = baseState.artistMarket.slots.find(slot => slot.isOpen)!
    const open = baseState.artworkMarket.openArtworksByGenre[artist.genre]!
    const state = {
      ...baseState,
      ticketOffice: { ticketsByColor: { B: 1, R: 2, W: 2 } },
      artworkMarket: {
        ...baseState.artworkMarket,
        openArtworksByGenre: {
          ...baseState.artworkMarket.openArtworksByGenre,
          [artist.genre]: { ...open, artwork: { ...open.artwork, ticketReward: 'B' } },
        },
      },
    }

    const transition = applyArtworkPurchaseToGameState(state, regularRequest(state))
    const eventTypes = transition.events.map(event => event.type)

    expect(transition.state.intermediateScoringStatus).toBe('pending')
    expect(eventTypes.filter(type => type === 'IntermediateScoringTriggered')).toHaveLength(1)
    expect(eventTypes.indexOf('IntermediateScoringTriggered')).toBeGreaterThan(
      eventTypes.lastIndexOf('TicketReceived'),
    )
    expect(projectGameForViewer(transition.state, state.players[0]!.id).intermediateScoringStatus)
      .toBe('pending')
  })

  it('применяет отдельный расход влияния на дополнительную известность после базового роста', () => {
    const baseState = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const artist = baseState.artistMarket.slots.find(slot => slot.isOpen)!
    const oldFame = artist.fame!
    const open = baseState.artworkMarket.openArtworksByGenre[artist.genre]!
    const state = {
      ...baseState,
      artworkMarket: {
        ...baseState.artworkMarket,
        openArtworksByGenre: {
          ...baseState.artworkMarket.openArtworksByGenre,
          [artist.genre]: { ...open, artwork: { ...open.artwork, fameGain: 1 as const } },
        },
      },
    }

    const transition = applyArtworkPurchaseToGameState(state, {
      ...regularRequest(state),
      fameTargetInfluence: 5,
    })

    const nextArtist = transition.state.artistMarket.slots.find(slot => slot.artistId === artist.artistId)!
    expect(transition.state.players[0]!.influence).toBe(5)
    expect(nextArtist.fame).toBeGreaterThan(oldFame)
    expect(transition.events.some(event => event.type === 'InfluenceSpent' && event.spentInfluence === 5)).toBe(true)
  })

  it('размещает третью работу-шедевр в четвёртой позиции', () => {
    const baseState = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const artist = baseState.artistMarket.slots.find(slot => slot.isOpen)!
    const artistIndex = baseState.artistMarket.slots.indexOf(artist)
    const open = baseState.artworkMarket.openArtworksByGenre[artist.genre]!
    const existing = (artworkId: string, artistId: string, signatureTokenId: string) => ({
      artworkId, artistId, signatureTokenId, saleValue: 5, isMasterpiece: false,
    })
    const state = {
      ...baseState,
      players: baseState.players.map((player, index) => index === 0 ? { ...player, coins: 30 } : player),
      artistMarket: {
        ...baseState.artistMarket,
        slots: baseState.artistMarket.slots.map((slot, index) => index === artistIndex ? { ...slot, fame: 18 } : slot),
      },
      artworkMarket: {
        ...baseState.artworkMarket,
        openArtworksByGenre: {
          ...baseState.artworkMarket.openArtworksByGenre,
          [artist.genre]: { ...open, artwork: { ...open.artwork, fameGain: 1 as const } },
        },
      },
      playerBoards: baseState.playerBoards.map((board, index) => index === 0 ? {
        ...board,
        gallery: {
          ...board.gallery,
          artworkSlots: [
            existing('old-1', 'other-1', 'other-sig-1'),
            existing('old-2', 'other-2', 'other-sig-2'),
            null,
            null,
          ] as const,
        },
      } : board),
    }

    const transition = applyArtworkPurchaseToGameState(state, regularRequest(state))

    expect(transition.state.playerBoards[0]!.gallery.artworkSlots[2]).toBeNull()
    expect(transition.state.playerBoards[0]!.gallery.artworkSlots[3]).toMatchObject({
      artistId: artist.artistId,
      isMasterpiece: true,
    })
  })

  it('последняя работа оставляет рынок пустым и не расходует visitorBag', () => {
    const baseState = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const artist = baseState.artistMarket.slots.find(slot => slot.isOpen)!
    const state = {
      ...baseState,
      artworkMarket: {
        ...baseState.artworkMarket,
        remainingArtworksByGenre: {
          ...baseState.artworkMarket.remainingArtworksByGenre,
          [artist.genre]: [],
        },
      },
    }
    const visitorBag = structuredClone(state.visitorBag)

    const transition = applyArtworkPurchaseToGameState(state, regularRequest(state))

    expect(transition.state.artworkMarket.openArtworksByGenre[artist.genre]).toBeNull()
    expect(transition.state.visitorBag).toEqual(visitorBag)
    expect(transition.events.some(event => event.type === 'ArtworkMarketRefilled')).toBe(false)
  })
})
