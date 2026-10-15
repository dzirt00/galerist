import { expectRestoredFixture } from './helpers.js'
import { describe, expect, it } from 'vitest'
import {
  applyArtworkSaleToGameState, applyArtworkPurchaseToGameState, projectGameForViewer,
  projectEventsForViewer, restoreGameState, setupComponentCatalog,
  receiveOrder,
  type ArtworkSaleRequest, type ExhibitedArtwork, type GameState, type RegularPlayGameState,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

/** Готовит выставленную работу и подходящий заказ для продажи с посетителем либо без него. */
function fixture(withVisitor = false) {
  const initial = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const artist = initial.artistMarket.slots.find(item => item.isOpen)!
  const prepared = initial.artistSetup.slots.find(item => item.artistId === artist.artistId)!
  const work = setupComponentCatalog.artworks.find(item => item.genre === artist.genre)!
  const order = setupComponentCatalog.orders.find(item => item.genre === artist.genre)!
  const artwork: ExhibitedArtwork = { artworkId: work.id, artistId: artist.artistId, signatureTokenId: prepared.availableSignatureTokenIds[0]!, saleValue: 11, isMasterpiece: false }
  const visitor = initial.plazaVisitors[0]!
  const state: RegularPlayGameState = {
    ...initial,
    artistSetup: { ...initial.artistSetup, slots: initial.artistSetup.slots.map(item => item.artistId === artist.artistId
      ? { ...item, availableSignatureTokenIds: item.availableSignatureTokenIds.filter(id => id !== artwork.signatureTokenId) } : item) },
    playerBoards: initial.playerBoards.map((board, index) => index !== 0 ? board : {
      ...board,
      boardOrders: { ...board.boardOrders, 1: { orderId: order.id, orderStatus: 'unfulfilled', assistant: null } },
      gallery: { artworkSlots: [artwork, null, null, null], visitors: withVisitor ? [visitor] : [] },
    }),
    plazaVisitors: withVisitor ? initial.plazaVisitors.slice(1) : initial.plazaVisitors,
  }
  const request: ArtworkSaleRequest = { playerId: 'player-1', orderId: order.id, artworkId: artwork.artworkId, orderRewardSide: withVisitor && visitor.type === 'R' ? 'influence' : 'coins', ...(withVisitor ? { visitorId: visitor.id } : {}) }
  return { state, request, artwork, visitor }
}

describe('SALE-002 public artwork sale', () => {
  it.each([false, true])('sells with gallery visitor=%s, preserving price, signature and input', withVisitor => {
    const { state, request, artwork, visitor } = fixture(withVisitor)
    const mutable = structuredClone(state)
    const before = structuredClone(mutable)
    const requestBefore = structuredClone(request)
    const result = applyArtworkSaleToGameState(mutable, request)
    const board = result.state.playerBoards[0]!
    expect(result.state.players[0]!.coins).toBe(state.players[0]!.coins + 11)
    expect(result.state.players[0]!.soldArtworkCount).toBe(1)
    expect(result.state.players[0]!.acquiredArtworkCount).toBe(state.players[0]!.acquiredArtworkCount)
    expect(result.state.players[1]).toEqual(state.players[1])
    expect(board.soldArtworkIds).toEqual([artwork.artworkId])
    expect(board.gallery.artworkSlots).toEqual([null, null, null, null])
    expect(board.gallery.visitors).toEqual([])
    expect(board.boardOrders[1]).toEqual({ ...state.playerBoards[0]!.boardOrders[1], orderStatus: 'completed', assistant: null })
    expect(board.orderRewardSides[1]).toBe(request.orderRewardSide)
    expect(result.state.artistSetup.slots.find(item => item.artistId === artwork.artistId)!.availableSignatureTokenIds).toContain(artwork.signatureTokenId)
    expect(result.events).toEqual([
      { type: 'ArtworkSold', playerId: 'player-1', orderId: request.orderId, artworkId: artwork.artworkId, artistId: artwork.artistId, saleValue: 11, soldArtworkCount: 1 },
      { type: 'CoinsReceived', playerId: 'player-1', coinsReceived: 11 },
      { type: 'SignatureReturned', playerId: 'player-1', artistId: artwork.artistId, signatureTokenId: artwork.signatureTokenId },
      ...(withVisitor ? [{ type: 'VisitorMoved', playerId: 'player-1', visitorId: visitor.id, from: 'gallery', to: 'plaza' }] : []),
      { type: 'OrderCompleted', playerId: 'player-1', orderSlot: 1, orderId: request.orderId },
      { type: 'OrderRewardSideSelected', playerId: 'player-1', orderSlot: 1, orderId: request.orderId, orderRewardSide: request.orderRewardSide },
    ])
    expect(result.state.plazaVisitors).toEqual(withVisitor ? [...state.plazaVisitors, visitor] : state.plazaVisitors)
    expect(mutable).toEqual(before)
    expect(Object.isFrozen(mutable)).toBe(false)
    expect(request).toEqual(requestBefore)
    expect(Object.isFrozen(result.state)).toBe(true)
    expect(Object.isFrozen(board.soldArtworkIds)).toBe(true)
    expect(Object.isFrozen(result.events)).toBe(true)
    expect(projectGameForViewer(result.state, 'player-1').availableArtworkSales).toEqual([])
    expect(projectGameForViewer(result.state, null).playerBoards[0]!.soldArtworkIds).toEqual([artwork.artworkId])
    expect(projectEventsForViewer(result.events, result.state, null)).toEqual(result.events)
    expectRestoredFixture(result.state)
  })

  it('compacts the remaining slots in their original order and closes the last masterpiece partition', () => {
    const { state, request, artwork } = fixture()
    const other = setupComponentCatalog.artworks.filter(item => item.genre !== setupComponentCatalog.artworks.find(item => item.id === artwork.artworkId)!.genre)
    const a = { ...artwork, artworkId: other[0]!.id, signatureTokenId: 'other-1' }
    const b = { ...artwork, artworkId: other[1]!.id, signatureTokenId: 'other-2' }
    const input: GameState = { ...state, playerBoards: state.playerBoards.map((board, index) => index === 0
      ? { ...board, gallery: { ...board.gallery, artworkSlots: [a, null, { ...artwork, isMasterpiece: true }, b] } } : board) }
    const result = applyArtworkSaleToGameState(input, request)
    expect(result.state.playerBoards[0]!.gallery.artworkSlots).toEqual([a, b, null, null])
    expect(result.events.find(event => event.type === 'ExhibitionCapacityChanged')).toEqual({ type: 'ExhibitionCapacityChanged', playerId: 'player-1', capacity: 3 })
  })

  it('keeps masterpiece capacity while another masterpiece remains', () => {
    const { state, request, artwork } = fixture()
    const other = setupComponentCatalog.artworks.find(item => item.id !== artwork.artworkId)!
    const input: GameState = { ...state, playerBoards: state.playerBoards.map((board, index) => index === 0
      ? { ...board, gallery: { ...board.gallery, artworkSlots: [{ ...artwork, isMasterpiece: true }, { ...artwork, artworkId: other.id, signatureTokenId: 'other', isMasterpiece: true }, null, null] } } : board) }
    expect(applyArtworkSaleToGameState(input, request).events.some(item => item.type === 'ExhibitionCapacityChanged')).toBe(false)
  })

  it.each([
    { playerId: 'missing' }, { orderId: 'missing' }, { artworkId: 'missing' },
    { orderId: setupComponentCatalog.orders.find(item => item.genre === 'A')!.id }, { visitorId: 'missing' },
  ])('rejects invalid selection %j without partial effects', patch => {
    const { state, request } = fixture()
    const before = structuredClone(state)
    expect(() => applyArtworkSaleToGameState(state, { ...request, ...patch })).toThrow()
    expect(state).toEqual(before)
  })

  it('requires the selected visitor when the gallery has visitors and rejects a plaza visitor', () => {
    const { state, request } = fixture(true)
    expect(() => applyArtworkSaleToGameState(state, { ...request, visitorId: null })).toThrow('Choose a gallery visitor')
    expect(() => applyArtworkSaleToGameState(state, { ...request, visitorId: state.plazaVisitors[0]!.id })).toThrow('Choose a gallery visitor')
  })

  it.each(['completed', 'overflow coins', 'overflow count', 'duplicate signature', 'setup'] as const)('rejects %s atomically', scenario => {
    const { state, request, artwork } = fixture()
    const input: GameState = scenario === 'setup' ? createGameState(twoPlayerGameConfig, twoPlayerConfigs) : {
      ...state,
      players: state.players.map((player, index) => index === 0 ? { ...player,
        coins: scenario === 'overflow coins' ? Number.MAX_SAFE_INTEGER : player.coins,
        soldArtworkCount: scenario === 'overflow count' ? Number.MAX_SAFE_INTEGER : player.soldArtworkCount,
      } : player),
      playerBoards: state.playerBoards.map((board, index) => index === 0 && scenario === 'completed'
        ? { ...board, boardOrders: { ...board.boardOrders, 1: { ...board.boardOrders[1], orderStatus: 'completed' } } } : board),
      artistSetup: scenario === 'duplicate signature' ? { ...state.artistSetup, slots: state.artistSetup.slots.map(item => item.artistId === artwork.artistId
        ? { ...item, availableSignatureTokenIds: [...item.availableSignatureTokenIds, artwork.signatureTokenId] } : item) } : state.artistSetup,
    }
    const before = structuredClone(input)
    expect(() => applyArtworkSaleToGameState(input, request)).toThrow()
    expect(input).toEqual(before)
  })

  it('rejects repeat sale of the same work', () => {
    const { state, request } = fixture()
    const result = applyArtworkSaleToGameState(state, request)
    expect(() => applyArtworkSaleToGameState(result.state, request)).toThrow('Artwork sale is unavailable')
  })

  it('sells a work obtained through the public purchase command and restores the result', () => {
    const initial = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
    const artist = initial.artistMarket.slots.find(item => item.isOpen)!
    const reward = initial.artworkMarket.openArtworksByGenre[artist.genre]!.artwork.ticketReward
    const purchased = applyArtworkPurchaseToGameState(initial, {
      playerId: 'player-1', artistId: artist.artistId, purchaseType: 'regular',
      requestedTicketColors: reward === '—' ? [] : reward === 'B+R+W' ? ['B', 'R', 'W']
        : reward === 'R+(B/W)' ? ['R', 'B'] : reward === 'B+(R/W)' || reward === 'DIFF2' ? ['B', 'R']
          : reward === 'R' ? ['R'] : reward === 'W' ? ['W'] : ['B'],
    }).state
    const order = setupComponentCatalog.orders.find(item => item.genre === artist.genre)!
    const state: GameState = { ...purchased, playerBoards: purchased.playerBoards.map((board, index) => index === 0
      ? { ...board, boardOrders: { ...board.boardOrders, 1: { orderId: order.id, orderStatus: 'unfulfilled', assistant: null } } } : board) }
    const artwork = state.playerBoards[0]!.gallery.artworkSlots[0]!
    const result = applyArtworkSaleToGameState(state, { playerId: 'player-1', orderId: order.id, artworkId: artwork.artworkId, orderRewardSide: 'coins' })
    expect(result.state.players[0]!.coins).toBe(state.players[0]!.coins + artwork.saleValue)
    expect(result.state.players[0]!.soldArtworkCount).toBe(1)
    expect(result.state.players[0]!.acquiredArtworkCount).toBe(1)
    expectRestoredFixture(result.state)
  })

  it.each([undefined, ['missing'], ['WORK-D-01', 'WORK-D-01']])('rejects invalid saved soldArtworkIds=%j', soldArtworkIds => {
    const { state } = fixture()
    const input = { ...state, playerBoards: state.playerBoards.map((board, index) => index === 0 ? { ...board, soldArtworkIds } : board) }
    expect(() => restoreGameState(input)).toThrow('Invalid game state:')
  })

  it('rejects schema 13 and a work in both sold and exhibited areas', () => {
    const { state, artwork } = fixture()
    expect(() => restoreGameState({ ...state, stateSchemaVersion: 13 })).toThrow('stateSchemaVersion')
    expect(() => restoreGameState({ ...state, playerBoards: state.playerBoards.map((board, index) => index === 0
      ? { ...board, soldArtworkIds: [artwork.artworkId] } : board) })).toThrow('Sold artwork cannot be exhibited')
  })

  it('rejects the same sold work on two player boards', () => {
    const { state, request } = fixture()
    const sold = applyArtworkSaleToGameState(state, request).state
    expect(() => restoreGameState({ ...sold, playerBoards: sold.playerBoards.map(board => ({ ...board, soldArtworkIds: [request.artworkId] })) }))
      .toThrow('soldArtworkIds must be unique')
  })
})

describe('SALE-003 completion integrated with sale', () => {
  it.each([
    ['B', undefined, 'coins'], ['R', undefined, 'influence'],
    ['W', 'coins', 'coins'], ['W', 'influence', 'influence'],
    [null, 'coins', 'coins'], [null, 'influence', 'influence'],
  ] as const)('visitor %s and choice %s select %s without paying the back reward', (type, choice, expectedSide) => {
    const { state, request } = fixture()
    const visitor = type === null ? undefined : state.visitorBag.visitors.find(item => item.type === type)!
    const input: GameState = { ...state,
      visitorBag: { ...state.visitorBag, visitors: state.visitorBag.visitors.filter(item => item.id !== visitor?.id) },
      playerBoards: state.playerBoards.map((board, index) => index === 0
        ? { ...board, gallery: { ...board.gallery, visitors: visitor ? [visitor] : [] } } : board),
    }
    const { orderRewardSide: _side, ...selection } = request
    const result = applyArtworkSaleToGameState(input, { ...selection, ...(choice ? { orderRewardSide: choice } : {}), ...(visitor ? { visitorId: visitor.id } : {}) })
    expect(result.state.playerBoards[0]!.boardOrders[1].orderStatus).toBe('completed')
    expect(result.state.playerBoards[0]!.orderRewardSides).toEqual({ 1: expectedSide })
    expect(result.state.players[0]!.coins).toBe(input.players[0]!.coins + 11)
    expect(result.state.players[0]!.influence).toBe(input.players[0]!.influence)
    expect(result.events.filter(event => event.type === 'CoinsReceived')).toHaveLength(1)
    expect(result.events.some(event => event.type === 'InfluenceReceived' || event.type === 'AssistantReturnedHome' || event.type === 'AssistantRemovedFromGame')).toBe(false)
    expect(result.events.slice(-2)).toEqual([
      { type: 'OrderCompleted', playerId: 'player-1', orderSlot: 1, orderId: request.orderId },
      { type: 'OrderRewardSideSelected', playerId: 'player-1', orderSlot: 1, orderId: request.orderId, orderRewardSide: expectedSide },
    ])
    expect(projectGameForViewer(result.state, null).playerBoards[0]!.orderRewardSides).toEqual({ 1: expectedSide })
    expectRestoredFixture(result.state)
  })

  it.each([false, true])('office full=%s returns or permanently removes the assistant', full => {
    const { state, request } = fixture()
    const board = state.playerBoards[0]!
    const assistantId = board.assistants.assistantOfficeIds[0]!
    const hired = full ? board.assistants.assistantHireQueueIds.slice(0, 3) : []
    const officeIds = [...board.assistants.assistantOfficeIds.slice(1), ...hired]
    const queueIds = board.assistants.assistantHireQueueIds.filter(id => !hired.includes(id))
    const input: GameState = { ...state, playerBoards: state.playerBoards.map((item, index) => index === 0 ? {
      ...item,
      assistants: { ...item.assistants, office: officeIds.length, assistantOfficeIds: officeIds, hireQueue: queueIds.length, assistantHireQueueIds: queueIds },
      boardOrders: { ...item.boardOrders, 1: { ...item.boardOrders[1], assistant: assistantId } },
    } : item) }
    const before = structuredClone(input)
    const result = applyArtworkSaleToGameState(input, request)
    const nextBoard = result.state.playerBoards[0]!
    expect(nextBoard.boardOrders[1].assistant).toBeNull()
    expect(nextBoard.assistants.assistantOfficeIds).toEqual(full ? officeIds : [...officeIds, assistantId])
    expect(nextBoard.assistants.office).toBe(full ? 4 : 2)
    expect(nextBoard.assistants.assistantHireQueueIds).toEqual(queueIds)
    expect(result.events.slice(-3).map(event => event.type)).toEqual(['OrderCompleted', full ? 'AssistantRemovedFromGame' : 'AssistantReturnedHome', 'OrderRewardSideSelected'])
    expect(input).toEqual(before)
    expectRestoredFixture(result.state)
    expect(projectEventsForViewer(result.events, result.state, null)).toEqual(result.events)
  })

  it.each([null, 'W', 'B', 'R'] as const)('rejects missing or conflicting side for visitor=%s atomically', type => {
    const { state, request } = fixture()
    const visitor = type === null ? undefined : state.visitorBag.visitors.find(item => item.type === type)!
    const input: GameState = { ...state, playerBoards: state.playerBoards.map((board, index) => index === 0
      ? { ...board, gallery: { ...board.gallery, visitors: visitor ? [visitor] : [] } } : board) }
    const before = structuredClone(input)
    const { orderRewardSide: _side, ...selection } = request
    const invalid: ArtworkSaleRequest = { ...selection,
      ...(visitor ? { visitorId: visitor.id } : {}),
      ...(type === 'B' ? { orderRewardSide: 'influence' as const } : type === 'R' ? { orderRewardSide: 'coins' as const } : {}),
    }
    expect(() => applyArtworkSaleToGameState(input, invalid)).toThrow()
    expect(input).toEqual(before)
  })

  it('rejects invalid runtime side and an inconsistent assistant office before committing any sale effect', () => {
    const { state, request } = fixture()
    expect(() => applyArtworkSaleToGameState(state, { ...request, orderRewardSide: 'invalid' } as unknown as ArtworkSaleRequest)).toThrow('Invalid order reward side')
    const input: GameState = { ...state, playerBoards: state.playerBoards.map((board, index) => index === 0 ? {
      ...board, assistants: { ...board.assistants, office: 3 },
      boardOrders: { ...board.boardOrders, 1: { ...board.boardOrders[1], assistant: 'returning' } },
    } : board) }
    const before = structuredClone(input)
    expect(() => applyArtworkSaleToGameState(input, request)).toThrow('Invalid returning assistant')
    expect(input).toEqual(before)
  })

  it('completes the selected slot 3 and clears its reward orientation when replaced through receiveOrder', () => {
    const { state, request } = fixture()
    const input: GameState = { ...state, playerBoards: state.playerBoards.map((board, index) => index === 0 ? {
      ...board, boardOrders: { ...board.boardOrders, 1: board.boardOrders[3], 3: board.boardOrders[1] },
    } : board) }
    const sold = applyArtworkSaleToGameState(input, request).state
    expect(sold.playerBoards[0]!.orderRewardSides).toEqual({ 3: 'coins' })
    expect(sold.playerBoards[0]!.boardOrders[3].orderStatus).toBe('completed')
    expect(() => applyArtworkSaleToGameState(sold, request)).toThrow('Artwork sale is unavailable')
    const replacement = sold.orderMarket.visibleOrders[1]!
    const replaced = receiveOrder(sold, 'player-1', 'ACCEPT_ORDER', replacement, '3').state
    expect(replaced.playerBoards[0]!.orderRewardSides).toEqual({})
    expect(replaced.playerBoards[0]!.boardOrders[3].orderStatus).toBe('unfulfilled')
    expectRestoredFixture(replaced)
  })

  it.each([undefined, { 1: 'unknown' }, { 4: 'coins' }, { 1: 'coins' }])('rejects damaged saved reward orientations %j', orderRewardSides => {
    const { state } = fixture()
    expect(() => restoreGameState({ ...state, playerBoards: state.playerBoards.map((board, index) => index === 0 ? { ...board, orderRewardSides } : board) })).toThrow('Invalid game state:')
    expect(() => restoreGameState({ ...state, stateSchemaVersion: 14 })).toThrow('stateSchemaVersion')
  })
})
