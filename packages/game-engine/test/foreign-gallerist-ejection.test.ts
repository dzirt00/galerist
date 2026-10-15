import { describe, expect, it } from 'vitest'
import {
  applyGalleristMovementToGameState, applyTurn, confirmTurnDraft, createTurnDraft, declineEjectionOpportunity,
  updateTurnDraft, projectGameForViewer, projectEventsForViewer, restoreGameState,
  type GameState, type ConfirmedTurnCommand, type StartingLocationId,
} from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState, startGameAfterSetup } from './helpers.js'

const destinations = [
  ['LOC-ARTISTS_COLONY', 'LOC-ARTISTS_COLONY_EJECT'],
  ['LOC-MEDIA_CENTER', 'LOC-MEDIA_CENTER_EJECT'],
  ['LOC-INTERNATIONAL_MARKET', 'LOC-INTERNATIONAL_MARKET_EJECT'],
  ['LOC-SALES_OFFICE', 'LOC-SALES_OFFICE_EJECT'],
] as const

describe('EJECT-003/004: decline gallerist opportunity', () => {
  it.each(['regular_play', 'ending_current_round'] as const)('returns home after a full turn in %s', phase => {
    const { state, command, ownerId, playerId } = scenario()
    const pending = structuredClone(applyTurn(phase === 'regular_play' ? state
      : { ...state, phase, endTriggeredRound: state.round }, command).state)
    const before = structuredClone(pending)
    const result = declineEjectionOpportunity(pending, ownerId)
    expect(result.state).toEqual({ ...pending, pendingEjectionOpportunity: null,
      playerBoards: pending.playerBoards.map(board => board.playerId === ownerId
        ? { ...board, galleristPosition: 'HOME' } : board),
    })
    expect(result.events).toEqual([
      { type: 'EjectionActionDeclined', playerId: ownerId },
      { type: 'GalleristReturnedHome', playerId: ownerId },
    ])
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
    for (const viewer of [null, playerId, ownerId]) {
      expect(projectGameForViewer(result.state, viewer).playerBoards).toEqual(result.state.playerBoards)
      expect(projectGameForViewer(result.state, viewer).pendingEjectionOpportunity).toBeNull()
      expect(projectEventsForViewer(result.events, result.state, viewer)).toEqual(result.events)
    }
    expect(pending).toEqual(before)
    expect(Object.isFrozen(pending)).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(result.state.playerBoards.every(Object.isFrozen)).toBe(true)
    expect(result.events.every(Object.isFrozen)).toBe(true)
    expect(() => declineEjectionOpportunity(result.state, ownerId)).toThrow()
  })

  it.each(['HOME', 'LOC-SALES_OFFICE_EJECT'] as const)('rejects inconsistent position %s atomically', position => {
    const { state, command, ownerId } = scenario()
    const pending = applyTurn(state, command).state
    const invalid: GameState = { ...pending, playerBoards: pending.playerBoards.map(board => board.playerId === ownerId
      ? { ...board, galleristPosition: position } : board) }
    const before = structuredClone(invalid)
    expect(() => declineEjectionOpportunity(invalid, ownerId)).toThrow('Invalid galleristPosition')
    expect(invalid).toEqual(before)
  })
})

function scenario(destination: StartingLocationId = 'LOC-MEDIA_CENTER') {
  const base = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const playerId = base.activePlayerId!
  const ownerId = base.playerBoards.find(board => board.playerId !== playerId)!.playerId
  const artist = base.artistMarket.slots.find(slot => slot.initialPromotion === 0)!
  const state: GameState = {
    ...base,
    playerBoards: base.playerBoards.map(board => ({
      ...board, galleristPosition: board.playerId === playerId ? 'HOME' : destination,
    })),
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
  return { state, command, playerId, ownerId }
}

describe('EJECT-001: foreign gallerist displacement', () => {
  it.each(['HOME', 'LOC-SALES_OFFICE_EJECT'] as const)(
    'rejects a saved opportunity for a gallerist in %s instead of its ejection space', position => {
    const { state, command, ownerId } = scenario()
    const snapshot = JSON.parse(JSON.stringify(applyTurn(state, command).state))
    expect(snapshot.pendingEjectionOpportunity).toMatchObject({
      pieceType: 'gallerist', playerId: ownerId, locationId: 'LOC-MEDIA_CENTER',
    })
    expect(() => restoreGameState(snapshot)).not.toThrow()
    const board = snapshot.playerBoards.find((item: { playerId: string }) => item.playerId === ownerId)
    board.galleristPosition = position
    const before = structuredClone(snapshot)
    expect(() => restoreGameState(snapshot)).toThrow()
    expect(snapshot).toEqual(before)
    },
  )

  it.each(destinations)('displaces at %s and preserves the saved snapshot', (destination, ejected) => {
    const { state, command, playerId, ownerId } = scenario(destination)
    expect(restoreGameState(JSON.parse(JSON.stringify(state)))).toEqual(state)
    const before = structuredClone({ state, command })
    const result = applyGalleristMovementToGameState(state, command)
    const expected: GameState = { ...state, playerBoards: state.playerBoards.map(board => ({
      ...board, galleristPosition: board.playerId === playerId ? destination : ejected,
    })) }
    expect(result.state).toEqual(expected)
    expect(result.events).toEqual([
      { type: 'GalleristMoved', playerId, from: 'HOME', to: destination },
      { type: 'PieceEjected', pieceType: 'gallerist', playerId: ownerId,
        locationId: destination, displacedByPlayerId: playerId },
    ])
    for (const viewer of [null, playerId, ownerId]) {
      expect(projectGameForViewer(result.state, viewer).playerBoards).toEqual(expected.playerBoards)
      expect(projectEventsForViewer(result.events, result.state, viewer)).toEqual(result.events)
    }
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.state.playerBoards)).toBe(true)
    expect(result.state.playerBoards.every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(result.events[1])).toBe(true)
  })

  it('continues the public turn on the displaced state and keeps all events', () => {
    const { state, command, ownerId } = scenario()
    const before = structuredClone({ state, command })
    const movement = applyGalleristMovementToGameState(state, command)
    const result = applyTurn(state, command)
    expect(result.state.playerBoards).toEqual(movement.state.playerBoards)
    expect(result.state.playerBoards.find(board => board.playerId === ownerId)!.galleristPosition)
      .toBe('LOC-MEDIA_CENTER_EJECT')
    expect(result.state.activePlayerId).toBe(state.activePlayerId)
    expect(result.state.round).toBe(state.round)
    expect(result.events.slice(0, 2)).toEqual(movement.events)
    expect(result.events.filter(event => event.type === 'PieceEjected')).toHaveLength(1)
    expect(result.events.slice(2).some(event => event.type === 'ArtistPromoted')).toBe(true)
    expect(result.state.artistMarket).not.toEqual(movement.state.artistMarket)
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
    expect({ state, command }).toEqual(before)
  })

  it('does not commit displacement when the later action fails', () => {
    const { state, command: original } = scenario()
    const command: ConfirmedTurnCommand = { ...original, locationAction: {
      category: 'location_action', advertisingArtist: {
        ...original.locationAction.advertisingArtist!, artistId: 'unknown',
      },
    } }
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow()
    expect({ state, command }).toEqual(before)
  })

  it('does not displace a gallerist already on the ejection space', () => {
    const { state: base, command, ownerId } = scenario()
    const state: GameState = { ...base, playerBoards: base.playerBoards.map(board =>
      board.playerId === ownerId ? { ...board, galleristPosition: 'LOC-MEDIA_CENTER_EJECT' } : board) }
    const result = applyGalleristMovementToGameState(state, command)
    expect(result.events).toHaveLength(1)
    expect(result.state.playerBoards.find(board => board.playerId === ownerId))
      .toEqual(state.playerBoards.find(board => board.playerId === ownerId))
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
  })

  it('rejects an unknown saved position', () => {
    const { state } = scenario()
    const snapshot = JSON.parse(JSON.stringify(state))
    snapshot.playerBoards[0].galleristPosition = 'LOC-UNKNOWN_EJECT'
    expect(() => restoreGameState(snapshot)).toThrow('invalid chooseStartingLocation')
  })
})

describe('EJECT-004 / END-004: gallerist returns after the final-round turn', () => {
  function finalScenario() {
    const base = scenario()
    const state: GameState = { ...base.state, phase: 'final_round', round: 2, endTriggeredRound: 1 }
    return { ...base, state }
  }

  it.each(['none', 'before_location', 'after_location'] as const)(
    'returns only after all turn events with management %s', timing => {
      const { state: base, command: original, playerId, ownerId } = finalScenario()
      const visitor = { id: 'final-return-visitor', type: 'B' as const }
      const state: GameState = { ...base, plazaVisitors: [...base.plazaVisitors, visitor],
        players: base.players.map(player => player.id === playerId
          ? { ...player, ticketsByColor: { ...player.ticketsByColor, B: 1 } } : player) }
      const command: ConfirmedTurnCommand = timing === 'none' ? original : { ...original,
        management: { timing, command: { category: 'management_action', visitorMovementSteps: [
          { visitorId: visitor.id, destination: 'vestibule' },
        ] } } }
      const before = structuredClone({ state, command })
      expect(restoreGameState(JSON.parse(JSON.stringify(state)))).toEqual(state)
      const movement = applyGalleristMovementToGameState(state, command)
      expect(movement.state.playerBoards.find(board => board.playerId === ownerId)!.galleristPosition)
        .toBe('LOC-MEDIA_CENTER_EJECT')
      const result = applyTurn(state, command)
      expect(result.state.playerBoards).toEqual(state.playerBoards.map(board => ({ ...board,
        galleristPosition: board.playerId === playerId ? 'LOC-MEDIA_CENTER' : 'HOME',
      })))
      const actionEvents = ['InfluenceSpent', 'ArtistPromoted', 'TicketReceived', 'ArtistFameIncreased']
      const managementEvents = ['ManagementActionStarted', 'TicketSpent', 'VisitorMoved']
      expect(result.events.map(event => event.type)).toEqual(['GalleristMoved', 'PieceEjected',
        ...(timing === 'before_location' ? [...managementEvents, ...actionEvents]
          : timing === 'after_location' ? [...actionEvents, ...managementEvents] : actionEvents),
        'GalleristReturnedHome',
      ])
      expect(result.events.at(-1)).toEqual({ type: 'GalleristReturnedHome', playerId: ownerId })
      expect(result.state.artistMarket).not.toEqual(state.artistMarket)
      if (timing !== 'none') expect(result.state.vestibuleVisitors)
        .toContainEqual({ playerId, vestibuleVisitor: visitor })
      expect(result.state.activePlayerId).toBe(playerId)
      expect(result.state.round).toBe(state.round)
      for (const viewer of [null, playerId, ownerId]) {
        expect(projectGameForViewer(result.state, viewer).playerBoards).toEqual(result.state.playerBoards)
        expect(projectEventsForViewer(result.events, result.state, viewer)).toEqual(result.events)
      }
      expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
      expect({ state, command }).toEqual(before)
      expect(Object.isFrozen(state)).toBe(false)
      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.isFrozen(result.state.playerBoards)).toBe(true)
      expect(result.state.playerBoards.every(Object.isFrozen)).toBe(true)
      expect(Object.isFrozen(result.events.at(-1))).toBe(true)
    },
  )

  it.each(['regular_play', 'ending_current_round'] as const)('does not return in %s', phase => {
    const { state: base, command, ownerId } = scenario()
    const state: GameState = phase === 'regular_play' ? base
      : { ...base, phase, endTriggeredRound: base.round }
    const result = applyTurn(state, command)
    expect(result.state.playerBoards.find(board => board.playerId === ownerId)!.galleristPosition)
      .toBe('LOC-MEDIA_CENTER_EJECT')
    expect(result.events.some(event => event.type === 'GalleristReturnedHome')).toBe(false)
  })

  it.each(['HOME', 'LOC-SALES_OFFICE_EJECT'] as const)(
    'preserves an owner at %s when this turn ejects no gallerist', position => {
      const { state: base, command, ownerId } = finalScenario()
      const state: GameState = { ...base, playerBoards: base.playerBoards.map(board =>
        board.playerId === ownerId ? { ...board, galleristPosition: position } : board) }
      const result = applyTurn(state, command)
      expect(result.state.playerBoards.find(board => board.playerId === ownerId))
        .toEqual(state.playerBoards.find(board => board.playerId === ownerId))
      expect(result.events.some(event => event.type === 'GalleristReturnedHome')).toBe(false)
    },
  )

  it('does not return a gallerist when the displaced piece is an assistant', () => {
    const { state: base, command, ownerId } = finalScenario()
    const owner = base.playerBoards.find(board => board.playerId === ownerId)!
    const assistantId = owner.assistants.assistantOfficeIds[0]!
    const state: GameState = { ...base,
      assistantByLocation: { ...base.assistantByLocation,
        'LOC-MEDIA_CENTER': { playerId: ownerId, assistantId } },
      playerBoards: base.playerBoards.map(board => board.playerId !== ownerId ? board : {
        ...board, galleristPosition: 'LOC-SALES_OFFICE',
        assistants: { ...board.assistants, office: board.assistants.office - 1,
          assistantOfficeIds: board.assistants.assistantOfficeIds.slice(1) },
        locationAssistants: [...board.locationAssistants, { assistantId, locationId: 'LOC-MEDIA_CENTER' }],
      }),
    }
    expect(restoreGameState(JSON.parse(JSON.stringify(state)))).toEqual(state)
    const result = applyTurn(state, command)
    const after = result.state.playerBoards.find(board => board.playerId === ownerId)!
    expect(after.galleristPosition).toBe('LOC-SALES_OFFICE')
    expect(after.ejectedAssistant).toBeNull()
    expect(after.assistants).toEqual({ ...owner.assistants,
      assistantOfficeIds: [...owner.assistants.assistantOfficeIds.slice(1), assistantId],
    })
    expect(result.events.at(-1)).toEqual({ type: 'AssistantReturnedHome', playerId: ownerId, assistantId })
    expect(result.events.some(event => event.type === 'PieceEjected' && event.pieceType === 'assistant')).toBe(true)
    expect(result.events.some(event => event.type === 'GalleristReturnedHome')).toBe(false)
  })

  it('rejects late management atomically after displacement and the location action', () => {
    const { state, command: original } = finalScenario()
    const command: ConfirmedTurnCommand = { ...original, management: {
      timing: 'after_location', command: { category: 'management_action', visitorMovementSteps: [
        { visitorId: 'unknown-visitor', destination: 'vestibule' },
      ] },
    } }
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow()
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
  })
})
