import { describe, expect, it } from 'vitest'
import {
  applyVisitorMovementTickets, projectEventsForViewer, projectGameForViewer, restoreGameState,
  type GameState, type VisitorInstance, type VisitorMovementStep,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function scenario(type: VisitorInstance['type'] = 'B', source: 'plaza' | 'own' | 'other' = 'plaza') {
  const base = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const playerId = base.players[0]!.id
  const otherId = base.players[1]!.id
  const visitor: VisitorInstance = { id: 'moving-visitor', type }
  const state: GameState = {
    ...base,
    players: base.players.map(player => player.id === playerId
      ? { ...player, ticketsByColor: { B: 3, R: 3, W: 3 } } : player),
    plazaVisitors: source === 'plaza' ? [visitor] : [],
    vestibuleVisitors: source === 'plaza' ? [] : [{ playerId: source === 'own' ? playerId : otherId, vestibuleVisitor: visitor }],
  }
  return { state, playerId, otherId, visitor }
}

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return
  expect(Object.isFrozen(value)).toBe(true)
  for (const child of Object.values(value)) expectDeepFrozen(child)
}

describe('MGMT-002/MGMT-003: public atomic visitor movement', () => {
  it.each(['B', 'R', 'W'] as const)('moves the same %s visitor through all three routes in order', type => {
    const { state, playerId, otherId, visitor } = scenario(type, 'other')
    const before = structuredClone(state)
    const steps: readonly VisitorMovementStep[] = [
      { visitorId: visitor.id, destination: 'plaza' },
      { visitorId: visitor.id, destination: 'vestibule' },
      { visitorId: visitor.id, destination: 'gallery' },
    ]
    const result = applyVisitorMovementTickets(state, playerId, steps)
    expect(result.state.players[0]!.ticketsByColor).toEqual({ B: 3, R: 3, W: 3, [type]: 0 })
    expect(result.state.ticketDiscard).toEqual({ ...state.ticketDiscard, [type]: state.ticketDiscard[type] + 3 })
    expect(result.state.ticketOffice).toEqual(state.ticketOffice)
    expect(result.state.plazaVisitors).toEqual([])
    expect(result.state.vestibuleVisitors).toEqual([])
    expect(result.state.playerBoards[0]!.gallery.visitors).toEqual([visitor])
    expect(result.state.playerBoards[1]).toEqual(state.playerBoards[1])
    expect(result.state.players[1]).toEqual(state.players[1])
    expect(result.events).toEqual([
      { type: 'TicketSpent', playerId, color: type },
      { type: 'VisitorMoved', visitorId: visitor.id, from: 'vestibule', to: 'plaza', playerId, fromPlayerId: otherId },
      { type: 'TicketSpent', playerId, color: type },
      { type: 'VisitorMoved', visitorId: visitor.id, from: 'plaza', to: 'vestibule', playerId },
      { type: 'TicketSpent', playerId, color: type },
      { type: 'VisitorMoved', visitorId: visitor.id, from: 'vestibule', to: 'gallery', playerId },
    ])
    expect(state).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(state.players[0]!.ticketsByColor)).toBe(false)
    expectDeepFrozen(result)
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
    for (const viewer of [null, playerId, otherId]) {
      const projection = projectGameForViewer(result.state, viewer)
      expect(projection.playerBoards).toEqual(result.state.playerBoards)
      expect(projection.vestibuleVisitors).toEqual([])
      expect(projection.plazaVisitors).toEqual([])
      expect(projection.ticketDiscard).toEqual(result.state.ticketDiscard)
      expect(projection.players[0]!.ticketsByColor).toEqual(result.state.players[0]!.ticketsByColor)
      expect(projectEventsForViewer(result.events, result.state, viewer)).toEqual(result.events)
    }
  })

  it('spends exactly two tickets for plaza → own vestibule → own gallery', () => {
    const { state: initial, playerId, visitor } = scenario()
    const state = { ...initial, players: initial.players.map(player => player.id === playerId
      ? { ...player, ticketsByColor: { B: 2, R: 0, W: 0 } } : player) }
    const result = applyVisitorMovementTickets(state, playerId, [
      { visitorId: visitor.id, destination: 'vestibule' }, { visitorId: visitor.id, destination: 'gallery' },
    ])
    expect(result.state.players[0]!.ticketsByColor.B).toBe(0)
    expect(result.state.ticketDiscard.B).toBe(state.ticketDiscard.B + 2)
    expect(result.state.playerBoards[0]!.gallery.visitors).toEqual([visitor])
    expect(result.events.map(event => event.type)).toEqual(['TicketSpent', 'VisitorMoved', 'TicketSpent', 'VisitorMoved'])
  })

  it('preserves multiple vestibule entries and ordered IDs across different visitors', () => {
    const { state: base, playerId, visitor } = scenario()
    const second: VisitorInstance = { id: 'second-visitor', type: 'R' }
    const state = { ...base, plazaVisitors: [visitor, second] }
    const result = applyVisitorMovementTickets(state, playerId, [
      { visitorId: second.id, destination: 'vestibule' }, { visitorId: visitor.id, destination: 'vestibule' },
    ])
    expect(result.state.vestibuleVisitors).toEqual([
      { playerId, vestibuleVisitor: second }, { playerId, vestibuleVisitor: visitor },
    ])
    expect(result.events.filter(event => event.type === 'VisitorMoved').map(event => event.visitorId))
      .toEqual([second.id, visitor.id])
    expect(restoreGameState(result.state)).toEqual(result.state)
    expect(projectGameForViewer(result.state, null).vestibuleVisitors).toEqual(result.state.vestibuleVisitors)
  })

  it.each([
    ['plaza', 'plaza'], ['plaza', 'gallery'], ['own', 'plaza'], ['own', 'vestibule'],
    ['other', 'vestibule'], ['other', 'gallery'],
  ] as const)('rejects the forbidden route %s → %s', (source, destination) => {
    const { state, playerId, visitor } = scenario('B', source)
    const before = structuredClone(state)
    expect(() => applyVisitorMovementTickets(state, playerId, [{ visitorId: visitor.id, destination }]))
      .toThrow('Invalid ticket movement route')
    expect(state).toEqual(before)
  })

  it.each([0, 1])('rejects movement from gallery of player index %s', index => {
    const { state: base, playerId, visitor } = scenario()
    const state: GameState = { ...base, plazaVisitors: [], playerBoards: base.playerBoards.map((board, i) => i === index
      ? { ...board, gallery: { ...board.gallery, visitors: [visitor] } } : board) }
    expect(() => applyVisitorMovementTickets(state, playerId, [{ visitorId: visitor.id, destination: 'plaza' }]))
      .toThrow('Visitor is unavailable')
  })

  it.each([0, 1])('allows exactly 1 + %s collectors and rejects the next entry atomically', soldArtworkCount => {
    const { state: base, playerId, visitor } = scenario('W', 'own')
    const existing: VisitorInstance[] = Array.from({ length: soldArtworkCount }, (_, i) => ({ id: `existing-${i}`, type: 'W' }))
    const state: GameState = { ...base,
      players: base.players.map(player => player.id === playerId ? { ...player, soldArtworkCount } : player),
      playerBoards: base.playerBoards.map(board => board.playerId === playerId
        ? { ...board, gallery: { ...board.gallery, visitors: existing } } : board),
    }
    const result = applyVisitorMovementTickets(state, playerId, [{ visitorId: visitor.id, destination: 'gallery' }])
    expect(result.state.playerBoards[0]!.gallery.visitors).toHaveLength(1 + soldArtworkCount)
    expect(result.state.players[0]!.soldArtworkCount).toBe(soldArtworkCount)
    const nextVisitor: VisitorInstance = { id: 'next-collector', type: 'W' }
    const full = { ...result.state, plazaVisitors: [nextVisitor] }
    const before = structuredClone(full)
    expect(() => applyVisitorMovementTickets(full, playerId, [
      { visitorId: nextVisitor.id, destination: 'vestibule' }, { visitorId: nextVisitor.id, destination: 'gallery' },
    ])).toThrow('Collector capacity exceeded')
    expect(full).toEqual(before)
    expect(restoreGameState(result.state)).toEqual(result.state)
  })

  it('checks capacity against preceding entries in the same command', () => {
    const { state: base, playerId, visitor } = scenario('W', 'own')
    const second: VisitorInstance = { id: 'second-collector', type: 'W' }
    const state = { ...base, vestibuleVisitors: [...base.vestibuleVisitors, { playerId, vestibuleVisitor: second }] }
    const before = structuredClone(state)
    expect(() => applyVisitorMovementTickets(state, playerId, [
      { visitorId: visitor.id, destination: 'gallery' }, { visitorId: second.id, destination: 'gallery' },
    ])).toThrow('Collector capacity exceeded')
    expect(state).toEqual(before)
  })

  it('rejects a late ticket shortage without spending the first ticket', () => {
    const { state: base, playerId, visitor } = scenario()
    const state = { ...base, players: base.players.map(player => player.id === playerId
      ? { ...player, ticketsByColor: { B: 1, R: 10, W: 10 } } : player) }
    const before = structuredClone(state)
    expect(() => applyVisitorMovementTickets(state, playerId, [
      { visitorId: visitor.id, destination: 'vestibule' }, { visitorId: visitor.id, destination: 'gallery' },
    ])).toThrow('Insufficient tickets')
    expect(state).toEqual(before)
    expect(Object.isFrozen(state.players[0]!.ticketsByColor)).toBe(false)
  })

  it('rejects a late invalid route and a late missing visitor atomically', () => {
    const { state, playerId, visitor } = scenario()
    const before = structuredClone(state)
    for (const last of [
      { visitorId: visitor.id, destination: 'plaza' as const },
      { visitorId: 'missing', destination: 'gallery' as const },
    ]) {
      expect(() => applyVisitorMovementTickets(state, playerId, [
        { visitorId: visitor.id, destination: 'vestibule' }, last,
      ])).toThrow()
      expect(state).toEqual(before)
    }
  })

  it('validates runtime steps, players and player boards', () => {
    const { state, playerId } = scenario()
    const before = structuredClone(state)
    for (const steps of [null, {}, [null], [undefined], [{ visitorId: 1, destination: 'plaza' }],
      [{ visitorId: 'moving-visitor', destination: 'other-gallery' }]]) {
      expect(() => applyVisitorMovementTickets(state, playerId, steps as unknown as VisitorMovementStep[])).toThrow()
      expect(state).toEqual(before)
    }
    expect(() => applyVisitorMovementTickets(state, 'missing-player', [])).toThrow()
    expect(() => applyVisitorMovementTickets({ ...state, playerBoards: [] }, playerId, [])).toThrow()
  })

  it('accepts frozen inputs and does not freeze or change caller steps', () => {
    const { state, playerId, visitor } = scenario()
    const frozen = restoreGameState(state)
    const steps: VisitorMovementStep[] = [{ visitorId: visitor.id, destination: 'vestibule' }]
    const before = structuredClone(steps)
    const result = applyVisitorMovementTickets(frozen, playerId, steps)
    expectDeepFrozen(result)
    expect(steps).toEqual(before)
    expect(Object.isFrozen(steps[0])).toBe(false)
    expect(frozen.plazaVisitors).toEqual([visitor])
  })

  it('allows playing phases and rejects setup and finished phases', () => {
    const { state, playerId, visitor } = scenario()
    for (const phase of ['regular_play', 'ending_current_round', 'final_round'] as const) {
      expect(applyVisitorMovementTickets({ ...state, phase } as GameState, playerId,
        [{ visitorId: visitor.id, destination: 'vestibule' }]).events).toHaveLength(2)
    }
    for (const phase of ['setup', 'final_scoring', 'finished'] as const) {
      expect(() => applyVisitorMovementTickets({ ...state, phase } as unknown as GameState, playerId, []))
        .toThrow('Visitor movement requires a playing phase')
    }
  })
})
