import { describe, expect, it } from 'vitest'
import {
  advanceTurn, applyTurn, applyEjectionLocationAction, applyEjectionOrderReward, applyEjectionVisitorMovement,
  declineEjectionOpportunity, confirmTurnDraft, createTurnDraft, updateTurnDraft,
  applyArtworkPurchaseToGameState, receiveOrder,
  projectGameForViewer, projectEventsForViewer, restoreGameState, setupComponentCatalog,
  type GameState, type StartingLocationId, type LocationActionCommand, type GameTransition,
  type SetupTicketColor, type OrderCardReward,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerGameConfig, twoPlayerConfigs } from './fixtures.js'

const actor = 'player-1'
const owner = 'player-2'

function scenario(locationId: StartingLocationId = 'LOC-MEDIA_CENTER', pieceType: 'gallerist' | 'assistant' = 'gallerist', office = 2) {
  const initial = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const ownerBoard = initial.playerBoards.find(board => board.playerId === owner)!
  const assistantId = ownerBoard.assistants.assistantOfficeIds[0]!
  const officeIds = pieceType === 'assistant' ? ownerBoard.assistants.assistantHireQueueIds.slice(0, office)
    : ownerBoard.assistants.assistantOfficeIds
  const queueIds = pieceType === 'assistant' ? ownerBoard.assistants.assistantHireQueueIds.slice(office)
    : ownerBoard.assistants.assistantHireQueueIds
  const artist = initial.artistMarket.slots.find(slot => slot.initialPromotion === 0)!
  const closed = initial.artistMarket.slots.find(slot => !slot.isOpen && slot.artistId !== artist.artistId)!
  const coinsBonus = setupComponentCatalog.artistBonuses.find(bonus => bonus.reward === 'COINS')!
  const base: GameState = {
    ...initial, activePlayerId: actor,
    players: initial.players.map(player => ({ ...player, coins: 40, influence: 12, ticketsByColor: { B: 3, R: 3, W: 3 } })),
    playerBoards: initial.playerBoards.map(board => board.playerId !== owner ? { ...board, galleristPosition: 'HOME' }
      : { ...board, galleristPosition: pieceType === 'gallerist' ? locationId : 'HOME',
        assistants: { ...board.assistants, office: officeIds.length, assistantOfficeIds: officeIds,
          hireQueue: queueIds.length, assistantHireQueueIds: queueIds },
        locationAssistants: pieceType === 'assistant' ? [{ assistantId, locationId }] : [],
      }),
    assistantByLocation: { ...initial.assistantByLocation, [locationId]: pieceType === 'assistant'
      ? { playerId: owner, assistantId } : null },
    vestibuleVisitors: [actor, owner].map(playerId => ({ playerId,
      vestibuleVisitor: { id: `${playerId}-vestibule`, type: 'B' as const } })),
    plazaVisitors: [...initial.plazaVisitors, { id: 'ejection-ticket-visitor', type: 'B' }],
    artistMarket: { ...initial.artistMarket, slots: initial.artistMarket.slots.map(slot => slot.artistId === artist.artistId
      ? { ...slot, isOpen: true, fame: 3 } : slot) },
    artistSetup: { ...initial.artistSetup, slots: initial.artistSetup.slots.map(slot => slot.artistId === closed.artistId
      ? { ...slot, bonus: coinsBonus } : slot) },
  }
  const action: LocationActionCommand = locationId === 'LOC-MEDIA_CENTER'
    ? { category: 'location_action', advertisingArtist: { playerId: actor, artistId: artist.artistId, requestedTicketColors: ['B'] } }
    : locationId === 'LOC-SALES_OFFICE'
      ? { category: 'location_action', receiveOrder: { orderActions: [{ typeAction: 'REFRESH' }, { typeAction: 'DECLINE' }] } }
      : locationId === 'LOC-ARTISTS_COLONY'
        ? { category: 'location_action', openArtist: { playerId: actor, artistId: closed.artistId } }
        : { category: 'location_action', placeAuctionBid: { playerId: actor, assistantId: initial.playerBoards[0]!.assistants.assistantOfficeIds[0]!,
          assistantSource: 'office', cellId: 'MARKET-BID-C1-B1', choices: { requestedTicketColors: ['B'] } } }
  const command = confirmTurnDraft(updateTurnDraft(updateTurnDraft(createTurnDraft(actor), {
    type: 'set_movement', movement: { category: 'movement', locationId },
  }), { type: 'set_location_action', locationAction: action }))
  return { state: structuredClone(applyTurn(base, command).state), assistantId, command, artistId: artist.artistId }
}

function expectPublic(result: GameTransition<GameState>) {
  expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
  for (const viewer of [null, actor, owner]) {
    expect(projectGameForViewer(result.state, viewer).pendingEjectionOpportunity).toBeNull()
    expect(projectGameForViewer(result.state, viewer).playerBoards).toEqual(result.state.playerBoards)
    expect(projectEventsForViewer(result.events, result.state, viewer)).toEqual(result.events)
  }
  expect(Object.isFrozen(result)).toBe(true)
  expect(Object.isFrozen(result.state.playerBoards)).toBe(true)
  expect(result.events.every(Object.isFrozen)).toBe(true)
}

function withOrder(state: GameState, completed = false): GameState {
  const orderId = state.orderMarket.visibleOrders[1]!
  return { ...state,
    orderMarket: { ...state.orderMarket, visibleOrders: { ...state.orderMarket.visibleOrders, 1: null } },
    playerBoards: state.playerBoards.map(board => board.playerId !== owner ? board : {
      ...board, boardOrders: { ...board.boardOrders, 1: { orderId, orderStatus: completed ? 'completed' : 'unfulfilled', assistant: null } },
      ...(completed ? { orderRewardSides: { 1: 'coins' as const } } : {}),
    }),
  }
}

describe('EJECT / ADR-003: resolving before advanceTurn', () => {
  it.each(['regular_play', 'ending_current_round'] as const)('blocks advancement in %s and resumes after each resolution', phase => {
    for (const resolve of ['decline', 'tickets', 'order', 'location'] as const) {
      const { state: pending } = scenario()
      const state: GameState = phase === 'regular_play' ? pending
        : { ...pending, status: 'in_progress', activePlayerId: actor, firstPlayerId: owner, phase, endTriggeredRound: pending.round }
      const before = structuredClone(state)
      expect(() => advanceTurn(state)).toThrow('pending ejection opportunity')
      expect(state).toEqual(before)
      const result = resolve === 'decline' ? declineEjectionOpportunity(state, owner)
        : resolve === 'tickets' ? applyEjectionVisitorMovement(state, owner, [{ visitorId: 'ejection-ticket-visitor', destination: 'vestibule' }])
          : resolve === 'order' ? applyEjectionOrderReward(withOrder(state, true), owner, {
            orderSlot: 1, assistantId: state.playerBoards.find(board => board.playerId === owner)!.assistants.assistantOfficeIds[0]!,
          })
            : applyEjectionLocationAction(state, owner, { category: 'location_action', hireAssistants: { playerId: owner, countAssistants: 1, requestedTicketColors: ['B'] } })
      const advanced = advanceTurn(result.state)
      expect(advanced.state.activePlayerId).toBe(owner)
      expect(advanced.state.pendingEjectionOpportunity).toBeNull()
      expect(advanced.events[0]).toEqual({ type: 'TurnEnded', playerId: actor })
      expectPublic(result)
    }
  })
})

describe('EJECT-003: influence payment and location actions', () => {
  it.each([[1, 0], [4, 0], [5, 0], [6, 5], [10, 5], [12, 10], [35, 30]])('pays exactly to previous symbol from %i to %i', (influence, target) => {
    const { state: pending } = scenario()
    const state: GameState = { ...pending, players: pending.players.map(player => player.id === owner ? { ...player, influence } : player) }
    const before = structuredClone(state)
    const result = applyEjectionLocationAction(state, owner, { category: 'location_action', hireAssistants: {
      playerId: actor, countAssistants: 1, requestedTicketColors: ['B'],
    } })
    expect(result.state.players.find(player => player.id === owner)!.influence).toBe(target)
    expect(result.state.players.find(player => player.id === actor)).toEqual(state.players.find(player => player.id === actor))
    expect(result.events[0]).toEqual({ type: 'InfluenceSpent', playerId: owner, spentInfluence: influence - target })
    expect(result.events.slice(-2)).toEqual([{ type: 'EjectionActionPerformed', playerId: owner }, { type: 'GalleristReturnedHome', playerId: owner }])
    expect(result.state.activePlayerId).toBe(actor)
    expect(result.state.round).toBe(state.round)
    expect(state).toEqual(before)
    expectPublic(result)
    expect(() => applyEjectionLocationAction(result.state, owner, { category: 'location_action', hireAssistants: { playerId: owner, countAssistants: 1 } })).toThrow()
  })

  it('pays before advertising and preserves its additional influence cost and events', () => {
    const { state, artistId } = scenario()
    const result = applyEjectionLocationAction(state, owner, { category: 'location_action', advertisingArtist: { playerId: actor, artistId } })
    expect(result.events[0]).toEqual({ type: 'InfluenceSpent', playerId: owner, spentInfluence: 2 })
    expect(result.events.filter(event => event.type === 'InfluenceSpent')).toHaveLength(2)
    expect(result.state.players.find(player => player.id === owner)!.influence).toBeLessThan(10)
    expectPublic(result)
  })

  it.each(['open', 'purchase'] as const)('performs %s at Artists Colony', kind => {
    const { state } = scenario('LOC-ARTISTS_COLONY')
    const artist = state.artistMarket.slots.find(slot => kind === 'open' ? !slot.isOpen : slot.isOpen)!
    let input = state
    if (kind === 'open') {
      const bonus = setupComponentCatalog.artistBonuses.find(item => item.reward === 'COINS')!
      input = { ...state, artistSetup: { ...state.artistSetup, slots: state.artistSetup.slots.map(slot => slot.artistId === artist.artistId ? { ...slot, bonus } : slot) } }
    }
    const work = state.artworkMarket.openArtworksByGenre[artist.genre]!.artwork
    const ticketReward = work.ticketReward
    const requestedTicketColors: readonly SetupTicketColor[] = ticketReward === '—' ? []
      : ticketReward === 'B+R+W' ? ['B', 'R', 'W'] : ticketReward === 'DIFF2' ? ['B', 'R']
        : ticketReward === 'R+(B/W)' ? ['R', 'B'] : ticketReward === 'B+(R/W)' ? ['B', 'R']
          : ticketReward === 'R' ? ['R'] : ticketReward === 'W' ? ['W'] : ['B']
    const result = applyEjectionLocationAction(input, owner, kind === 'open'
      ? { category: 'location_action', openArtist: { playerId: actor, artistId: artist.artistId } }
      : { category: 'location_action', artworkPurchase: { playerId: actor, artistId: artist.artistId, purchaseType: 'regular', requestedTicketColors } })
    expect(kind === 'open' ? result.events.some(event => event.type === 'ArtistOpened')
      : result.state.playerBoards.find(board => board.playerId === owner)!.gallery.artworkSlots.some(slot => slot?.artistId === artist.artistId)).toBe(true)
    expectPublic(result)
  })

  it('receives an order through the full selection and refill path', () => {
    const { state } = scenario('LOC-SALES_OFFICE')
    const orderId = state.orderMarket.visibleOrders[1]!
    const result = applyEjectionLocationAction(state, owner, { category: 'location_action', receiveOrder: {
      orderActions: [{ typeAction: 'ACCEPT_ORDER', orderId, orderSlot: 1 }],
    } })
    expect(result.state.playerBoards.find(board => board.playerId === owner)!.boardOrders[1].orderId).toBe(orderId)
    expect(result.state.players.find(player => player.id === owner)!.status).toBe('SUCCESS')
    expectPublic(result)
    expect(advanceTurn(result.state).state.players.find(player => player.id === owner)!.status).toBe('WAITING')
  })

  it('sells a purchased artwork during the paid Sales Office action', () => {
    const { state: pending } = scenario('LOC-SALES_OFFICE')
    const artist = pending.artistMarket.slots.find(item => item.isOpen)!
    const reward = pending.artworkMarket.openArtworksByGenre[artist.genre]!.artwork.ticketReward
    const colors: readonly SetupTicketColor[] = reward === '—' ? [] : reward === 'B+R+W' ? ['B', 'R', 'W']
      : reward === 'R+(B/W)' ? ['R', 'B'] : reward === 'B+(R/W)' || reward === 'DIFF2' ? ['B', 'R']
        : reward === 'R' ? ['R'] : reward === 'W' ? ['W'] : ['B']
    const purchased = applyArtworkPurchaseToGameState(pending, { playerId: owner, artistId: artist.artistId,
      purchaseType: 'regular', requestedTicketColors: colors }).state
    const orderId = setupComponentCatalog.orders.find(order => order.genre === artist.genre)!.id
    const oldId = purchased.orderMarket.visibleOrders[1]!
    const swap = (id: string) => id === orderId ? oldId : id === oldId ? orderId : id
    const market = purchased.orderMarket
    const prepared: GameState = { ...purchased, orderMarket: { ...market,
      visibleOrders: Object.fromEntries(Object.entries(market.visibleOrders).map(([slot, id]) => [slot, id === null ? null : swap(id)])) as typeof market.visibleOrders,
      orderMarket: Object.fromEntries(Object.entries(market.orderMarket).map(([slot, ids]) => [slot, ids.map(swap)])) as typeof market.orderMarket,
      remainingOrderIds: market.remainingOrderIds.map(swap),
    } }
    const state = receiveOrder(prepared, owner, 'ACCEPT_ORDER', orderId, '1').state
    const artworkId = state.playerBoards.find(board => board.playerId === owner)!.gallery.artworkSlots.find(Boolean)!.artworkId
    const before = structuredClone(state)
    const result = applyEjectionLocationAction(state, owner, { category: 'location_action', artworkSale: {
      playerId: actor, orderId, artworkId, orderRewardSide: 'coins',
    } })
    expect(result.events.some(event => event.type === 'ArtworkSold' && event.playerId === owner)).toBe(true)
    expect(result.state.playerBoards.find(board => board.playerId === owner)!.boardOrders[1].orderStatus).toBe('completed')
    expect(state).toEqual(before)
    expectPublic(result)
  })

  it('removes an unused assistant when the paid hiring action fills the office', () => {
    const { state, assistantId } = scenario('LOC-MEDIA_CENTER', 'assistant', 3)
    const result = applyEjectionLocationAction(state, owner, { category: 'location_action', hireAssistants: {
      playerId: owner, countAssistants: 1, requestedTicketColors: ['B'],
    } })
    expect(result.events.at(-1)).toEqual({ type: 'AssistantRemovedFromGame', playerId: owner, assistantId })
    expect(result.state.playerBoards.find(board => board.playerId === owner)!.assistants.office).toBe(4)
    expectPublic(result)
  })

  it.each(['executor', 'zero', 'negative', 'fraction', 'excess', 'phase', 'wrongLocation', 'mixed', 'malformed', 'unavailable', 'unfinishedOrder'] as const)(
    'rejects %s without paying or returning the piece', fault => {
      const { state: pending } = scenario(fault === 'unfinishedOrder' ? 'LOC-SALES_OFFICE' : 'LOC-MEDIA_CENTER')
      let state = pending
      let action: LocationActionCommand = { category: 'location_action', hireAssistants: { playerId: owner, countAssistants: 1, requestedTicketColors: ['B'] } }
      if (['zero', 'negative', 'fraction', 'excess'].includes(fault)) {
        const influence = fault === 'zero' ? 0 : fault === 'negative' ? -1 : fault === 'fraction' ? 1.5 : 36
        state = { ...state, players: state.players.map(player => player.id === owner ? { ...player, influence } : player) }
      }
      if (fault === 'phase') state = { ...state, status: 'in_progress', phase: 'final_round', activePlayerId: actor, firstPlayerId: actor, endTriggeredRound: state.round }
      if (fault === 'wrongLocation') action = { category: 'location_action', receiveOrder: { orderActions: [{ typeAction: 'DECLINE' }] } }
      if (fault === 'mixed') action = { ...action, openArtist: { playerId: owner, artistId: 'missing' } }
      if (fault === 'malformed') action = null as unknown as LocationActionCommand
      if (fault === 'unavailable') action = { category: 'location_action', hireAssistants: { playerId: owner, countAssistants: 99 } }
      if (fault === 'unfinishedOrder') action = { category: 'location_action', receiveOrder: { orderActions: [{ typeAction: 'REFRESH' }] } }
      const before = structuredClone({ state, action })
      expect(() => applyEjectionLocationAction(state, fault === 'executor' ? actor : owner, action)).toThrow()
      expect({ state, action }).toEqual(before)
      expect(Object.isFrozen(state)).toBe(false)
    },
  )
})

describe('EJECT-003/005: order rewards and placing the ejected assistant', () => {
  it('uses an assistant from another location for the order and returns the ejected gallerist', () => {
    const { state: pending } = scenario()
    const board = pending.playerBoards.find(board => board.playerId === owner)!
    const assistantId = board.assistants.assistantOfficeIds[0]!
    const state = withOrder({ ...pending,
      assistantByLocation: { ...pending.assistantByLocation, 'LOC-SALES_OFFICE': { playerId: owner, assistantId } },
      playerBoards: pending.playerBoards.map(item => item.playerId !== owner ? item : { ...item,
        assistants: { ...item.assistants, office: item.assistants.office - 1, assistantOfficeIds: item.assistants.assistantOfficeIds.slice(1) },
        locationAssistants: [{ assistantId, locationId: 'LOC-SALES_OFFICE' }],
      }),
    }, true)
    const result = applyEjectionOrderReward(state, owner, { orderSlot: 1, assistantId, assistantSource: 'location' })
    expect(result.state.assistantByLocation['LOC-SALES_OFFICE']).toBeNull()
    const next = result.state.playerBoards.find(item => item.playerId === owner)!
    expect(next.locationAssistants).toEqual([])
    expect(next.boardOrders[1].assistant).toBe(assistantId)
    expect(next.assistants.office).toBe(1)
    expectPublic(result)
  })
  it.each(['gallerist', 'assistant'] as const)('uses an office assistant then returns the ejected %s', pieceType => {
    const { state: pending, assistantId } = scenario('LOC-MEDIA_CENTER', pieceType, 3)
    const state = withOrder(pending, true)
    const board = state.playerBoards.find(board => board.playerId === owner)!
    const selected = board.assistants.assistantOfficeIds[0]!
    const result = applyEjectionOrderReward(state, owner, { orderSlot: 1, assistantId: selected })
    const nextBoard = result.state.playerBoards.find(board => board.playerId === owner)!
    expect(nextBoard.boardOrders[1].assistant).toBe(selected)
    expect(nextBoard.assistants.office).toBe(board.assistants.office - (pieceType === 'gallerist' ? 1 : 0))
    if (pieceType === 'assistant') expect(nextBoard.assistants.assistantOfficeIds).toContain(assistantId)
    expect(result.state.players.find(player => player.id === owner)!.influence).toBe(12)
    expect(result.events[0]).toEqual({ type: 'ManagementActionStarted', playerId: owner })
    expect(result.events.some(event => event.type === 'EjectionActionPerformed')).toBe(true)
    expectPublic(result)
  })

  it.each([false, true])('places the ejected assistant on completed=%s order without other assistants', completed => {
    const { state: pending, assistantId } = scenario('LOC-MEDIA_CENTER', 'assistant', 0)
    const state = withOrder(pending, completed)
    const board = state.playerBoards.find(board => board.playerId === owner)!
    const definition = setupComponentCatalog.orders.find(order => order.id === board.boardOrders[1].orderId)!
    const choices = { visitorId: state.plazaVisitors[0]!.id, requestedTicketColors: ['B', 'R'] as const,
      orderActions: [{ typeAction: 'REFRESH' as const }, { typeAction: 'DECLINE' as const }] }
    const before = structuredClone(state)
    expect(definition).toBeDefined()
    const result = applyEjectionOrderReward(state, owner, { orderSlot: 1, assistantId, assistantSource: 'ejected', choices })
    const next = result.state.playerBoards.find(board => board.playerId === owner)!
    expect(next.boardOrders[1].assistant).toBe(assistantId)
    expect(next.ejectedAssistant).toBeNull()
    expect(next.assistants.office).toBe(0)
    expect(result.events.some(event => event.type === 'AssistantReturnedHome' || event.type === 'AssistantRemovedFromGame')).toBe(false)
    expect(result.events.at(-1)).toEqual({ type: 'EjectionActionPerformed', playerId: owner })
    expect(result.events[1]).toEqual({ type: 'AssistantAssignedToOrder', playerId: owner, orderSlot: 1,
      orderId: board.boardOrders[1].orderId, assistantId })
    expect(state).toEqual(before)
    expectPublic(result)
  })

  it.each(['bid', 'reputation'] as const)('uses the ejected assistant for %s without another assistant', kind => {
    const { state: pending, assistantId } = scenario('LOC-INTERNATIONAL_MARKET', 'assistant', 0)
    const work = setupComponentCatalog.artworks.find(work => work.genre === 'D')!
    const state: GameState = { ...pending, playerBoards: pending.playerBoards.map(board => board.playerId === owner
      ? { ...board, soldArtworkIds: [work.id] } : board) }
    const result = applyEjectionLocationAction(state, owner, kind === 'bid'
      ? { category: 'location_action', placeAuctionBid: { playerId: actor, assistantId, assistantSource: 'ejected', cellId: 'MARKET-BID-C1-B3' } }
      : { category: 'location_action', claimReputationToken: { playerId: actor, assistantId, assistantSource: 'ejected', cellId: 'MARKET-REP-C1-D',
        boardCellId: 'BOARD-REP-R2-L', visitorId: `${owner}-vestibule` } })
    expect(result.state.internationalMarket.marketAssistants.some(item => item.playerId === owner && item.assistantId === assistantId)).toBe(true)
    expect(result.state.playerBoards.find(board => board.playerId === owner)!.ejectedAssistant).toBeNull()
    expect(result.events.some(event => (event.type === 'AssistantReturnedHome' || event.type === 'AssistantRemovedFromGame') && event.assistantId === assistantId)).toBe(false)
    expectPublic(result)
  })

  it.each(['bid', 'reputation'] as const)('rolls back payment and assistant placement on a late %s reward failure', kind => {
    const { state: pending, assistantId } = scenario('LOC-INTERNATIONAL_MARKET', 'assistant', 0)
    const work = setupComponentCatalog.artworks.find(work => work.genre === 'D')!
    const state: GameState = { ...pending, playerBoards: pending.playerBoards.map(board => board.playerId === owner
      ? { ...board, soldArtworkIds: [work.id] } : board) }
    const action: LocationActionCommand = kind === 'bid'
      ? { category: 'location_action', placeAuctionBid: { playerId: owner, assistantId, assistantSource: 'ejected',
        cellId: 'MARKET-BID-C1-B6', choices: { visitorId: 'missing' } } }
      : { category: 'location_action', claimReputationToken: { playerId: owner, assistantId, assistantSource: 'ejected',
        cellId: 'MARKET-REP-C1-D', boardCellId: 'BOARD-REP-R1-L', visitorId: `${owner}-vestibule`, choices: { fameArtistId: 'missing' } } }
    const before = structuredClone({ state, action })
    expect(() => applyEjectionLocationAction(state, owner, action)).toThrow()
    expect({ state, action }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
  })

  it.each(['wrongAssistant', 'wrongSource', 'occupied', 'reward', 'executor', 'final'] as const)('rejects invalid order %s atomically', fault => {
    const { state: pending, assistantId } = scenario('LOC-MEDIA_CENTER', 'assistant', 0)
    let state = withOrder(pending, true)
    const command: OrderCardReward = { orderSlot: 1, assistantId, assistantSource: 'ejected' }
    if (fault === 'wrongAssistant') command.assistantId = 'missing'
    if (fault === 'wrongSource') command.assistantSource = 'office'
    if (fault === 'reward') command.choices = null as unknown as NonNullable<OrderCardReward['choices']>
    if (fault === 'occupied') state = { ...state, playerBoards: state.playerBoards.map(board => board.playerId === owner
      ? { ...board, boardOrders: { ...board.boardOrders, 1: { ...board.boardOrders[1], assistant: 'occupied' } } } : board) }
    if (fault === 'final') state = { ...state, phase: 'final_round', status: 'in_progress', activePlayerId: actor, firstPlayerId: actor, endTriggeredRound: state.round }
    const before = structuredClone({ state, command })
    expect(() => applyEjectionOrderReward(state, fault === 'executor' ? actor : owner, command)).toThrow()
    expect({ state, command }).toEqual(before)
  })
})
