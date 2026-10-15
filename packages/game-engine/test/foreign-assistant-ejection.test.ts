import { describe, expect, it } from 'vitest'
import {
  applyGalleristMovementToGameState, applyTurn, confirmTurnDraft, createTurnDraft,
  updateTurnDraft, projectGameForViewer, projectEventsForViewer, restoreGameState,
  type GameState, type ConfirmedTurnCommand,
} from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState, startGameAfterSetup } from './helpers.js'

const departure = 'LOC-ARTISTS_COLONY' as const
const destination = 'LOC-MEDIA_CENTER' as const
const otherLocation = 'LOC-SALES_OFFICE' as const

function scenario() {
  const base = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const playerId = base.activePlayerId!
  const owner = base.playerBoards.find(board => board.playerId !== playerId)!
  const [assistantId, otherAssistantId] = owner.assistants.assistantOfficeIds as readonly [string, string]
  const artist = base.artistMarket.slots.find(slot => slot.initialPromotion === 0)!
  const state: GameState = {
    ...base,
    playerBoards: base.playerBoards.map(board => board.playerId === playerId
      ? { ...board, galleristPosition: departure }
      : {
        ...board,
        galleristPosition: otherLocation,
        assistants: { ...board.assistants, office: 0, assistantOfficeIds: [] },
        locationAssistants: [
          { assistantId, locationId: destination },
          { assistantId: otherAssistantId, locationId: otherLocation },
        ],
      }),
    assistantByLocation: {
      ...base.assistantByLocation,
      [destination]: { playerId: owner.playerId, assistantId },
      [otherLocation]: { playerId: owner.playerId, assistantId: otherAssistantId },
    },
    artistMarket: { ...base.artistMarket, slots: base.artistMarket.slots.map(slot =>
      slot.artistId === artist.artistId ? { ...slot, isOpen: true, fame: 3 } : slot) },
  }
  const command = confirmTurnDraft(updateTurnDraft(updateTurnDraft(createTurnDraft(playerId), {
    type: 'set_movement', movement: { category: 'movement', locationId: destination },
  }), {
    type: 'set_location_action', locationAction: { category: 'location_action', advertisingArtist: {
      playerId, artistId: artist.artistId, requestedTicketColors: ['B'],
    } },
  }))
  return { state, command, playerId, ownerId: owner.playerId, assistantId, otherAssistantId }
}

describe('EJECT-001: pending ejection opportunity', () => {
  it('grants and projects a saved opportunity after the successful turn', () => {
    const { state, command, playerId, ownerId, assistantId } = scenario()
    const before = structuredClone({ state, command })
    const result = applyTurn(state, command)
    const expected = {
      pieceType: 'assistant', assistantId, locationId: destination,
      displacedByPlayerId: playerId, playerId: ownerId,
    }
    expect(result.state.pendingEjectionOpportunity).toEqual(expected)
    expect(result.events.at(-1)).toEqual({
      type: 'EjectionOpportunityGranted', playerId: ownerId, locationId: destination,
    })
    const restored = restoreGameState(JSON.parse(JSON.stringify(result.state)))
    expect(restored).toEqual(result.state)
    for (const viewer of [null, playerId, ownerId]) {
      const projection = projectGameForViewer(restored, viewer)
      expect(projection.pendingEjectionOpportunity).toEqual(expected)
      expect(projection.pendingEjectionOpportunity).not.toBe(restored.pendingEjectionOpportunity)
      expect(Object.isFrozen(projection.pendingEjectionOpportunity)).toBe(true)
    }
    expect({ state, command }).toEqual(before)
  })

  it('rejects a new ordinary turn without consuming an existing opportunity', () => {
    const { state, command } = scenario()
    const pending = applyTurn(state, command).state
    const before = structuredClone(pending)
    const nextCommand = { ...command, movement: { ...command.movement, locationId: departure } }
    expect(() => applyTurn(pending, nextCommand)).toThrow('Invalid pending ejection opportunity')
    expect(pending).toEqual(before)
  })

  it.each(['regular_play', 'ending_current_round'] as const)(
    'grants after all effects in %s with either management timing', phase => {
      for (const timing of ['before_location', 'after_location'] as const) {
        const { state: base, command: original, playerId, ownerId, assistantId } = scenario()
        const visitor = { id: 'opportunity-visitor', type: 'B' as const }
        const phased: GameState = phase === 'regular_play' ? base
          : { ...base, phase, endTriggeredRound: base.round }
        const state: GameState = {
          ...phased,
          plazaVisitors: [...base.plazaVisitors, visitor],
          players: base.players.map(player => player.id === playerId ? {
            ...player, ticketsByColor: { ...player.ticketsByColor, B: 1 },
          } : player),
        }
        const command: ConfirmedTurnCommand = { ...original, management: {
          timing, command: { category: 'management_action', visitorMovementSteps: [
            { visitorId: visitor.id, destination: 'vestibule' },
          ] },
        } }
        const before = structuredClone({ state, command })
        const result = applyTurn(state, command)
        const actionEvents = ['InfluenceSpent', 'ArtistPromoted', 'TicketReceived', 'ArtistFameIncreased']
        const managementEvents = ['ManagementActionStarted', 'TicketSpent', 'VisitorMoved']
        expect(result.events.map(event => event.type)).toEqual(['GalleristMoved', 'PieceEjected',
          ...(timing === 'before_location' ? [...managementEvents, ...actionEvents]
            : [...actionEvents, ...managementEvents]), 'EjectionOpportunityGranted',
        ])
        expect(result.state.pendingEjectionOpportunity).toEqual({ pieceType: 'assistant', assistantId,
          playerId: ownerId, displacedByPlayerId: playerId, locationId: destination })
        expect(result.state.activePlayerId).toBe(playerId)
        expect(result.state.round).toBe(state.round)
        expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
        expect({ state, command }).toEqual(before)

        const invalidCommand: ConfirmedTurnCommand = { ...command, management: {
          timing, command: { category: 'management_action', visitorMovementSteps: [
            { visitorId: 'unknown-visitor', destination: 'vestibule' },
          ] },
        } }
        expect(() => applyTurn(state, invalidCommand)).toThrow()
        expect({ state, command }).toEqual(before)
        expect(state.pendingEjectionOpportunity).toBeNull()
      }
    },
  )

  it.each(['playerId', 'displacedByPlayerId'] as const)(
    'rejects a saved opportunity referencing an unknown %s', field => {
      const { state, command } = scenario()
      const snapshot = JSON.parse(JSON.stringify(applyTurn(state, command).state))
      expect(() => restoreGameState(snapshot)).not.toThrow()
      snapshot.pendingEjectionOpportunity[field] = 'unknown-player'
      const before = structuredClone(snapshot)
      expect(() => restoreGameState(snapshot)).toThrow()
      expect(snapshot).toEqual(before)
    },
  )

  it('rejects a saved opportunity for an assistant that was not ejected', () => {
    const { state, command } = scenario()
    const snapshot = JSON.parse(JSON.stringify(applyTurn(state, command).state))
    expect(() => restoreGameState(snapshot)).not.toThrow()
    snapshot.pendingEjectionOpportunity.assistantId = 'not-the-ejected-assistant'
    const before = structuredClone(snapshot)
    expect(() => restoreGameState(snapshot)).toThrow()
    expect(snapshot).toEqual(before)
  })

  it('rejects a saved opportunity whose displacing player contradicts the assistant context', () => {
    const { state, command, ownerId } = scenario()
    const snapshot = JSON.parse(JSON.stringify(applyTurn(state, command).state))
    expect(() => restoreGameState(snapshot)).not.toThrow()
    snapshot.pendingEjectionOpportunity.displacedByPlayerId = ownerId
    const before = structuredClone(snapshot)
    expect(() => restoreGameState(snapshot)).toThrow()
    expect(snapshot).toEqual(before)
  })
})

describe('EJECT-001: foreign assistant displacement', () => {
  it.each(['movement', 'turn'] as const)('preserves displacement through public %s, projections and restoration', entry => {
    const { state, command, playerId, ownerId, assistantId, otherAssistantId } = scenario()
    // The starting snapshot must itself satisfy saved placement invariants.
    expect(restoreGameState(JSON.parse(JSON.stringify(state)))).toEqual(state)
    const before = structuredClone({ state, command })
    const movement = applyGalleristMovementToGameState(state, command)
    const result = entry === 'movement' ? movement : applyTurn(state, command)
    const originalOwner = state.playerBoards.find(board => board.playerId === ownerId)!
    const owner = result.state.playerBoards.find(board => board.playerId === ownerId)!
    expect(result.state.assistantByLocation[destination]).toBeNull()
    expect(result.state.assistantByLocation[otherLocation]).toEqual({ playerId: ownerId, assistantId: otherAssistantId })
    expect(owner.locationAssistants).toEqual([{ assistantId: otherAssistantId, locationId: otherLocation }])
    expect(owner.ejectedAssistant).toEqual({ assistantId, displacedByPlayerId: playerId })
    expect(owner.assistants).toEqual(originalOwner.assistants)
    expect(result.state.playerBoards.find(board => board.playerId === playerId)!.galleristPosition).toBe(destination)
    expect(result.state.activePlayerId).toBe(state.activePlayerId)
    expect(result.state.round).toBe(state.round)
    expect(movement.events).toEqual([
      { type: 'GalleristMoved', playerId, from: departure, to: destination },
      { type: 'PieceEjected', pieceType: 'assistant', playerId: ownerId, assistantId, locationId: destination, displacedByPlayerId: playerId },
    ])
    expect(result.events.slice(0, 2)).toEqual(movement.events)
    expect(result.events.filter(event => event.type === 'PieceEjected')).toHaveLength(1)
    expect(result.events.some(event => event.type === 'EjectionOpportunityGranted')).toBe(entry === 'turn')
    if (entry === 'turn') {
      expect(result.events.slice(2).some(event => event.type === 'ArtistPromoted')).toBe(true)
      expect(result.state.artistMarket).not.toEqual(movement.state.artistMarket)
    }
    expect(projectGameForViewer(result.state, null).playerBoards.find(board => board.playerId === ownerId)!.ejectedAssistant)
      .toEqual(owner.ejectedAssistant)
    expect(projectEventsForViewer(result.events, result.state, null)).toEqual(result.events)
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(result.state)).toBe(true)
    expect(Object.isFrozen(owner.ejectedAssistant)).toBe(true)
    expect(Object.isFrozen(owner.locationAssistants)).toBe(true)
    expect(Object.isFrozen(result.events[1])).toBe(true)
  })

  it('allows an empty destination without creating an ejection', () => {
    const { state: base, command, ownerId } = scenario()
    const state: GameState = {
      ...base,
      assistantByLocation: { ...base.assistantByLocation, [destination]: null },
      playerBoards: base.playerBoards.map(board => board.playerId === ownerId ? {
        ...board, locationAssistants: board.locationAssistants.filter(item => item.locationId !== destination),
      } : board),
    }
    const before = structuredClone(state)
    const result = applyTurn(state, command)
    expect(result.events.some(event => event.type === 'PieceEjected')).toBe(false)
    expect(result.state.playerBoards.find(board => board.playerId === ownerId)!.ejectedAssistant).toBeNull()
    expect(state).toEqual(before)
  })

  it('preserves inputs when the assistant owner cannot be found', () => {
    const { state: base, command, assistantId } = scenario()
    const state: GameState = { ...base, assistantByLocation: {
      ...base.assistantByLocation, [destination]: { playerId: 'unknown', assistantId },
    } }
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow('invalid playerId')
    expect({ state, command }).toEqual(before)
  })

  it('does not commit displacement when the later location action fails', () => {
    const { state, command: original } = scenario()
    const command: ConfirmedTurnCommand = { ...original, locationAction: {
      ...original.locationAction, advertisingArtist: { ...original.locationAction.advertisingArtist!, artistId: 'unknown' },
    } }
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow()
    expect({ state, command }).toEqual(before)
  })
})

describe('EJECT-005 / END-004: assistant returns after the final-round turn', () => {
  function finalScenario(office: number = 0) {
    const base = scenario()
    const state: GameState = {
      ...base.state, phase: 'final_round', round: 2, endTriggeredRound: 1,
      playerBoards: base.state.playerBoards.map(board => board.playerId !== base.ownerId ? board : {
        ...board, assistants: {
          ...board.assistants, office,
          assistantOfficeIds: board.assistants.assistantHireQueueIds.slice(0, office),
          assistantHireQueueIds: board.assistants.assistantHireQueueIds.slice(office),
          hireQueue: board.assistants.hireQueue - office,
        },
      }),
    }
    return { ...base, state }
  }

  it.each([0, 1, 3, 4])('returns or removes the assistant with %i occupied office spaces', office => {
    const { state, command, playerId, ownerId, assistantId, otherAssistantId } = finalScenario(office)
    expect(restoreGameState(JSON.parse(JSON.stringify(state)))).toEqual(state)
    const before = structuredClone({ state, command })
    const originalOwner = state.playerBoards.find(board => board.playerId === ownerId)!
    const movement = applyGalleristMovementToGameState(state, command)
    expect(movement.state.playerBoards.find(board => board.playerId === ownerId)!.ejectedAssistant)
      .toEqual({ assistantId, displacedByPlayerId: playerId })
    const result = applyTurn(state, command)
    const owner = result.state.playerBoards.find(board => board.playerId === ownerId)!
    expect(owner).toEqual({
      ...originalOwner, ejectedAssistant: null,
      locationAssistants: [{ assistantId: otherAssistantId, locationId: otherLocation }],
      assistants: office === 4 ? originalOwner.assistants : {
        ...originalOwner.assistants, office: office + 1,
        assistantOfficeIds: [...originalOwner.assistants.assistantOfficeIds, assistantId],
      },
    })
    expect(result.state.assistantByLocation).toEqual({ ...state.assistantByLocation, [destination]: null })
    expect(result.state.activePlayerId).toBe(state.activePlayerId)
    expect(result.state.round).toBe(state.round)
    expect(result.state.phase).toBe('final_round')
    expect(result.state.pendingEjectionOpportunity).toBeNull()
    expect(result.state.artistMarket).not.toEqual(movement.state.artistMarket)
    expect(result.events.map(event => event.type)).toEqual([
      'GalleristMoved', 'PieceEjected', 'InfluenceSpent', 'ArtistPromoted', 'TicketReceived',
      'ArtistFameIncreased', office === 4 ? 'AssistantRemovedFromGame' : 'AssistantReturnedHome',
    ])
    expect(result.events.at(-1)).toEqual({
      type: office === 4 ? 'AssistantRemovedFromGame' : 'AssistantReturnedHome', playerId: ownerId, assistantId,
    })
    for (const viewer of [null, playerId, ownerId]) {
      expect(projectGameForViewer(result.state, viewer).playerBoards).toEqual(result.state.playerBoards)
      expect(projectEventsForViewer(result.events, result.state, viewer)).toEqual(result.events)
    }
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(owner)).toBe(true)
    expect(Object.isFrozen(owner.assistants.assistantOfficeIds)).toBe(true)
    expect(Object.isFrozen(result.events.at(-1))).toBe(true)
  })

  it.each(['before_location', 'after_location'] as const)('returns after management %s', timing => {
    const { state: base, command: original, playerId, ownerId, assistantId } = finalScenario(3)
    const visitor = { id: 'assistant-final-return-visitor', type: 'B' as const }
    const state: GameState = { ...base, plazaVisitors: [...base.plazaVisitors, visitor],
      players: base.players.map(player => player.id === playerId ? {
        ...player, ticketsByColor: { ...player.ticketsByColor, B: 1 },
      } : player) }
    const command: ConfirmedTurnCommand = { ...original, management: { timing,
      command: { category: 'management_action', visitorMovementSteps: [
        { visitorId: visitor.id, destination: 'vestibule' },
      ] },
    } }
    const before = structuredClone({ state, command })
    const result = applyTurn(state, command)
    const actionEvents = ['InfluenceSpent', 'ArtistPromoted', 'TicketReceived', 'ArtistFameIncreased']
    const managementEvents = ['ManagementActionStarted', 'TicketSpent', 'VisitorMoved']
    expect(result.events.map(event => event.type)).toEqual(['GalleristMoved', 'PieceEjected',
      ...(timing === 'before_location' ? [...managementEvents, ...actionEvents] : [...actionEvents, ...managementEvents]),
      'AssistantReturnedHome',
    ])
    expect(result.events.at(-1)).toEqual({ type: 'AssistantReturnedHome', playerId: ownerId, assistantId })
    expect(result.state.playerBoards.find(board => board.playerId === ownerId)!.assistants.office).toBe(4)
    expect(result.state.vestibuleVisitors).toContainEqual({ playerId, vestibuleVisitor: visitor })
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
    expect({ state, command }).toEqual(before)
  })

  it.each(['regular_play', 'ending_current_round'] as const)('keeps the ejected assistant in %s', phase => {
    const { state: base, command, ownerId, playerId, assistantId } = scenario()
    const state: GameState = phase === 'regular_play' ? base : { ...base, phase, endTriggeredRound: base.round }
    const result = applyTurn(state, command)
    const owner = result.state.playerBoards.find(board => board.playerId === ownerId)!
    expect(owner.ejectedAssistant).toEqual({ assistantId, displacedByPlayerId: playerId })
    expect(owner.assistants).toEqual(state.playerBoards.find(board => board.playerId === ownerId)!.assistants)
    expect(result.events.some(event => event.type === 'AssistantReturnedHome' || event.type === 'AssistantRemovedFromGame')).toBe(false)
    expect(result.state.pendingEjectionOpportunity).toEqual({ pieceType: 'assistant', assistantId,
      playerId: ownerId, displacedByPlayerId: playerId, locationId: destination })
  })

  it.each([false, true])('does not return an earlier assistant when no new piece is ejected: %s', earlier => {
    const { state: base, command, ownerId, playerId, assistantId } = finalScenario()
    const state: GameState = { ...base,
      assistantByLocation: { ...base.assistantByLocation, [destination]: null },
      playerBoards: base.playerBoards.map(board => board.playerId !== ownerId ? board : {
        ...board, locationAssistants: board.locationAssistants.filter(item => item.locationId !== destination),
        ejectedAssistant: earlier ? { assistantId, displacedByPlayerId: playerId } : null,
        assistants: earlier ? board.assistants : { ...board.assistants,
          office: 1, assistantOfficeIds: [assistantId] },
      }),
    }
    expect(restoreGameState(JSON.parse(JSON.stringify(state)))).toEqual(state)
    const result = applyTurn(state, command)
    expect(result.state.playerBoards.find(board => board.playerId === ownerId))
      .toEqual(state.playerBoards.find(board => board.playerId === ownerId))
    expect(result.events.some(event => event.type === 'PieceEjected' || event.type === 'AssistantReturnedHome'
      || event.type === 'AssistantRemovedFromGame')).toBe(false)
  })

  it.each(['location', 'management'] as const)('rejects a late %s failure atomically', failure => {
    const { state, command: original, ownerId } = finalScenario(3)
    const command: ConfirmedTurnCommand = failure === 'location' ? { ...original, locationAction: {
      category: 'location_action', advertisingArtist: { ...original.locationAction.advertisingArtist!, artistId: 'unknown' },
    } } : { ...original, management: { timing: 'after_location', command: {
      category: 'management_action', visitorMovementSteps: [{ visitorId: 'unknown', destination: 'vestibule' }],
    } } }
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow()
    expect({ state, command }).toEqual(before)
    expect(state.playerBoards.find(board => board.playerId === ownerId)!.assistants.office).toBe(3)
    expect(Object.isFrozen(state)).toBe(false)
  })
})
