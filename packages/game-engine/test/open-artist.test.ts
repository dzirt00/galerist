import { expectRestoredFixture } from './helpers.js'
import { describe, expect, it } from 'vitest'
import {
  openArtist, applyArtworkPurchaseToGameState, projectGameForViewer, projectEventsForViewer,
  restoreGameState, setupComponentCatalog, type GameState, type OpenArtistRequest,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

/** Подбирает закрытого художника заданной категории и назначает ему тестовый бонус открытия. */
function fixture(reward = 'COINS', category = 'red') {
  const initial = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const artist = initial.artistMarket.slots.find(slot => !slot.isOpen && slot.category === category)!
  const bonus = setupComponentCatalog.artistBonuses.find(item => item.reward === reward)!
  const state: GameState = structuredClone({ ...initial, artistSetup: {
    ...initial.artistSetup, slots: initial.artistSetup.slots.map(slot => slot.artistId === artist.artistId
      ? { ...slot, bonus } : slot),
  } })
  const prepared = state.artistSetup.slots.find(slot => slot.artistId === artist.artistId)!
  const request: OpenArtistRequest = { playerId: state.players[0]!.id, artistId: artist.artistId }
  return { state, artist, prepared, request }
}

/** Задаёт состав посетителей галереи первого игрока для проверки бонуса открытия. */
function withGallery(state: GameState, types: readonly ('B' | 'R' | 'W')[]): GameState {
  return { ...state, playerBoards: state.playerBoards.map((board, index) => index === 0
    ? { ...board, gallery: { ...board.gallery, visitors: types.map((type, i) => ({ id: `gallery-${i}`, type })) } } : board) }
}

/** Рекурсивно проверяет заморозку всех вложенных объектов результата. */
function expectFrozen(value: unknown): void {
  if (!value || typeof value !== 'object') return
  expect(Object.isFrozen(value)).toBe(true)
  Object.values(value).forEach(expectFrozen)
}

/** Рекурсивно проверяет, что входные объекты остались незамороженными. */
function expectUnfrozen(value: unknown): void {
  if (!value || typeof value !== 'object') return
  expect(Object.isFrozen(value)).toBe(false)
  Object.values(value).forEach(expectUnfrozen)
}

describe('ARTIST-001/002 public opening', () => {
  it.each(['red', 'blue'])('opens %s with ordered events, stable signature and public snapshot', category => {
    const { state, artist, prepared, request } = fixture('COINS', category)
    const before = structuredClone(state)
    const result = openArtist(state, request)
    expect(result.events).toEqual([
      { type: 'ArtistOpened', artistId: artist.artistId },
      { type: 'ArtistBonusClaimed', playerId: request.playerId, artistId: artist.artistId, bonusId: prepared.bonus!.id },
      ...(category === 'red' ? [{ type: 'VisitorMoved', visitorId: prepared.collector!.id,
        from: 'artist', to: 'plaza', artistId: artist.artistId }] : []),
      { type: 'ContractSigned', playerId: request.playerId, artistId: artist.artistId,
        signatureTokenId: prepared.availableSignatureTokenIds[0] },
    ])
    expect(result.state.artistMarket.slots.find(slot => slot.artistId === artist.artistId))
      .toMatchObject({ isOpen: true, fame: artist.initialFame })
    expect(result.state.artistSetup.slots.find(slot => slot.artistId === artist.artistId)).toMatchObject({
      isOpen: true, fame: artist.initialFame, bonus: null, collector: null,
      availableSignatureTokenIds: prepared.availableSignatureTokenIds.slice(1),
    })
    expect(result.state.playerBoards[0]!.contract).toEqual({ artistId: artist.artistId,
      signatureTokenId: prepared.availableSignatureTokenIds[0] })
    for (const viewer of [null, ...state.players.map(player => player.id)]) {
      const projection = projectGameForViewer(result.state, viewer)
      expect(projection.playerBoards[0]!.contract).toEqual(result.state.playerBoards[0]!.contract)
      expect(projection.artistSetup.slots).toEqual(result.state.artistSetup.slots)
      expect(projection.artistMarket.slots).toEqual(result.state.artistMarket.slots)
      expect(projectEventsForViewer(result.events, result.state, viewer)).toEqual(result.events)
    }
    expectRestoredFixture(result.state)
    expect(state).toEqual(before)
    expectUnfrozen(state)
    expectFrozen(result)
    const again = structuredClone(result.state)
    expect(() => openArtist(again, request)).toThrow('closed artist')
    expect(again).toEqual(result.state)
  })

  it.each(['COINS', 'INFLUENCE'])('applies %s using gallery counts and resource limits', reward => {
    const { state, request } = fixture(reward)
    const input = withGallery({ ...state, players: state.players.map((player, index) => index === 0
      ? { ...player, influence: 34 } : player) }, ['B', 'B', 'R', 'W'])
    const result = openArtist(input, request)
    expect(result.state.players[0]!.coins).toBe(input.players[0]!.coins + (reward === 'COINS' ? 5 : 0))
    expect(result.state.players[0]!.influence).toBe(reward === 'INFLUENCE' ? 35 : 34)
    expect(result.events[1]).toEqual(reward === 'COINS'
      ? { type: 'CoinsReceived', playerId: request.playerId, coinsReceived: 5 }
      : { type: 'InfluenceReceived', playerId: request.playerId, gainedInfluence: 1 })
  })

  it.each(['plaza', 'visitorBag', 'exhausted'])('visitor bonus uses %s before moving the red collector', source => {
    const { state, request, prepared } = fixture('VISITOR-ANY')
    const visitors = source === 'plaza' ? state.plazaVisitors : source === 'visitorBag' ? state.visitorBag.visitors : []
    const visitor = visitors.find(item => item.type !== 'W')!
    const bag = source === 'exhausted' ? { visitors: [] } : state.visitorBag
    const input: GameState = { ...state, plazaVisitors: source === 'plaza' ? state.plazaVisitors : [],
      visitorBag: bag, artworkMarket: { ...state.artworkMarket, remainingVisitorBag: bag } }
    const result = openArtist(input, { ...request, ...(visitor ? { visitorId: visitor.id } : {}) })
    expect(result.state.playerBoards[0]!.gallery.visitors).toEqual(visitor ? [visitor] : [])
    expect(result.state.plazaVisitors.at(-1)).toEqual(prepared.collector)
    expect(result.state.artworkMarket.remainingVisitorBag).toEqual(result.state.visitorBag)
    expect(result.events.map(event => event.type)).toEqual([
      'ArtistOpened', ...(visitor ? ['VisitorMoved'] : []), 'ArtistBonusClaimed', 'VisitorMoved', 'ContractSigned',
    ])
  })

  it.each(['direct', 'replacement', 'empty', 'missing', 'partial'])('ticket bonus: %s', mode => {
    const { state, request } = fixture('TICKET-DIFF2')
    const office = mode === 'empty' ? { B: 0, R: 0, W: 0 }
      : mode === 'direct' ? { B: 3, R: 3, W: 3 }
      : mode === 'partial' ? { B: 3, R: 0, W: 3 } : { B: 0, R: 3, W: 3 }
    const input: GameState = { ...state, ticketOffice: { ticketsByColor: office },
      ticketDiscard: { B: mode === 'replacement' || mode === 'empty' ? 1 : 0, R: 0, W: 0 } }
    const result = openArtist(input, { ...request, requestedTicketColors: ['B', 'R'],
      replacementColorsByRequestedColor: { B: 'W' } })
    expect(result.state.players[0]!.ticketsByColor.B).toBe(state.players[0]!.ticketsByColor.B
      + (mode === 'direct' || mode === 'replacement' || mode === 'partial' ? 1 : 0))
    expect(result.state.players[0]!.ticketsByColor.R).toBe(state.players[0]!.ticketsByColor.R + (mode === 'empty' || mode === 'partial' ? 0 : 1))
    expect(result.events.some(event => event.type === 'TicketExchanged')).toBe(mode === 'replacement')
    expect(result.state.artistSetup.slots.find(slot => slot.artistId === request.artistId)!.bonus).toBeNull()
    if (mode === 'empty') expect(result.state.ticketDiscard).toEqual(input.ticketDiscard)
  })

  it('taking the last bag visitor preserves the contract and triggers game end after the opening effects', () => {
    const { state, request, prepared } = fixture('VISITOR-ANY')
    const visitor = state.visitorBag.visitors.find(item => item.type === 'B')!
    const bag = { visitors: [visitor] }
    const input: GameState = { ...state, plazaVisitors: [], visitorBag: bag,
      artworkMarket: { ...state.artworkMarket, remainingVisitorBag: bag },
      ticketOffice: { ticketsByColor: { B: 0, R: 0, W: 0 } }, ticketOfficeEmptyReached: true }
    const result = openArtist(input, { ...request, visitorId: visitor.id })
    expect(result.state.visitorBag.visitors).toEqual([])
    expect(result.state.artworkMarket.remainingVisitorBag).toEqual(result.state.visitorBag)
    expect(result.state.plazaVisitors).toEqual([prepared.collector])
    expect(result.state).toMatchObject({ phase: 'ending_current_round', endTriggeredRound: state.round })
    expect(result.events.map(event => event.type)).toEqual([
      'ArtistOpened', 'VisitorMoved', 'ArtistBonusClaimed', 'VisitorMoved', 'ContractSigned', 'EndConditionReached', 'GameEndTriggered',
    ])
    expectRestoredFixture(result.state)
  })

  it('preserves all ticket intermediate/end transitions and their event order', () => {
    const { state, request } = fixture('TICKET-DIFF2')
    const input: GameState = { ...state, visitorBag: { visitors: [] },
      ticketOffice: { ticketsByColor: { B: 1, R: 1, W: 0 } } }
    const result = openArtist(input, { ...request, requestedTicketColors: ['B', 'R'] })
    expect(result.state).toMatchObject({ phase: 'ending_current_round', endTriggeredRound: state.round,
      round: state.round, activePlayerId: state.activePlayerId, ticketOfficeEmptyReached: true,
      intermediateScoringStatus: 'pending' })
    expect(result.events.map(event => event.type)).toEqual([
      'ArtistOpened', 'TicketReceived', 'TicketReceived', 'IntermediateScoringTriggered',
      'EndConditionReached', 'ArtistBonusClaimed', 'VisitorMoved', 'ContractSigned', 'GameEndTriggered',
    ])
    expectRestoredFixture(result.state)
  })

  it('FAME-C can choose the just opened artist, after its initial fame is set', () => {
    const { state, artist, request } = fixture('FAME-C')
    const input = withGallery(state, ['W'])
    const result = openArtist(input, { ...request, fameArtistId: artist.artistId })
    expect(result.state.artistMarket.slots.find(slot => slot.artistId === artist.artistId)!.fame).toBe(artist.initialFame + 1)
    expect(result.events[1]).toEqual({ type: 'ArtistFameIncreased', artistId: artist.artistId,
      previousFame: artist.initialFame, fame: artist.initialFame + 1 })
  })

  it('FAME-C caps fame, updates both galleries and preserves superstar/end effects', () => {
    const { state, request } = fixture('FAME-C')
    const target = state.artistMarket.slots.find(slot => slot.isOpen)!
    let input: GameState = { ...state, players: state.players.map(player => ({ ...player, coins: 30 })) }
    for (const player of input.players) {
      const open: NonNullable<GameState['artworkMarket']['openArtworksByGenre'][typeof target.genre]> = input.artworkMarket.openArtworksByGenre[target.genre]!
      input = { ...input, artworkMarket: { ...input.artworkMarket, openArtworksByGenre: {
        ...input.artworkMarket.openArtworksByGenre,
        [target.genre]: { ...open, artwork: { ...open.artwork, ticketReward: 'B' } },
      } } }
      input = applyArtworkPurchaseToGameState(input, { playerId: player.id, artistId: target.artistId,
        purchaseType: 'regular', requestedTicketColors: ['B'] }).state
    }
    const other = input.artistMarket.slots.find(slot => !slot.isOpen && slot.artistId !== request.artistId)!
    input = withGallery({ ...input, visitorBag: { visitors: [] },
      players: input.players.map(player => ({ ...player, soldArtworkCount: 1 })),
      artistMarket: { ...input.artistMarket, slots: input.artistMarket.slots.map(slot => slot.artistId === target.artistId
        ? { ...slot, fame: 18 } : slot.artistId === other.artistId ? { ...slot, isOpen: true, fame: 19, isSuperstar: true } : slot) },
    }, ['W', 'W'])
    const before = structuredClone(input)
    const result = openArtist(input, { ...request, fameArtistId: target.artistId })
    expect(result.state.artistMarket.slots.find(slot => slot.artistId === target.artistId))
      .toMatchObject({ fame: 19, isSuperstar: true })
    expect(result.state.players[0]!.coins).toBe(input.players[0]!.coins + 5)
    expect(result.state.players[1]!.coins).toBe(input.players[1]!.coins)
    for (const board of result.state.playerBoards) {
      expect(board.gallery.artworkSlots[0]).toMatchObject({ isMasterpiece: true, saleValue: 20 })
    }
    expect(result.events.map(event => event.type)).toEqual([
      'ArtistOpened', 'ArtistFameIncreased', 'ArtworkSaleValuesChanged', 'ArtistBecameSuperstar',
      'CoinsReceived', 'ArtworkBecameMasterpiece', 'ArtworkBecameMasterpiece',
      'ArtistBonusClaimed', 'VisitorMoved', 'ContractSigned', 'EndConditionReached', 'GameEndTriggered',
    ])
    expect(result.state).toMatchObject({ phase: 'ending_current_round', endTriggeredRound: input.round })
    expectRestoredFixture(result.state)
    expect(input).toEqual(before)
  })

  it.each([0, 19])('FAME-C produces no repeated or zero reward (target %i)', fame => {
    const { state, request } = fixture('FAME-C')
    const target = state.artistMarket.slots.find(slot => slot.isOpen)!
    const input: GameState = withGallery({ ...state, artistMarket: { ...state.artistMarket,
      slots: state.artistMarket.slots.map(slot => slot.artistId === target.artistId
        ? { ...slot, fame: fame === 19 ? 19 : target.fame, isSuperstar: fame === 19 } : slot) } }, fame === 19 ? ['W'] : [])
    const result = openArtist(input, { ...request, fameArtistId: target.artistId })
    expect(result.state.players[0]!.coins).toBe(input.players[0]!.coins)
    expect(result.events.map(event => event.type)).toEqual(['ArtistOpened', 'ArtistBonusClaimed', 'VisitorMoved', 'ContractSigned'])
  })

  it.each(['regular_play', 'ending_current_round', 'final_round'] as const)('accepts playing phase %s', phase => {
    const { state, request } = fixture()
    const input: GameState = { ...state, phase, endTriggeredRound: state.round }
    expect(openArtist(input, request).state.phase).toBe(phase)
  })

  it.each(['player', 'phase', 'artist', 'open', 'contract', 'other-contract', 'bonus', 'signature', 'collector', 'tickets', 'visitor', 'fame', 'capacity'])
    ('rejects %s atomically, including late bonus failures', failure => {
      const f = fixture(failure === 'tickets' ? 'TICKET-DIFF2' : failure === 'fame' ? 'FAME-C'
        : ['visitor', 'capacity'].includes(failure) ? 'VISITOR-ANY' : 'COINS')
      let input: GameState = structuredClone(f.state)
      let request = { ...f.request }
      if (failure === 'player') request = { ...request, playerId: 'unknown' }
      if (failure === 'phase') input = structuredClone(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
      if (failure === 'artist') request = { ...request, artistId: 'unknown' }
      if (failure === 'open') request = { ...request, artistId: input.artistMarket.slots.find(slot => slot.isOpen)!.artistId }
      if (failure === 'contract' || failure === 'other-contract') input = { ...input, playerBoards: input.playerBoards.map((board, index) => index === 0
        ? { ...board, contract: { artistId: failure === 'contract' ? f.artist.artistId : input.artistMarket.slots.find(slot => slot.isOpen)!.artistId,
          signatureTokenId: 'existing' } } : board) }
      if (['bonus', 'signature', 'collector'].includes(failure)) input = { ...input, artistSetup: { ...input.artistSetup,
        slots: input.artistSetup.slots.map(slot => slot.artistId === f.artist.artistId ? { ...slot,
          ...(failure === 'bonus' ? { bonus: null } : failure === 'signature' ? { availableSignatureTokenIds: [] } : { collector: null }),
        } : slot) } }
      if (failure === 'tickets') request = { ...request, requestedTicketColors: ['B', 'B'] }
      if (failure === 'visitor') request = { ...request, visitorId: f.prepared.collector!.id }
      if (failure === 'fame') request = { ...request, fameArtistId: input.artistMarket.slots.find(slot => !slot.isOpen && slot.artistId !== f.artist.artistId)!.artistId }
      if (failure === 'capacity') {
        input = withGallery(input, ['W'])
        input = { ...input, plazaVisitors: [{ id: 'another-collector', type: 'W' }] }
        request = { ...request, visitorId: 'another-collector' }
      }
      const before = structuredClone(input)
      const beforeRequest = structuredClone(request)
      expect(() => openArtist(input, request)).toThrow()
      expect(input).toEqual(before)
      expect(request).toEqual(beforeRequest)
      expect(Object.isFrozen(input.players[0])).toBe(false)
    })

  it('rejects restoration of a closed artist without a bonus', () => {
    const { state, request } = fixture()
    const input = { ...state, artistSetup: { ...state.artistSetup, slots: state.artistSetup.slots.map(slot =>
      slot.artistId === request.artistId ? { ...slot, bonus: null } : slot) } }
    expect(() => restoreGameState(input)).toThrow('prepared bonus')
  })

  it('uses the received contract for purchase, retaining the physical signature', () => {
    const { state, request, artist, prepared } = fixture()
    const opened = openArtist({ ...state, players: state.players.map(player => ({ ...player, coins: 30 })) }, request)
    const open = opened.state.artworkMarket.openArtworksByGenre[artist.genre]!
    const purchaseState: GameState = { ...opened.state, artworkMarket: { ...opened.state.artworkMarket,
      openArtworksByGenre: { ...opened.state.artworkMarket.openArtworksByGenre,
        [artist.genre]: { ...open, artwork: { ...open.artwork, ticketReward: 'B' } } } } }
    const bought = applyArtworkPurchaseToGameState(purchaseState, { ...request, purchaseType: 'contract', requestedTicketColors: ['B'] })
    expect(bought.state.playerBoards[0]!.contract).toBeNull()
    expect(bought.state.playerBoards[0]!.gallery.artworkSlots[0]!.signatureTokenId).toBe(prepared.availableSignatureTokenIds[0])
    expect(bought.state.players[0]!.coins).toBe(30 - artist.initialFame)
    expectRestoredFixture(bought.state)
    expect(() => openArtist(bought.state, request)).toThrow('closed artist')
  })
})
