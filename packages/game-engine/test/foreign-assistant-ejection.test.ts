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
    expect(result.events.some(event => (event.type as string) === 'EjectionOpportunityGranted')).toBe(false)
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
