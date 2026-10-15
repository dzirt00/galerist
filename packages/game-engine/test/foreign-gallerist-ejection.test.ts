import { describe, expect, it } from 'vitest'
import {
  applyGalleristMovementToGameState, applyTurn, confirmTurnDraft, createTurnDraft,
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
