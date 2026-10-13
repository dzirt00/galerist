import { describe, expect, it } from 'vitest'
import { claimReputationToken, determineAvailableMarketColumns, placeAuctionBid, projectEventsForViewer,
  projectGameForViewer, restoreGameState, setupComponentCatalog,
  type GameState, type ClaimReputationTokenRequest, type PlaceAuctionBidRequest, type SetupTicketColor } from '../src/index.js'
import { createGameState, startGameAfterSetup, withGameEndConditions } from './helpers.js'
import { twoPlayerConfigs, threePlayerConfigs, fourPlayerConfigs } from './fixtures.js'

function fixture(playerCount: 2 | 3 | 4 = 3): GameState {
  const state = startGameAfterSetup(createGameState({ playerCount, seed: 42 },
    playerCount === 2 ? twoPlayerConfigs : playerCount === 3 ? threePlayerConfigs : fourPlayerConfigs))
  const artist = state.artistMarket.slots[0]!
  return structuredClone({ ...state,
    artistMarket: { ...state.artistMarket, slots: state.artistMarket.slots.map((item, index) => index === 0
      ? { ...item, isOpen: true, fame: 5 } : item) },
    vestibuleVisitors: ['B', 'R', 'W'].map((type, index) => ({ playerId: 'player-1',
      vestibuleVisitor: { id: `vestibule-${index}`, type: type as SetupTicketColor } })),
    plazaVisitors: [{ id: 'reward-visitor', type: 'B' as const }],
    playerBoards: state.playerBoards.map((board, index) => index === 0 ? { ...board,
      soldArtworkIds: setupComponentCatalog.genreOrder.map(genre => setupComponentCatalog.artworks.find(item => item.genre === genre)!.id),
      gallery: { ...board.gallery, visitors: [{ id: 'gallery-investor', type: 'B' as const },
        { id: 'gallery-celebrity', type: 'R' as const }, { id: 'gallery-collector', type: 'W' as const }] },
    } : board),
    players: state.players.map((player, index) => index === 0 ? { ...player, coins: 20, soldArtworkCount: 4, acquiredArtworkCount: 4 } : player),
  })
}
function choices(state: GameState) {
  return { visitorId: 'reward-visitor', fameArtistId: state.artistMarket.slots[0]!.artistId,
    requestedTicketColors: ['B', 'R'] as const }
}
function bidRequest(state: GameState, cellId = 'MARKET-BID-C1-B3'): PlaceAuctionBidRequest {
  const definition = setupComponentCatalog.marketBidCells.find(item => item.id === cellId)!
  return { playerId: 'player-1', cellId, assistantId: 'ASSISTANT-1', assistantSource: 'office',
    choices: { ...choices(state), requestedTicketColors: definition.reward === 'TICKET-ANY' ? ['B'] : ['B', 'R'] } }
}
function reputationRequest(state: GameState, column = 1, genre = 'D', boardCellId = 'BOARD-REP-R2-L'): ClaimReputationTokenRequest {
  return { playerId: 'player-1', cellId: `MARKET-REP-C${column}-${genre}`, assistantId: 'ASSISTANT-1',
    assistantSource: 'office', boardCellId, visitorId: 'vestibule-0', choices: choices(state) }
}
function expectPublic(state: GameState, events: Parameters<typeof projectEventsForViewer>[0]) {
  expect(restoreGameState(JSON.parse(JSON.stringify(state)))).toEqual(state)
  for (const viewer of [null, ...state.players.map(player => player.id)]) {
    expect(projectGameForViewer(state, viewer).internationalMarket.marketAssistants).toEqual(state.internationalMarket.marketAssistants)
    expect(projectGameForViewer(state, viewer).playerBoards).toEqual(state.playerBoards)
    expect(projectEventsForViewer(events, state, viewer)).toEqual(events)
  }
  expect(Object.isFrozen(state)).toBe(true)
  expect(Object.isFrozen(state.internationalMarket.marketAssistants)).toBe(true)
}

describe('MARKET-001 column access', () => {
  const combinations: readonly (readonly SetupTicketColor[])[] = [[], ['B'], ['R'], ['W'], ['B', 'R'], ['B', 'W'], ['R', 'W'], ['B', 'R', 'W']]
  for (const count of [2, 3, 4] as const) {
    it.each(combinations.map(types => ({ types })))(`${count} players: $types`, ({ types }) => {
      const state = fixture(count)
      const input = { ...state, vestibuleVisitors: types.map((type, index) => ({ playerId: 'player-1', vestibuleVisitor: { id: String(index), type } })) }
      const expected = [ ...(types.length ? [1] : []),
        ...(count !== 2 && types.includes('B') && types.includes('R') ? [2] : []),
        ...(types.includes('W') && (types.includes('B') || types.includes('R')) ? [3] : []) ]
      expect(determineAvailableMarketColumns(input, 'player-1')).toEqual(expected)
      expect(() => determineAvailableMarketColumns(input, 'unknown')).toThrow()
    })
  }
  it('ignores other vestibules and all gallery visitors', () => {
    const state = fixture()
    expect(determineAvailableMarketColumns({ ...state, vestibuleVisitors: state.vestibuleVisitors.map(item => ({ ...item, playerId: 'player-2' })) }, 'player-1')).toEqual([])
  })
})

describe('MARKET-004/005 auction bids', () => {
  it.each(setupComponentCatalog.marketBidCells)('$id stores exact bid, emits ordered events and applies reward', cell => {
    const state = fixture()
    const before = structuredClone(state)
    const result = placeAuctionBid(state, bidRequest(state, cell.id))
    expect(state).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(result.state.internationalMarket.marketAssistants).toEqual([{ playerId: 'player-1', cellId: cell.id, assistantId: 'ASSISTANT-1', bid: cell.bid }])
    expect(result.events.slice(0, 4).map(event => event.type)).toEqual(['InfluenceReceived', 'CoinsSpent', 'AuctionBidPlaced', 'AssistantPlacedOnMarket'])
    expect(result.events[0]).toMatchObject({ gainedInfluence: 4 - cell.column })
    expect(result.state.players[0]!.coins).toBe(20 - cell.bid + (cell.reward === 'COINS' ? 3 : 0))
    expect(result.state.players[0]!.influence).toBe(state.players[0]!.influence + 4 - cell.column + (cell.reward === 'INFLUENCE' ? 3 : 0))
    expect(result.state.playerBoards[0]!.assistants.office).toBe(cell.reward === 'HIRE-FREE' ? 2 : 1)
    if (cell.reward === 'TICKET-ANY') expect(result.state.players[0]!.ticketsByColor.B).toBe(state.players[0]!.ticketsByColor.B + 1)
    if (cell.reward === 'TICKET-DIFF2') {
      expect(result.state.players[0]!.ticketsByColor.B).toBe(state.players[0]!.ticketsByColor.B + 1)
      expect(result.state.players[0]!.ticketsByColor.R).toBe(state.players[0]!.ticketsByColor.R + 1)
    }
    if (cell.reward === 'VISITOR-ANY') expect(result.state.playerBoards[0]!.gallery.visitors.at(-1)?.id).toBe('reward-visitor')
    expectPublic(result.state, result.events)
    expect(() => placeAuctionBid(result.state, { ...bidRequest(result.state, cell.id), assistantId: 'ASSISTANT-2' })).toThrow(/occupied/)
  })
  it('column influence can fund a bid and excess converted coins remain', () => {
    const initial = fixture()
    const state = { ...initial, players: initial.players.map((player, index) => index === 0 ? { ...player, coins: 0, influence: 0 } : player) }
    const result = placeAuctionBid(state, { ...bidRequest(state, 'MARKET-BID-C1-B1'), targetInfluence: 0 })
    expect(result.state.players[0]).toMatchObject({ coins: 1, influence: 0 })
    expect(result.events.slice(0, 6).map(item => item.type)).toEqual(['InfluenceReceived', 'InfluenceSpent', 'CoinsReceived', 'CoinsSpent', 'AuctionBidPlaced', 'AssistantPlacedOnMarket'])
    expectPublic(result.state, result.events)
  })
  it('leaving a full office opens the free hire slot without queue rewards', () => {
    const initial = fixture()
    const state = { ...initial, playerBoards: initial.playerBoards.map((board, index) => index === 0 ? { ...board,
      assistants: { office: 4, hireQueue: 6, assistantOfficeIds: ['ASSISTANT-1', 'ASSISTANT-2', 'ASSISTANT-3', 'ASSISTANT-4'],
        assistantHireQueueIds: board.assistants.assistantHireQueueIds.slice(2) } } : board) }
    const result = placeAuctionBid(state, bidRequest(state))
    expect(result.state.playerBoards[0]!.assistants).toMatchObject({ office: 4, hireQueue: 5,
      assistantOfficeIds: ['ASSISTANT-2', 'ASSISTANT-3', 'ASSISTANT-4', 'ASSISTANT-5'] })
    expect(result.events.at(-1)?.type).toBe('AssistantsHired')
    expectPublic(result.state, result.events)
  })
  it.each([1, 3, 6])('rejects unaffordable bid %i atomically', bid => {
    const initial = fixture()
    const state = { ...initial, players: initial.players.map((player, index) => index === 0 ? { ...player, coins: 0, influence: 0 } : player) }
    const before = structuredClone(state)
    expect(() => placeAuctionBid(state, bidRequest(state, `MARKET-BID-C1-B${bid}`))).toThrow(/coins/)
    expect(state).toEqual(before)
  })
  it.each([-1, 36, 1.5, 7, '0', null])('rejects invalid payment target %s', target => {
    const state = fixture()
    const before = structuredClone(state)
    expect(() => placeAuctionBid(state, { ...bidRequest(state), targetInfluence: target } as PlaceAuctionBidRequest)).toThrow()
    expect(state).toEqual(before)
  })
})

describe('MARKET-002/003 reputation', () => {
  for (const column of [1, 2, 3]) {
    it.each(setupComponentCatalog.genreOrder)(`column ${column} genre %s allows sold artwork`, genre => {
      const state = fixture()
      const before = structuredClone(state)
      const request = reputationRequest(state, column, genre)
      const token = state.internationalMarket.marketReputationCells.find(item => item.cellId === request.cellId)!.tokenId
      const result = claimReputationToken(state, request)
      expect(state).toEqual(before)
      expect(Object.isFrozen(state)).toBe(false)
      expect(result.state.players[0]!.influence).toBe(state.players[0]!.influence + 4 - column)
      expect(result.state.playerBoards[0]!.boardReputationTokens).toEqual({ 'BOARD-REP-R2-L': token })
      expect(result.state.internationalMarket.marketReputationCells.some(item => item.cellId === request.cellId)).toBe(false)
      expect(result.state.vestibuleVisitors.some(item => item.vestibuleVisitor.id === request.visitorId)).toBe(false)
      expect(result.state.plazaVisitors.at(-1)?.id).toBe(request.visitorId)
      expect(result.events.map(item => item.type)).toEqual(['InfluenceReceived', 'ReputationTokenClaimed', 'BoardRewardClaimed', 'CoinsReceived', 'VisitorMoved', 'AssistantPlacedOnMarket'])
      expectPublic(result.state, result.events)
      expect(() => claimReputationToken(result.state, { ...reputationRequest(result.state, 1, genre === 'D' ? 'P' : 'D'),
        assistantId: 'ASSISTANT-2', visitorId: 'vestibule-1', boardCellId: 'BOARD-REP-R3-L' })).toThrow(/already owns/)
    })
  }
  it.each(setupComponentCatalog.boardReputationCells)('uses the player choice $id and its reward', cell => {
    const state = fixture()
    const result = claimReputationToken(state, reputationRequest(state, 1, 'D', cell.id))
    expect(Object.keys(result.state.playerBoards[0]!.boardReputationTokens)).toEqual([cell.id])
    expect(result.events[2]).toMatchObject({ type: 'BoardRewardClaimed', boardCellId: cell.id, reward: cell.reward })
    if (cell.reward === 'FAME-C') expect(result.state.artistMarket.slots[0]!.fame).toBe(6)
    if (cell.reward === 'HIRE-FREE') expect(result.state.playerBoards[0]!.assistants.office).toBe(2)
    if (cell.reward === 'COINS') expect(result.state.players[0]!.coins).toBe(23)
    if (cell.reward === 'INFLUENCE') expect(result.state.players[0]!.influence).toBe(state.players[0]!.influence + 6)
    if (cell.reward === 'TICKET-DIFF2') expect(result.events.filter(item => item.type === 'TicketReceived')).toHaveLength(2)
    if (cell.reward === 'VISITOR-ANY') expect(result.state.playerBoards[0]!.gallery.visitors.at(-1)?.id).toBe('reward-visitor')
    expectPublic(result.state, result.events)
  })
  it('an exhibited acquired artwork also unlocks its genre', () => {
    const initial = fixture()
    const artist = initial.artistSetup.slots[0]!
    const signature = artist.availableSignatureTokenIds[0]!
    const state = { ...initial, artistSetup: { ...initial.artistSetup, slots: initial.artistSetup.slots.map((item, index) => index === 0
      ? { ...item, availableSignatureTokenIds: item.availableSignatureTokenIds.slice(1) } : item) },
      playerBoards: initial.playerBoards.map((board, index) => index === 0 ? { ...board, soldArtworkIds: [],
        gallery: { ...board.gallery, artworkSlots: [{ artworkId: setupComponentCatalog.artworks.find(item => item.genre === 'D')!.id,
          artistId: artist.artistId, signatureTokenId: signature, saleValue: 5, isMasterpiece: false }, null, null, null] as const } } : board) }
    const result = claimReputationToken(state, reputationRequest(state))
    expectPublic(result.state, result.events)
  })
  it.each(['genre', 'visitor', 'boardCell', 'token', 'reward'] as const)('rejects missing/invalid %s atomically', reason => {
    const initial = fixture()
    const state = reason === 'genre' ? { ...initial, playerBoards: initial.playerBoards.map((board, index) => index === 0 ? { ...board, soldArtworkIds: [] } : board) }
      : reason === 'token' ? { ...initial, internationalMarket: { ...initial.internationalMarket,
        marketReputationCells: initial.internationalMarket.marketReputationCells.filter(item => item.cellId !== 'MARKET-REP-C1-D') } } : initial
    const request = { ...reputationRequest(state),
      ...(reason === 'visitor' ? { visitorId: 'gallery-investor' } : {}),
      ...(reason === 'boardCell' ? { boardCellId: 'invalid' } : {}),
      ...(reason === 'reward' ? { boardCellId: 'BOARD-REP-R2-R', choices: { requestedTicketColors: ['B', 'B'] as const } } : {}) }
    const before = structuredClone(state)
    expect(() => claimReputationToken(state, request)).toThrow()
    expect(state).toEqual(before)
  })
})

describe('assistant sources and common market boundaries', () => {
  for (const action of ['reputation', 'bid'] as const) {
    it.each(['office', 'location', 'ejected'] as const)(`${action} uses selected %s assistant`, source => {
      const initial = fixture()
      const state = { ...initial, playerBoards: initial.playerBoards.map((board, index) => index === 0 && source !== 'office'
        ? { ...board, assistants: { ...board.assistants, office: 0, assistantOfficeIds: [] },
          locationAssistants: source === 'location' ? [{ assistantId: 'ASSISTANT-1', locationId: 'LOC-MEDIA_CENTER' as const }] : [],
          ejectedAssistant: source === 'ejected' ? { assistantId: 'ASSISTANT-1', displacedByPlayerId: 'player-2' } : null } : board) }
      const result = action === 'bid' ? placeAuctionBid(state, { ...bidRequest(state), assistantSource: source })
        : claimReputationToken(state, { ...reputationRequest(state), assistantSource: source })
      expect(result.state.playerBoards[0]!.locationAssistants).toEqual([])
      expect(result.state.playerBoards[0]!.ejectedAssistant).toBeNull()
      expect(result.state.internationalMarket.marketAssistants[0]!.assistantId).toBe('ASSISTANT-1')
      expectPublic(result.state, result.events)
    })
    it.each(['own', 'different', 'absent', 'final'] as const)(`${action} rejects invalid ejection %s`, reason => {
      const initial = fixture()
      const state = { ...initial, ...(reason === 'final' ? { phase: 'final_round' as const, endTriggeredRound: 1 } : {}),
        playerBoards: initial.playerBoards.map((board, index) => index === 0 ? { ...board,
          assistants: { ...board.assistants, office: 0, assistantOfficeIds: [] },
          ejectedAssistant: reason === 'absent' ? null : { assistantId: reason === 'different' ? 'ASSISTANT-2' : 'ASSISTANT-1',
            displacedByPlayerId: reason === 'own' ? 'player-1' : 'player-2' } } : board) } as GameState
      const before = structuredClone(state)
      expect(() => action === 'bid' ? placeAuctionBid(state, { ...bidRequest(state), assistantSource: 'ejected' })
        : claimReputationToken(state, { ...reputationRequest(state), assistantSource: 'ejected' })).toThrow(/ejected/)
      expect(state).toEqual(before)
    })
    it.each(['unknown', 'queue', 'source', 'column', 'phase', 'player'] as const)(`${action} rejects %s`, reason => {
      const initial = fixture()
      const state = reason === 'column' ? { ...initial, vestibuleVisitors: [] } : initial
      const input = reason === 'phase' ? { ...state, phase: 'setup' } as unknown as GameState : state
      const base = { ...(action === 'bid' ? bidRequest(state) : reputationRequest(state)),
        ...(reason === 'unknown' ? { cellId: 'invalid' } : {}),
        ...(reason === 'queue' ? { assistantId: 'ASSISTANT-3' } : {}),
        ...(reason === 'source' ? { assistantSource: 'invalid' } : {}),
        ...(reason === 'player' ? { playerId: 'invalid' } : {}) }
      const before = structuredClone(input)
      expect(() => action === 'bid' ? placeAuctionBid(input, base as PlaceAuctionBidRequest)
        : claimReputationToken(input, base as ClaimReputationTokenRequest)).toThrow()
      expect(input).toEqual(before)
    })
    it('two players cannot use column 2 for ' + action, () => {
      const state = fixture(2)
      expect(() => action === 'bid' ? placeAuctionBid(state, bidRequest(state, 'MARKET-BID-C2-B1'))
        : claimReputationToken(state, reputationRequest(state, 2))).toThrow()
    })
  }
  it.each([undefined, null, [], {}])('rejects malformed request %s', request => {
    const state = fixture()
    expect(() => claimReputationToken(state, request as ClaimReputationTokenRequest)).toThrow()
    expect(() => placeAuctionBid(state, request as PlaceAuctionBidRequest)).toThrow()
  })
})

describe('market rewards and lifecycle', () => {
  it.each(['reputation', 'bid'] as const)('%s rejects absence of an assistant', action => {
    const initial = fixture()
    const state = { ...initial, playerBoards: initial.playerBoards.map((board, index) => index === 0
      ? { ...board, assistants: { ...board.assistants, office: 0, assistantOfficeIds: [] } } : board) }
    const before = structuredClone(state)
    expect(() => action === 'bid' ? placeAuctionBid(state, bidRequest(state)) : claimReputationToken(state, reputationRequest(state))).toThrow(/Assistant/)
    expect(state).toEqual(before)
  })
  it('rejects insufficient purchasing power even after column influence conversion', () => {
    const initial = fixture()
    const state = { ...initial, players: initial.players.map((player, index) => index === 0 ? { ...player, influence: 0, coins: 0 } : player) }
    const before = structuredClone(state)
    expect(() => placeAuctionBid(state, { ...bidRequest(state, 'MARKET-BID-C1-B6'), targetInfluence: 0 })).toThrow()
    expect(state).toEqual(before)
  })
  it.each(['reputation', 'bid'] as const)('%s uses ticket replacement and skips exhausted tickets', action => {
    const initial = fixture()
    for (const empty of [false, true]) {
      const state = { ...initial, ticketOffice: { ticketsByColor: { B: 0, R: empty ? 0 : 3, W: empty ? 0 : 3 } },
        ticketDiscard: { ...initial.ticketDiscard, B: 1 } }
      const rewardChoices = { requestedTicketColors: ['B', 'R'] as const, replacementColorsByRequestedColor: { B: 'W' as const } }
      const result = action === 'bid' ? placeAuctionBid(state, { ...bidRequest(state, 'MARKET-BID-C3-B1'), choices: rewardChoices })
        : claimReputationToken(state, { ...reputationRequest(state, 1, 'D', 'BOARD-REP-R2-R'), choices: rewardChoices })
      expect(result.events.filter(item => item.type === 'TicketReceived')).toHaveLength(empty ? 0 : 2)
      expect(result.events.filter(item => item.type === 'TicketExchanged')).toHaveLength(empty ? 0 : 1)
      expect(result.state.players[0]!.ticketsByColor.B).toBe(initial.players[0]!.ticketsByColor.B + (empty ? 0 : 1))
      expect(result.state.ticketDiscard.W).toBe(initial.ticketDiscard.W + (empty ? 0 : 1))
      expectPublic(result.state, result.events)
    }
  })
  it.each(['reputation', 'bid'] as const)('%s visitor reward draws from bag only when plaza is empty', action => {
    const initial = fixture()
    const visitor = initial.visitorBag.visitors.find(item => item.type === 'B')!
    const state = { ...initial, plazaVisitors: [] }
    const result = action === 'bid' ? placeAuctionBid(state, { ...bidRequest(state, 'MARKET-BID-C1-B6'), choices: { visitorId: visitor.id } })
      : claimReputationToken(state, { ...reputationRequest(state, 1, 'D', 'BOARD-REP-R3-R'), choices: { visitorId: visitor.id } })
    expect(result.state.visitorBag.visitors.some(item => item.id === visitor.id)).toBe(false)
    expect(result.state.artworkMarket.remainingVisitorBag).toEqual(result.state.visitorBag)
    expect(result.state.playerBoards[0]!.gallery.visitors.at(-1)?.id).toBe(visitor.id)
    expectPublic(result.state, result.events)
  })
  it.each(['reputation', 'bid'] as const)('%s rejects collector overflow and forbidden bag choice atomically', action => {
    const initial = fixture()
    for (const capacity of [false, true]) {
      const state = { ...initial, plazaVisitors: [{ id: 'new-collector', type: 'W' as const }],
        players: initial.players.map((player, index) => index === 0 ? { ...player, soldArtworkCount: 0 } : player) }
      const visitorId = capacity ? 'new-collector' : state.visitorBag.visitors[0]!.id
      const before = structuredClone(state)
      expect(() => action === 'bid' ? placeAuctionBid(state, { ...bidRequest(state, 'MARKET-BID-C1-B6'), choices: { visitorId } })
        : claimReputationToken(state, { ...reputationRequest(state, 1, 'D', 'BOARD-REP-R3-R'), choices: { visitorId } })).toThrow()
      expect(state).toEqual(before)
    }
  })
  it.each(['reputation', 'bid'] as const)('%s skips free hiring when queue is exhausted', action => {
    const initial = fixture()
    const state = { ...initial, playerBoards: initial.playerBoards.map((board, index) => index === 0
      ? { ...board, assistants: { ...board.assistants, hireQueue: 0, assistantHireQueueIds: [] } } : board) }
    const result = action === 'bid' ? placeAuctionBid(state, bidRequest(state))
      : claimReputationToken(state, reputationRequest(state, 1, 'D', 'BOARD-REP-R1-R'))
    expect(result.events.some(event => event.type === 'AssistantsHired')).toBe(false)
    expect(result.state.playerBoards[0]!.assistants.office).toBe(1)
    expectPublic(result.state, result.events)
  })
  it('reputation reward evaluates free hire before the assistant leaves a full office', () => {
    const initial = fixture()
    const state = { ...initial, playerBoards: initial.playerBoards.map((board, index) => index === 0 ? { ...board,
      assistants: { office: 4, hireQueue: 6, assistantOfficeIds: ['ASSISTANT-1', 'ASSISTANT-2', 'ASSISTANT-3', 'ASSISTANT-4'],
        assistantHireQueueIds: board.assistants.assistantHireQueueIds.slice(2) } } : board) }
    const result = claimReputationToken(state, reputationRequest(state, 1, 'D', 'BOARD-REP-R1-R'))
    expect(result.state.playerBoards[0]!.assistants).toMatchObject({ office: 3, hireQueue: 6 })
    expect(result.events.some(event => event.type === 'AssistantsHired')).toBe(false)
    expectPublic(result.state, result.events)
  })
  it.each(['regular_play', 'ending_current_round', 'final_round'] as const)('ticket rewards preserve lifecycle in %s', phase => {
    const initial = fixture()
    const state = { ...withGameEndConditions(initial, 'ticketOffice'), phase,
      ...(phase === 'regular_play' ? {} : { endTriggeredRound: 1 }),
      ticketOffice: { ticketsByColor: { B: 1, R: 0, W: 0 } } } as GameState
    const result = placeAuctionBid(state, bidRequest(state, 'MARKET-BID-C1-B1'))
    expect(result.state.ticketOfficeEmptyReached).toBe(true)
    expect(result.state.phase).toBe(phase === 'regular_play' ? 'ending_current_round' : phase)
    expect(result.events.findIndex(event => event.type === 'AssistantPlacedOnMarket')).toBeLessThan(result.events.findIndex(event => event.type === 'TicketReceived'))
    expect(result.events.some(event => event.type === 'GameEndTriggered')).toBe(phase === 'regular_play')
    expectPublic(result.state, result.events)
  })
  it('rejects invalid reward after payment and placement without mutating input', () => {
    const state = fixture()
    const before = structuredClone(state)
    expect(() => placeAuctionBid(state, { ...bidRequest(state, 'MARKET-BID-C3-B1'), choices: { requestedTicketColors: ['B', 'B'] } })).toThrow()
    expect(state).toEqual(before)
  })
  it('caps column influence at 35', () => {
    const initial = fixture()
    const state = { ...initial, players: initial.players.map((player, index) => index === 0 ? { ...player, influence: 34 } : player) }
    const result = placeAuctionBid(state, bidRequest(state))
    expect(result.state.players[0]!.influence).toBe(35)
    expect(result.events[0]).toMatchObject({ gainedInfluence: 1 })
  })
})

describe('schema 16 market restoration', () => {
  it.each(['old', 'missingPlacements', 'missingBoardTokens', 'missingLocations', 'missingEjection', 'duplicateAssistant',
    'wrongBid', 'invalidCell', 'invalidOwner', 'duplicateCell', 'tokenDuplicate', 'tokenMissing', 'twoTokens'] as const)('rejects %s snapshot atomically', reason => {
    const initial = fixture()
    const state = structuredClone(placeAuctionBid(initial, bidRequest(initial)).state)
    const input = state as unknown as Record<string, any>
    const market = input.internationalMarket
    const board = input.playerBoards[0]
    if (reason === 'old') input.stateSchemaVersion = 15
    if (reason === 'missingPlacements') delete market.marketAssistants
    if (reason === 'missingBoardTokens') delete board.boardReputationTokens
    if (reason === 'missingLocations') delete board.locationAssistants
    if (reason === 'missingEjection') delete board.ejectedAssistant
    if (reason === 'duplicateAssistant') market.marketAssistants[0].assistantId = board.assistants.assistantOfficeIds[0]
    if (reason === 'wrongBid') market.marketAssistants[0].bid = 6
    if (reason === 'invalidCell') market.marketAssistants[0].cellId = 'invalid'
    if (reason === 'invalidOwner') market.marketAssistants[0].playerId = 'invalid'
    if (reason === 'duplicateCell') market.marketAssistants.push({ ...market.marketAssistants[0] })
    if (reason === 'tokenDuplicate') market.marketReputationCells[0].tokenId = market.marketReputationCells[1].tokenId
    if (reason === 'tokenMissing') market.marketReputationCells.shift()
    if (reason === 'twoTokens') board.boardReputationTokens = { 'BOARD-REP-R2-L': 'REP-001', 'BOARD-REP-R3-L': 'REP-002' }
    const before = structuredClone(input)
    expect(() => restoreGameState(input)).toThrow()
    expect(input).toEqual(before)
  })
})
