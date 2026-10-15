import { expectRestoredFixture } from './helpers.js'
import { describe, expect, it } from 'vitest'
import {
  applyEjectionVisitorMovement, applyTurn, confirmTurnDraft, createTurnDraft, updateTurnDraft,
  projectGameForViewer, projectEventsForViewer, restoreGameState,
  type GameState, type VisitorMovementStep,
} from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState, startGameAfterSetup } from './helpers.js'

/** Готовит вытеснение выбранной фигуры и два шага перемещения посетителя за билеты. */
function scenario(pieceType: 'assistant' | 'gallerist', office = 0,
  phase: 'regular_play' | 'ending_current_round' = 'regular_play') {
  const base = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const playerId = base.activePlayerId!
  const owner = base.playerBoards.find(board => board.playerId !== playerId)!
  const assistantId = owner.assistants.assistantOfficeIds[0]!
  const available = owner.assistants.assistantHireQueueIds
  const artist = base.artistMarket.slots.find(slot => slot.initialPromotion === 0)!
  const state: GameState = {
    ...(phase === 'ending_current_round' ? { ...base, phase, endTriggeredRound: base.round } : base),
    players: base.players.map(player => player.id === owner.playerId
      ? { ...player, ticketsByColor: { B: 2, R: 0, W: 0 } } : player),
    plazaVisitors: [{ id: 'ejection-visitor', type: 'B' }], vestibuleVisitors: [],
    playerBoards: base.playerBoards.map(board => board.playerId === playerId
      ? { ...board, galleristPosition: 'HOME' }
      : { ...board, galleristPosition: pieceType === 'gallerist' ? 'LOC-MEDIA_CENTER' : 'HOME',
        ...(pieceType === 'assistant' ? {
          assistants: { ...board.assistants, office, assistantOfficeIds: available.slice(0, office),
            hireQueue: available.length - office, assistantHireQueueIds: available.slice(office) },
          locationAssistants: [{ assistantId, locationId: 'LOC-MEDIA_CENTER' as const }],
        } : {}),
      }),
    assistantByLocation: { ...base.assistantByLocation, 'LOC-MEDIA_CENTER': pieceType === 'assistant'
      ? { playerId: owner.playerId, assistantId } : null },
    artistMarket: { ...base.artistMarket, slots: base.artistMarket.slots.map(slot => slot.artistId === artist.artistId
      ? { ...slot, isOpen: true, fame: 3 } : slot) },
  }
  const command = confirmTurnDraft(updateTurnDraft(updateTurnDraft(createTurnDraft(playerId), {
    type: 'set_movement', movement: { category: 'movement', locationId: 'LOC-MEDIA_CENTER' },
  }), {
    type: 'set_location_action', locationAction: { category: 'location_action', advertisingArtist: {
      playerId, artistId: artist.artistId, requestedTicketColors: ['B'],
    } },
  }))
  const pending = structuredClone(applyTurn(state, command).state)
  const steps: VisitorMovementStep[] = [
    { visitorId: 'ejection-visitor', destination: 'vestibule' },
    { visitorId: 'ejection-visitor', destination: 'gallery' },
  ]
  return { pending, ownerId: owner.playerId, playerId, assistantId, steps }
}

/** Рекурсивно проверяет заморозку результата и всех вложенных объектов. */
function expectDeepFrozen(value: unknown): void {
  if (!value || typeof value !== 'object') return
  expect(Object.isFrozen(value)).toBe(true)
  Object.values(value).forEach(expectDeepFrozen)
}

describe('EJECT-003/004/005: ticket management after ejection', () => {
  for (const phase of ['regular_play', 'ending_current_round'] as const) {
    it.each(['gallerist', 'assistant'] as const)('resolves %s management in ' + phase, pieceType => {
      const { pending, ownerId, playerId, assistantId, steps } = scenario(pieceType, 0, phase)
      const before = structuredClone({ pending, steps })
      const result = applyEjectionVisitorMovement(pending, ownerId, steps)
      const owner = result.state.playerBoards.find(board => board.playerId === ownerId)!
      expect(owner.gallery.visitors.at(-1)).toEqual({ id: 'ejection-visitor', type: 'B' })
      expect(owner.galleristPosition).toBe('HOME')
      expect(owner.ejectedAssistant).toBeNull()
      if (pieceType === 'assistant') expect(owner.assistants.assistantOfficeIds).toEqual([assistantId])
      expect(result.state.players.find(player => player.id === ownerId)).toEqual({
        ...pending.players.find(player => player.id === ownerId)!, ticketsByColor: { B: 0, R: 0, W: 0 },
      })
      expect(result.state.players.find(player => player.id === playerId)).toEqual(pending.players.find(player => player.id === playerId))
      expect(result.state.ticketDiscard.B).toBe(pending.ticketDiscard.B + 2)
      expect(result.state.pendingEjectionOpportunity).toBeNull()
      expect(result.state.activePlayerId).toBe(pending.activePlayerId)
      expect(result.state.round).toBe(pending.round)
      expect(result.state.phase).toBe(phase)
      expect(result.events).toEqual([
        { type: 'ManagementActionStarted', playerId: ownerId },
        { type: 'TicketSpent', playerId: ownerId, color: 'B' },
        { type: 'VisitorMoved', playerId: ownerId, visitorId: 'ejection-visitor', from: 'plaza', to: 'vestibule' },
        { type: 'TicketSpent', playerId: ownerId, color: 'B' },
        { type: 'VisitorMoved', playerId: ownerId, visitorId: 'ejection-visitor', from: 'vestibule', to: 'gallery' },
        { type: 'EjectionActionPerformed', playerId: ownerId },
        pieceType === 'gallerist' ? { type: 'GalleristReturnedHome', playerId: ownerId }
          : { type: 'AssistantReturnedHome', playerId: ownerId, assistantId },
      ])
      expectRestoredFixture(result.state)
      for (const viewer of [null, playerId, ownerId]) {
        expect(projectGameForViewer(result.state, viewer).pendingEjectionOpportunity).toBeNull()
        expect(projectGameForViewer(result.state, viewer).playerBoards).toEqual(result.state.playerBoards)
        expect(projectEventsForViewer(result.events, result.state, viewer)).toEqual(result.events)
      }
      expect({ pending, steps }).toEqual(before)
      expect(Object.isFrozen(pending)).toBe(false)
      expectDeepFrozen(result)
      expect(() => applyEjectionVisitorMovement(result.state, ownerId, steps)).toThrow()
    })
  }

  it.each([1, 3, 4])('returns or removes assistant with %i occupied office spaces', office => {
    const { pending, ownerId, assistantId, steps } = scenario('assistant', office)
    const before = structuredClone(pending)
    const result = applyEjectionVisitorMovement(pending, ownerId, steps)
    const board = result.state.playerBoards.find(board => board.playerId === ownerId)!
    expect(board.assistants.office).toBe(Math.min(office + 1, 4))
    expect(board.assistants.assistantOfficeIds.includes(assistantId)).toBe(office < 4)
    expect(board.assistants.assistantHireQueueIds).toEqual(pending.playerBoards.find(board => board.playerId === ownerId)!.assistants.assistantHireQueueIds)
    expect(result.events.at(-1)).toEqual({ type: office === 4 ? 'AssistantRemovedFromGame' : 'AssistantReturnedHome', playerId: ownerId, assistantId })
    expectRestoredFixture(result.state)
    expect(pending).toEqual(before)
  })

  it.each(['executor', 'missing', 'phase', 'status', 'gallerist', 'assistant', 'displacer', 'lateStep', 'tickets', 'steps', 'return'] as const)(
    'rejects invalid %s atomically', fault => {
      const data = scenario(fault === 'gallerist' ? 'gallerist' : 'assistant')
      let state = data.pending
      let steps = data.steps
      const { ownerId, playerId } = data
      if (fault === 'missing') state = { ...state, pendingEjectionOpportunity: null }
      if (fault === 'phase') state = { ...state, status: 'in_progress', activePlayerId: playerId, firstPlayerId: playerId, phase: 'final_round', endTriggeredRound: state.round }
      if (fault === 'status') state = { ...state, status: 'finished' } as GameState
      if (fault === 'gallerist' || fault === 'assistant' || fault === 'return') state = {
        ...state, playerBoards: state.playerBoards.map(board => board.playerId !== ownerId ? board : {
          ...board, ...(fault === 'gallerist' ? { galleristPosition: 'HOME' as const }
            : fault === 'assistant' ? { ejectedAssistant: null }
              : { assistants: { ...board.assistants, office: 1, assistantOfficeIds: [data.assistantId] } }),
        }),
      }
      if (fault === 'displacer') state = { ...state, pendingEjectionOpportunity: { ...state.pendingEjectionOpportunity!, displacedByPlayerId: ownerId } }
      if (fault === 'lateStep') steps = [steps[0]!, { visitorId: 'missing', destination: 'gallery' }]
      if (fault === 'tickets') state = { ...state, players: state.players.map(player => player.id !== ownerId
        ? player : { ...player, ticketsByColor: { B: 1, R: 0, W: 0 } }) }
      if (fault === 'steps') steps = null as unknown as VisitorMovementStep[]
      const before = structuredClone({ state, steps })
      expect(() => applyEjectionVisitorMovement(state, fault === 'executor' ? playerId : ownerId, steps)).toThrow()
      expect({ state, steps }).toEqual(before)
      expect(Object.isFrozen(state)).toBe(false)
    },
  )
})
