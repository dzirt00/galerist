import { describe, expect, it } from 'vitest'
import {
  applyArtworkPurchaseToGameState,
  applyArtworkPurchasePaymentToGameState,
  projectEventsForViewer,
  projectGameForViewer,
  restoreGameState,
  type ArtworkPurchaseRequest,
  type GameState,
  type SetupTicketColor,
} from '../src/index.js'
import { createGameState } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

/** Выбирает допустимые тестовые цвета для фиксированной или альтернативной билетной награды. */
describe('acquiredArtworkCount purchase contract', () => {
  it.each([0, 2, Number.MAX_SAFE_INTEGER - 1])('increments only the buyer from %i', count => {
    const initial = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const state: GameState = { ...initial, players: initial.players.map((player, index) => ({
      ...player, acquiredArtworkCount: index === 0 ? count : 5,
    })) }
    const before = structuredClone(state)
    const request = regularRequest(state)
    const payment = applyArtworkPurchasePaymentToGameState(state, request)
    expect(payment.state.players.map(player => player.acquiredArtworkCount)).toEqual([count, 5])
    const transition = applyArtworkPurchaseToGameState(state, request)
    expect(transition.state.players.map(player => player.acquiredArtworkCount)).toEqual([count + 1, 5])
    expect(projectGameForViewer(transition.state, null).players[0]!.acquiredArtworkCount).toBe(count + 1)
    expect(restoreGameState(transition.state)).toEqual(transition.state)
    expect(Object.isFrozen(transition.state.players[0])).toBe(true)
    expect(state).toEqual(before)
  })

  it('leaves counts and state untouched when payment fails', () => {
    const initial = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const state: GameState = { ...initial, players: initial.players.map(player => ({
      ...player, coins: 0, acquiredArtworkCount: 2,
    })) }
    const before = structuredClone(state)
    expect(() => applyArtworkPurchaseToGameState(state, regularRequest(state))).toThrow()
    expect(state).toEqual(before)
  })
})

function colorsForReward(reward: string): readonly SetupTicketColor[] {
  if (reward === '—') return []
  if (reward === 'B' || reward === 'R' || reward === 'W') return [reward]
  if (reward === 'B+R+W') return ['B', 'R', 'W']
  if (reward === 'R+(B/W)') return ['R', 'B']
  if (reward === 'B+(R/W)') return ['B', 'R']
  if (reward === 'DIFF2') return ['B', 'R']
  return ['B']
}

/** Собирает обычную покупку первого игрока с допустимыми цветами награды. */
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

describe('FAME-003: покупка у состоявшейся суперзвезды', () => {
  function superstarPurchase(contract: 'none' | 'matching' | 'other', fameGain: 'X' | 1 = 1) {
    const initial = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const artist = initial.artistMarket.slots.find(slot => slot.isOpen)!
    const contractArtist = contract === 'other'
      ? initial.artistMarket.slots.find(slot => slot.artistId !== artist.artistId)!
      : artist
    const signatureTokenId = initial.artistSetup.slots.find(slot => slot.artistId === contractArtist.artistId)!
      .availableSignatureTokenIds[0]!
    const open = initial.artworkMarket.openArtworksByGenre[artist.genre]!
    const state: GameState = {
      ...initial,
      players: initial.players.map((player, index) => index === 0 ? { ...player, coins: 30 } : player),
      artistMarket: {
        ...initial.artistMarket,
        slots: initial.artistMarket.slots.map(slot => slot.artistId === artist.artistId
          ? { ...slot, fame: 19, isSuperstar: true }
          : slot),
      },
      artistSetup: {
        ...initial.artistSetup,
        slots: initial.artistSetup.slots.map(slot => contract !== 'none' && slot.artistId === contractArtist.artistId
          ? { ...slot, availableSignatureTokenIds: slot.availableSignatureTokenIds.filter(id => id !== signatureTokenId) }
          : slot),
      },
      artworkMarket: {
        ...initial.artworkMarket,
        openArtworksByGenre: {
          ...initial.artworkMarket.openArtworksByGenre,
          [artist.genre]: { ...open, artwork: { ...open.artwork, fameGain, ticketReward: 'B' } },
        },
      },
      playerBoards: initial.playerBoards.map((board, index) => index === 0 ? {
        ...board,
        contract: contract === 'none' ? null : { artistId: contractArtist.artistId, signatureTokenId },
      } : board),
    }
    const request: ArtworkPurchaseRequest = {
      playerId: state.players[0]!.id,
      artistId: artist.artistId,
      purchaseType: 'contract',
      requestedTicketColors: ['B'],
    }
    return { state, request, artist, open, signatureTokenId }
  }

  it.each([
    { contract: 'none', purchaseType: 'regular', error: 'isSuperstar' },
    { contract: 'matching', purchaseType: 'regular', error: 'isSuperstar' },
    { contract: 'none', purchaseType: 'contract', error: 'requires an active contract' },
    { contract: 'other', purchaseType: 'contract', error: 'belongs to another artist' },
  ] as const)('отклоняет $purchaseType с контрактом $contract при свободной галерее', ({ contract, purchaseType, error }) => {
    const { state, request } = superstarPurchase(contract)
    const rejectedRequest = { ...request, purchaseType }
    const before = structuredClone(state)
    const requestBefore = structuredClone(rejectedRequest)

    expect(() => applyArtworkPurchaseToGameState(state, rejectedRequest)).toThrow(error)

    expect(state).toEqual(before)
    expect(rejectedRequest).toEqual(requestBefore)
    expect(Object.isFrozen(state.players[0])).toBe(false)
  })

  it.each(['X', 1] as const)('покупает шедевр по контракту с fameGain=%s без повторной награды суперзвезды', fameGain => {
    const { state, request, artist, open, signatureTokenId } = superstarPurchase('matching', fameGain)
    const before = structuredClone(state)
    const requestBefore = structuredClone(request)

    const transition = applyArtworkPurchaseToGameState(state, request)
    const board = transition.state.playerBoards[0]!
    const exhibited = board.gallery.artworkSlots[0]!

    expect(exhibited).toMatchObject({ artworkId: open.artwork.id, artistId: artist.artistId, signatureTokenId, isMasterpiece: true })
    expect(board.contract).toBeNull()
    expect(transition.state.players[0]!.coins).toBe(30 - artist.initialFame)
    expect(transition.state.players[0]!.ticketsByColor.B).toBe(state.players[0]!.ticketsByColor.B + 1)
    expect(transition.state.players[0]!.acquiredArtworkCount).toBe(state.players[0]!.acquiredArtworkCount + 1)
    expect(transition.state.artistMarket.slots.find(slot => slot.artistId === artist.artistId))
      .toMatchObject({ fame: 19, isSuperstar: true })
    expect(transition.state.artistSetup).toEqual(state.artistSetup)
    expect(transition.state.players[1]).toEqual(state.players[1])
    expect(transition.state.playerBoards[1]).toEqual(state.playerBoards[1])
    expect(transition.events.map(event => event.type)).toEqual([
      'ArtworkSelected', 'CoinsSpent', ...open.visitors.map(() => 'VisitorMoved'),
      'TicketReceived', 'ArtworkExhibited', 'SignaturePriceSet', 'ExhibitionCapacityChanged',
      'ArtworkMarketRefilled',
    ])
    expect(projectGameForViewer(transition.state, null).playerBoards[0]!.gallery.artworkSlots[0]).toEqual(exhibited)
    expect(projectEventsForViewer(transition.events, transition.state, null)).toEqual(transition.events)
    expect(restoreGameState(structuredClone(transition.state))).toEqual(transition.state)
    expect(Object.isFrozen(exhibited)).toBe(true)
    expect(state).toEqual(before)
    expect(request).toEqual(requestBefore)
    expect(Object.isFrozen(state.players[0])).toBe(false)
  })
})

describe('applyArtworkPurchaseToGameState', () => {
  it.each([
    { name: 'покупает четвёртую работу-шедевр по контракту у суперзвезды', superstar: true, contract: 'matching', purchaseType: 'contract', masterpiece: false, full: false, succeeds: true },
    { name: 'покупает четвёртую обычную работу при существующем шедевре', superstar: false, contract: 'none', purchaseType: 'regular', masterpiece: true, full: false, succeeds: true },
    { name: 'отклоняет четвёртую обычную работу без шедевра', superstar: false, contract: 'none', purchaseType: 'regular', masterpiece: false, full: false, succeeds: false },
    { name: 'отклоняет четвёртую контрактную работу у обычного художника', superstar: false, contract: 'matching', purchaseType: 'contract', masterpiece: false, full: false, succeeds: false },
    { name: 'отклоняет контракт другого художника при покупке четвёртой работы', superstar: true, contract: 'other', purchaseType: 'contract', masterpiece: false, full: false, succeeds: false },
    { name: 'отклоняет отсутствие контракта при покупке четвёртой работы', superstar: true, contract: 'none', purchaseType: 'contract', masterpiece: false, full: false, succeeds: false },
    { name: 'отклоняет обычную покупку у суперзвезды даже с подходящим контрактом', superstar: true, contract: 'matching', purchaseType: 'regular', masterpiece: false, full: false, succeeds: false },
    { name: 'отклоняет контрактную покупку шедевра в заполненную галерею', superstar: true, contract: 'matching', purchaseType: 'contract', masterpiece: false, full: true, succeeds: false },
  ] as const)('$name', ({ superstar, contract, purchaseType, masterpiece, full, succeeds }) => {
    const baseState = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const artist = baseState.artistMarket.slots.find(slot => slot.isOpen)!
    const open = baseState.artworkMarket.openArtworksByGenre[artist.genre]!
    const signatureTokenId = baseState.artistSetup.slots.find(slot => slot.artistId === artist.artistId)!
      .availableSignatureTokenIds[0]!
    const existing = (index: number) => ({
      artworkId: `existing-${index}`,
      artistId: `other-artist-${index}`,
      signatureTokenId: `other-signature-${index}`,
      saleValue: 5,
      isMasterpiece: index === 0 && masterpiece,
    })
    const state: GameState = {
      ...baseState,
      players: baseState.players.map((player, index) => index === 0 ? { ...player, coins: 30 } : player),
      artistMarket: {
        ...baseState.artistMarket,
        slots: baseState.artistMarket.slots.map(slot => slot.artistId === artist.artistId
          ? { ...slot, fame: superstar ? 19 : slot.fame, isSuperstar: superstar }
          : slot),
      },
      artworkMarket: {
        ...baseState.artworkMarket,
        openArtworksByGenre: {
          ...baseState.artworkMarket.openArtworksByGenre,
          [artist.genre]: { ...open, artwork: { ...open.artwork, fameGain: 'X', ticketReward: '—' } },
        },
        remainingArtworksByGenre: { ...baseState.artworkMarket.remainingArtworksByGenre, [artist.genre]: [] },
      },
      playerBoards: baseState.playerBoards.map((board, index) => index === 0 ? {
        ...board,
        contract: contract === 'none' ? null : {
          artistId: contract === 'matching' ? artist.artistId : 'other-contract-artist',
          signatureTokenId,
        },
        gallery: {
          ...board.gallery,
          artworkSlots: [existing(0), existing(1), existing(2), full ? existing(3) : null] as const,
        },
      } : board),
    }
    const request: ArtworkPurchaseRequest = { playerId: state.players[0]!.id, artistId: artist.artistId, purchaseType }
    const snapshot = structuredClone(state)
    const requestSnapshot = structuredClone(request)

    if (!succeeds) {
      expect(() => applyArtworkPurchaseToGameState(state, request)).toThrow()
    } else {
      const transition = applyArtworkPurchaseToGameState(state, request)
      const board = transition.state.playerBoards[0]!
      const exhibited = board.gallery.artworkSlots[3]!
      expect(transition.state.players.map(player => player.acquiredArtworkCount)).toEqual([1, 0])
      const paid = purchaseType === 'contract' ? artist.initialFame : artist.fame!
      expect(board.gallery.artworkSlots.slice(0, 3)).toEqual(state.playerBoards[0]!.gallery.artworkSlots.slice(0, 3))
      expect(exhibited).toMatchObject({ artworkId: open.artwork.id, artistId: artist.artistId, signatureTokenId, isMasterpiece: superstar })
      expect(board.contract).toBeNull()
      expect(transition.state.players[0]!.coins).toBe(30 - paid)
      expect(transition.events).toEqual([
        { type: 'ArtworkSelected', playerId: request.playerId, artistId: artist.artistId, artworkId: open.artwork.id },
        { type: 'CoinsSpent', playerId: request.playerId, paid },
        ...open.visitors.map(visitor => ({ type: 'VisitorMoved', visitorId: visitor.id, from: 'artwork', to: 'plaza' })),
        { type: 'ArtworkExhibited', playerId: request.playerId, artistId: artist.artistId, artworkId: open.artwork.id, artworkSlotIndex: 3 },
        { type: 'SignaturePriceSet', signatureTokenId, saleValue: exhibited.saleValue },
        ...(superstar ? [{ type: 'ExhibitionCapacityChanged', playerId: request.playerId, capacity: 4 }] : []),
      ])
      expect(transition.state.plazaVisitors).toEqual([...state.plazaVisitors, ...open.visitors])
      expect(transition.state.artworkMarket.openArtworksByGenre[artist.genre]).toBeNull()
      expect(transition.state.visitorBag).toEqual(state.visitorBag)
      expect(projectGameForViewer(transition.state, request.playerId).playerBoards[0]!.gallery.artworkSlots[3]).toEqual(exhibited)
      expect(projectEventsForViewer(transition.events, transition.state, request.playerId)).toEqual(transition.events)
      expect(Object.isFrozen(transition.state)).toBe(true)
      expect(Object.isFrozen(exhibited)).toBe(true)
    }
    expect(state).toEqual(snapshot)
    expect(request).toEqual(requestSnapshot)
  })

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
    /** Создаёт уже выставленную работу другого художника для проверки вместимости галереи. */
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
