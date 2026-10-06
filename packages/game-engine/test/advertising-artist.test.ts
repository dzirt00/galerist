import { describe, expect, it } from 'vitest'
import {
  advertisingArtist, projectEventsForViewer, projectGameForViewer, restoreGameState,
  type AdvertisingArtistRequest, type GameState, type VisitorInstance,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function scenario(level = 0, fame = 3) {
  const initial = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const artist = initial.artistMarket.slots.find(slot => slot.initialPromotion === 0)!
  const tokenId = level === 0 ? null : initial.promotionSupply.tokenIdsByLevel[level as 1 | 2 | 3 | 4 | 5][0]!
  const remainingTokens = (level: 1 | 2 | 3 | 4 | 5) => initial.promotionSupply.tokenIdsByLevel[level].filter(id => id !== tokenId)
  const state: GameState = {
    ...initial,
    artistMarket: { ...initial.artistMarket, slots: initial.artistMarket.slots.map(slot => slot.artistId === artist.artistId
      ? { ...slot, isOpen: true, fame, isSuperstar: fame === 19, promotionLevel: level, promotionTokenId: tokenId } : slot) },
    promotionSupply: { tokenIdsByLevel: { 1: remainingTokens(1), 2: remainingTokens(2), 3: remainingTokens(3), 4: remainingTokens(4), 5: remainingTokens(5) } },
  }
  const request: AdvertisingArtistRequest = { playerId: state.players[0]!.id, artistId: artist.artistId }
  return { state, request, artist }
}

function visitors(state: GameState, types: readonly VisitorInstance['type'][]): GameState {
  const selected = types.map((type, index) => ({ id: `gallery-${type}-${index}`, type }))
  return { ...state,
    players: state.players.map((player, index) => index === 0 ? { ...player, soldArtworkCount: selected.filter(v => v.type === 'W').length } : player),
    playerBoards: state.playerBoards.map((board, index) => index === 0
      ? { ...board, gallery: { ...board.gallery, visitors: selected } } : board),
  }
}

describe('PROMO-001/PROMO-002: public atomic promotion', () => {
  it('promotes through all five levels without losing or duplicating any physical token', () => {
    const initial = scenario()
    let state: GameState = initial.state
    for (const level of [1, 2, 3, 4, 5]) {
      const request: AdvertisingArtistRequest = { ...initial.request,
        ...(level === 1 ? { requestedTicketColors: ['B'] as const } : {}),
        ...(level === 3 ? { requestedTicketColors: ['R', 'W'] as const } : {}),
        ...(level === 5 ? { visitorId: state.plazaVisitors.find(visitor => visitor.type !== 'W')!.id } : {}),
      }
      state = { ...state, players: state.players.map(player => ({ ...player, influence: 35 })) }
      state = advertisingArtist(state, request).state
      const artist = state.artistMarket.slots.find(slot => slot.artistId === request.artistId)!
      expect(artist.promotionLevel).toBe(level)
      const ids = [...Object.values(state.promotionSupply.tokenIdsByLevel).flat(), artist.promotionTokenId!]
      expect(ids).toHaveLength(20)
      expect(new Set(ids).size).toBe(20)
      expect(restoreGameState(state)).toEqual(state)
    }
  })

  it('does not charge influence twice when an invalid extra spend follows a ticket reward', () => {
    const { state: frozen, request } = scenario()
    const state = structuredClone(frozen)
    const before = structuredClone(state)
    expect(() => advertisingArtist(state, { ...request, requestedTicketColors: ['B'], targetInfluence: 9 })).toThrow()
    expect(state).toEqual(before)
    expect(state.players[0]!.influence).toBe(10)
    expect(state.players[0]!.ticketsByColor.B).toBe(0)
    expect(Object.isFrozen(state.players[0])).toBe(false)
  })

  it('accepts the first collector with zero sold works and uses that collector for fame', () => {
    const { state: base, request } = scenario(4, 4)
    const visitor: VisitorInstance = { id: 'first-collector', type: 'W' }
    const state = { ...base, plazaVisitors: [visitor] }
    const result = advertisingArtist(state, { ...request, visitorId: visitor.id })
    expect(result.state.players[0]!.soldArtworkCount).toBe(0)
    expect(result.state.artistMarket.slots.find(slot => slot.artistId === request.artistId)!.fame).toBe(6)
    expect(projectGameForViewer(result.state, null).players[0]!.soldArtworkCount).toBe(0)
  })

  it('starts at printed level zero, grants a ticket, preserves IDs and freezes an independent transition', () => {
    const { state, request } = scenario()
    const before = structuredClone(state)
    const command = { ...request, requestedTicketColors: ['B'] as const }
    const result = advertisingArtist(state, command)
    const artist = result.state.artistMarket.slots.find(slot => slot.artistId === request.artistId)!
    expect(artist).toMatchObject({ promotionLevel: 1, promotionTokenId: state.promotionSupply.tokenIdsByLevel[1][0], fame: 4 })
    expect(result.state.promotionSupply.tokenIdsByLevel[1]).toEqual(state.promotionSupply.tokenIdsByLevel[1].slice(1))
    expect(result.state.players[0]!.influence).toBe(9)
    expect(result.state.players[0]!.ticketsByColor.B).toBe(1)
    expect(result.state.ticketOffice.ticketsByColor.B).toBe(state.ticketOffice.ticketsByColor.B - 1)
    expect(result.events.map(event => event.type)).toEqual(['InfluenceSpent', 'ArtistPromoted', 'TicketReceived', 'ArtistFameIncreased'])
    expect(result.events[1]).toMatchObject({ artistId: request.artistId, previousPromotionLevel: 0, promotionLevel: 1 })
    expect(state).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(result.state.players[0])).toBe(true)
    expect(Object.isFrozen(result.state.promotionSupply.tokenIdsByLevel[1])).toBe(true)
    expect(Object.isFrozen(result.events)).toBe(true)
    expect(restoreGameState(result.state)).toEqual(result.state)
    expect(projectGameForViewer(result.state, null).artistMarket.slots).toEqual(result.state.artistMarket.slots)
    expect(projectEventsForViewer(result.events, result.state, null)).toEqual(result.events)
  })

  it('uses the printed starting level without returning a nonexistent physical token', () => {
    const base = scenario().state
    const artist = base.artistMarket.slots.find(slot => slot.initialPromotion === 1)!
    const state: GameState = { ...base, artistMarket: { ...base.artistMarket, slots: base.artistMarket.slots.map(slot =>
      slot.artistId === artist.artistId ? { ...slot, isOpen: true, fame: 4 } : slot) } }
    const result = advertisingArtist(state, { playerId: state.players[0]!.id, artistId: artist.artistId })
    expect(result.state.artistMarket.slots.find(slot => slot.artistId === artist.artistId)!.promotionLevel).toBe(2)
    expect(result.state.promotionSupply.tokenIdsByLevel[1]).toEqual(state.promotionSupply.tokenIdsByLevel[1])
    expect(restoreGameState(result.state)).toEqual(result.state)
  })

  it('returns the installed token, grants influence, then spends the updated influence including target zero', () => {
    const { state: initial, request } = scenario(1)
    const state = visitors(initial, ['R', 'W'])
    const result = advertisingArtist(state, { ...request, targetInfluence: 0 })
    // 10 - 2 + (2 + 1) = 11; spending 11→0 reaches symbols 10, 5, 0.
    expect(result.state.players[0]!.influence).toBe(0)
    expect(result.state.artistMarket.slots.find(slot => slot.artistId === request.artistId)!.fame).toBe(8)
    expect(result.events.filter(event => event.type === 'InfluenceSpent')).toEqual([
      { type: 'InfluenceSpent', playerId: request.playerId, spentInfluence: 2 },
      { type: 'InfluenceSpent', playerId: request.playerId, spentInfluence: 11 },
    ])
    expect(result.events.map(event => event.type)).toEqual(['InfluenceSpent', 'ArtistPromoted', 'InfluenceReceived', 'ArtistFameIncreased', 'InfluenceSpent', 'ArtistFameIncreased'])
    expect(result.state.promotionSupply.tokenIdsByLevel[1]).toHaveLength(4)
    expect(result.state.promotionSupply.tokenIdsByLevel[2]).toHaveLength(3)
    expect(restoreGameState(result.state)).toEqual(result.state)
  })

  it('caps the influence reward and reports only its actual gain', () => {
    const { state: base, request } = scenario(1)
    const withVisitors = visitors(base, ['R', 'R', 'W'])
    const state = { ...withVisitors, players: withVisitors.players.map(player => ({ ...player, influence: 35 })) }
    const result = advertisingArtist(state, request)
    expect(result.state.players[0]!.influence).toBe(35)
    expect(result.events).toContainEqual({ type: 'InfluenceReceived', playerId: request.playerId, gainedInfluence: 2 })
  })

  it('grants two distinct tickets, performs a replacement and retains every returned resource', () => {
    const { state: base, request } = scenario(2)
    const state: GameState = { ...base, ticketOffice: { ticketsByColor: { B: 0, R: 2, W: 2 } }, ticketDiscard: { B: 1, R: 0, W: 0 } }
    const result = advertisingArtist(state, { ...request, requestedTicketColors: ['B', 'R'], replacementColorsByRequestedColor: { B: 'W' } })
    expect(result.state.players[0]!.ticketsByColor).toEqual({ B: 1, R: 1, W: 0 })
    expect(result.state.ticketOffice.ticketsByColor).toEqual({ B: 0, R: 1, W: 1 })
    expect(result.state.ticketDiscard).toEqual({ B: 0, R: 0, W: 1 })
    expect(result.events.map(event => event.type)).toEqual(['InfluenceSpent', 'ArtistPromoted', 'TicketExchanged', 'TicketReceived', 'TicketReceived', 'ArtistFameIncreased'])
  })

  it('finishes the ticket reward and fame growth before triggering the end, and marks intermediate scoring once', () => {
    const { state: base, request } = scenario(2, 18)
    const state: GameState = { ...base, visitorBag: { visitors: [] }, ticketOffice: { ticketsByColor: { B: 1, R: 1, W: 0 } } }
    const result = advertisingArtist(state, { ...request, requestedTicketColors: ['B', 'R'] })
    expect(result.state.phase).toBe('ending_current_round')
    expect(result.state.intermediateScoringStatus).toBe('pending')
    expect(result.state.players[0]!.ticketsByColor).toEqual({ B: 1, R: 1, W: 0 })
    expect(result.events.map(event => event.type)).toEqual(['InfluenceSpent', 'ArtistPromoted', 'TicketReceived', 'TicketReceived',
      'IntermediateScoringTriggered', 'ArtistFameIncreased', 'ArtistBecameSuperstar', 'CoinsReceived', 'GameEndTriggered'])
  })

  it('tolerates an empty ticket office without inventing tickets', () => {
    const { state: base, request } = scenario()
    const state: GameState = { ...base, ticketOffice: { ticketsByColor: { B: 0, R: 0, W: 0 } } }
    const result = advertisingArtist(state, { ...request, requestedTicketColors: ['B'] })
    expect(result.state.players[0]!.ticketsByColor).toEqual(state.players[0]!.ticketsByColor)
    expect(result.events.some(event => event.type === 'TicketReceived')).toBe(false)
    expect(result.state.artistMarket.slots.find(slot => slot.artistId === request.artistId)!.promotionLevel).toBe(1)
  })

  it.each([16, 17])('caps fame after optional spending from fame=%i and grants the superstar reward once', fame => {
    const { state, request } = scenario(0, fame)
    const result = advertisingArtist(state, { ...request, requestedTicketColors: ['B'], targetInfluence: 0 })
    expect(result.state.players[0]!).toMatchObject({ influence: 0, coins: 15 })
    expect(result.state.artistMarket.slots.find(slot => slot.artistId === request.artistId)).toMatchObject({ fame: 19, isSuperstar: true })
    expect(result.events.filter(event => event.type === 'ArtistBecameSuperstar')).toHaveLength(1)
    expect(result.events.filter(event => event.type === 'ArtistFameIncreased').at(-1)).toMatchObject({ previousFame: fame + 1, fame: 19 })
  })

  it('changes all sale values at a new rating while preserving an active contract', () => {
    const { state: base, request, artist } = scenario(0, 4)
    const signatures = base.artistSetup.slots.find(slot => slot.artistId === artist.artistId)!.availableSignatureTokenIds
    const state: GameState = { ...base,
      artistSetup: { ...base.artistSetup, slots: base.artistSetup.slots.map(slot => slot.artistId === artist.artistId ? { ...slot, availableSignatureTokenIds: [] } : slot) },
      playerBoards: base.playerBoards.map((board, index) => index === 0 ? { ...board, contract: { artistId: artist.artistId, signatureTokenId: signatures[0]! } }
        : { ...board, gallery: { ...board.gallery, artworkSlots: [{ artworkId: 'rated-work', artistId: artist.artistId, signatureTokenId: signatures[1]!, saleValue: 5, isMasterpiece: false }, null, null, null] } }),
    }
    const result = advertisingArtist(state, { ...request, requestedTicketColors: ['B'] })
    expect(result.state.playerBoards[0]!.contract).toEqual(state.playerBoards[0]!.contract)
    expect(result.state.playerBoards[1]!.gallery.artworkSlots[0]).toMatchObject({ saleValue: 8, isMasterpiece: false })
    expect(result.events).toContainEqual({ type: 'ArtworkSaleValuesChanged', artistId: artist.artistId, saleValue: 8 })
    expect(result.events.some(event => event.type === 'ArtistBecameSuperstar')).toBe(false)
    expect(restoreGameState(result.state)).toEqual(result.state)
  })

  it('pays the coin reward from gallery investors and collectors, excluding the vestibule', () => {
    const { state: base, request } = scenario(3)
    const state = visitors(base, ['B', 'B', 'W', 'R'])
    const result = advertisingArtist(state, request)
    expect(result.state.players[0]!.coins).toBe(15)
    expect(result.state.players[0]!.influence).toBe(6)
    expect(result.events).toContainEqual({ type: 'CoinsReceived', playerId: request.playerId, coinsReceived: 5 })
  })

  it('moves a collector before fame calculation and updates works in both galleries once', () => {
    const { state: base, request, artist } = scenario(4, 16)
    const withVisitors = visitors(base, ['W'])
    const visitor: VisitorInstance = { id: 'selected-collector', type: 'W' }
    const signatures = base.artistSetup.slots.find(slot => slot.artistId === artist.artistId)!.availableSignatureTokenIds
    const state: GameState = { ...withVisitors, plazaVisitors: [visitor],
      artistSetup: { ...base.artistSetup, slots: base.artistSetup.slots.map(slot => slot.artistId === artist.artistId ? { ...slot, availableSignatureTokenIds: [] } : slot) },
      playerBoards: withVisitors.playerBoards.map((board, index) => ({ ...board, gallery: { ...board.gallery,
        artworkSlots: [{ artworkId: `work-${index}`, artistId: artist.artistId, signatureTokenId: signatures[index]!, saleValue: 17, isMasterpiece: false }, null, null, null] } })),
    }
    const before = structuredClone(state)
    const result = advertisingArtist(state, { ...request, visitorId: visitor.id })
    expect(result.state.plazaVisitors).toEqual([])
    expect(result.state.playerBoards[0]!.gallery.visitors).toHaveLength(2)
    expect(result.state.artistMarket.slots.find(slot => slot.artistId === artist.artistId)).toMatchObject({ fame: 19, isSuperstar: true, promotionLevel: 5 })
    expect(result.state.players[0]!).toMatchObject({ influence: 5, coins: 15, soldArtworkCount: 1 })
    expect(result.state.players[1]).toEqual(state.players[1])
    for (const board of result.state.playerBoards) expect(board.gallery.artworkSlots[0]).toMatchObject({ saleValue: 20, isMasterpiece: true })
    expect(result.events.map(event => event.type)).toEqual(['InfluenceSpent', 'ArtistPromoted', 'VisitorMoved', 'ArtistFameIncreased',
      'ArtworkSaleValuesChanged', 'ArtistBecameSuperstar', 'CoinsReceived', 'ArtworkBecameMasterpiece', 'ArtworkBecameMasterpiece'])
    expect(result.events[3]).toMatchObject({ previousFame: 16, fame: 19 })
    expect(state).toEqual(before)
    expect(restoreGameState(result.state)).toEqual(result.state)
  })

  it('uses the bag only when the plaza is empty and preserves the hidden bag order in projection', () => {
    const { state: base, request } = scenario(4)
    const visitor = base.visitorBag.visitors.find(visitor => visitor.type === 'B')!
    const state = { ...base, plazaVisitors: [] }
    const result = advertisingArtist(state, { ...request, visitorId: visitor.id })
    expect(result.state.visitorBag.visitors).toEqual(state.visitorBag.visitors.filter(item => item.id !== visitor.id))
    expect(result.state.artworkMarket.remainingVisitorBag).toEqual(result.state.visitorBag)
    expect(result.events[2]).toEqual({ type: 'VisitorMoved', visitorId: visitor.id, from: 'visitorBag', to: 'gallery', playerId: request.playerId })
    expect(projectGameForViewer(result.state, null).visitorBag).toEqual({ visitorCount: state.visitorBag.visitors.length - 1 })
  })

  it('continues promoting a superstar without a second fame or coin award', () => {
    const { state, request } = scenario(4, 19)
    const result = advertisingArtist(state, { ...request, visitorId: state.plazaVisitors[0]!.id })
    expect(result.state.players[0]!.coins).toBe(state.players[0]!.coins)
    expect(result.events.map(event => event.type)).toEqual(['InfluenceSpent', 'ArtistPromoted', 'VisitorMoved'])
  })

  it.each(['ending_current_round', 'final_round'] as const)('allows promotion in %s without retriggering game end', phase => {
    const { state: base, request } = scenario()
    const state: GameState = { ...base, phase, endTriggeredRound: 1, ticketOffice: { ticketsByColor: { B: 0, R: 0, W: 0 } }, visitorBag: { visitors: [] } }
    const result = advertisingArtist(state, { ...request, requestedTicketColors: ['B'] })
    expect(result.state.phase).toBe(phase)
    expect(result.events.some(event => event.type === 'GameEndTriggered')).toBe(false)
  })

  it.each(['player', 'board', 'artist', 'closed', 'level', 'supply', 'influence', 'colors', 'replacement', 'target', 'maximum', 'visitor', 'source', 'capacity', 'phase'])(
    'rejects invalid %s atomically', failure => {
      const { state: initial, request: command } = scenario()
      let state: GameState = initial
      let request: AdvertisingArtistRequest = { ...command, requestedTicketColors: ['B'] }
      if (failure === 'player') request = { ...request, playerId: 'missing' }
      if (failure === 'board') state = { ...state, playerBoards: [] }
      if (failure === 'artist') request = { ...request, artistId: 'missing' }
      if (failure === 'closed') state = { ...state, artistMarket: { ...state.artistMarket, slots: state.artistMarket.slots.map(slot => ({ ...slot, isOpen: false })) } }
      if (failure === 'level') state = scenario(5).state
      if (failure === 'supply') state = { ...state, promotionSupply: { tokenIdsByLevel: { ...state.promotionSupply.tokenIdsByLevel, 1: [] } } }
      if (failure === 'influence') state = { ...state, players: state.players.map(player => ({ ...player, influence: 0 })) }
      if (failure === 'colors') { state = scenario(2).state; request = { ...request, requestedTicketColors: ['B', 'B'] } }
      if (failure === 'replacement') request = { ...request, replacementColorsByRequestedColor: { B: 'invalid' } as never }
      if (failure === 'target') request = { ...request, targetInfluence: 9 }
      if (failure === 'maximum') { state = scenario(0, 18).state; request = { ...request, targetInfluence: 0 } }
      if (['visitor', 'source', 'capacity'].includes(failure)) {
        state = scenario(4).state
        if (failure === 'visitor') request = { ...request, visitorId: 'missing' }
        if (failure === 'source') request = { ...request, visitorId: state.visitorBag.visitors[0]!.id }
        if (failure === 'capacity') {
          const collector: VisitorInstance = { id: 'new-collector', type: 'W' }
          state = { ...visitors(state, ['W']), players: state.players, plazaVisitors: [collector] }
          request = { ...request, visitorId: collector.id }
        }
      }
      if (failure === 'phase') state = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
      state = structuredClone(state)
      const before = structuredClone(state)
      const requestBefore = structuredClone(request)
      expect(() => advertisingArtist(state, request)).toThrow()
      expect(state).toEqual(before)
      expect(request).toEqual(requestBefore)
      expect(Object.isFrozen(state.players[0])).toBe(false)
    })
})

describe('promotion and soldArtworkCount snapshot boundary', () => {
  it('prepares all physical tokens in supply and zero sold counts, rejecting the old schema', () => {
    const state = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    expect(state.players.map(player => player.soldArtworkCount)).toEqual([0, 0])
    expect(state.artistMarket.slots.every(slot => slot.promotionLevel === slot.initialPromotion && slot.promotionTokenId === null)).toBe(true)
    expect(Object.values(state.promotionSupply.tokenIdsByLevel).flat()).toHaveLength(20)
    expect(() => restoreGameState({ ...state, stateSchemaVersion: 7 })).toThrow()
  })
  it.each([undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1'])('rejects soldArtworkCount=%s', value => {
    const state = structuredClone(scenario().state)
    Object.assign(state.players[0]!, { soldArtworkCount: value })
    expect(() => restoreGameState(state)).toThrow('soldArtworkCount')
  })
  it.each(['missingLevel', 'missingToken', 'rewardInsteadOfId', 'duplicate', 'wrongLevel', 'lostToken'])('rejects damaged promotion data: %s', failure => {
    const state = structuredClone(scenario().state)
    const artist = state.artistMarket.slots.find(slot => slot.initialPromotion === 0)!
    if (failure === 'missingLevel') Reflect.deleteProperty(artist, 'promotionLevel')
    if (failure === 'missingToken') Reflect.deleteProperty(artist, 'promotionTokenId')
    const ids = state.promotionSupply.tokenIdsByLevel as unknown as Record<number, string[]>
    if (failure === 'rewardInsteadOfId') ids[1]![0] = 'TICKET-ANY'
    if (failure === 'duplicate') ids[1]!.push(ids[1]![0]!)
    if (failure === 'wrongLevel') ids[1]![0] = ids[2]![0]!
    if (failure === 'lostToken') ids[1]!.pop()
    expect(() => restoreGameState(state)).toThrow()
  })
})
