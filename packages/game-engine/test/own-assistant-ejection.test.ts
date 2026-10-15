import { describe, expect, it } from 'vitest'
import {
  applyGalleristMovementToGameState, applyTurn, confirmTurnDraft, createTurnDraft,
  updateTurnDraft, projectGameForViewer, projectEventsForViewer, restoreGameState,
  type GameState, type ConfirmedTurnCommand,
} from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState, startGameAfterSetup } from './helpers.js'

const destination = 'LOC-MEDIA_CENTER' as const
const departure = 'LOC-ARTISTS_COLONY' as const

/** Готовит вход к собственному помощнику с заданным числом свободных мест в офисе. */
function scenario(officeCount = 1, fromHome = false) {
  const base = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const playerId = base.activePlayerId!
  const board = base.playerBoards.find(board => board.playerId === playerId)!
  const ids = [...board.assistants.assistantOfficeIds, ...board.assistants.assistantHireQueueIds]
  const assistantId = ids[officeCount]!
  const artist = base.artistMarket.slots.find(slot => slot.initialPromotion === 0)!
  const state: GameState = {
    ...base,
    playerBoards: base.playerBoards.map(board => board.playerId === playerId ? {
      ...board,
      galleristPosition: fromHome ? 'HOME' : departure,
      assistants: {
        ...board.assistants, office: officeCount, assistantOfficeIds: ids.slice(0, officeCount),
        hireQueue: Math.min(8, ids.length - officeCount - 1), assistantHireQueueIds: ids.slice(officeCount + 1, officeCount + 9),
      },
    } : board),
    assistantByLocation: { ...base.assistantByLocation, [destination]: { playerId, assistantId } },
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
  return { state, command, assistantId, playerId }
}

/** Проверяет порядок хода, возврат помощника, публичные проекции, восстановление и заморозку. */
function assertPublicResult(state: GameState, command: ConfirmedTurnCommand, result: ReturnType<typeof applyTurn>) {
  expect(result.state.activePlayerId).toBe(state.activePlayerId)
  expect(result.state.round).toBe(state.round)
  expect(result.state.playerBoards.find(board => board.playerId === command.playerId)?.ejectedAssistant).toBeNull()
  expect(projectGameForViewer(result.state, null).assistantByLocation).toEqual(result.state.assistantByLocation)
  expect(projectGameForViewer(result.state, null).playerBoards).toEqual(
    projectGameForViewer(restoreGameState(JSON.parse(JSON.stringify(result.state))), null).playerBoards,
  )
  expect(projectEventsForViewer(result.events, result.state, null)).toEqual(result.events)
  expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
  expect(Object.isFrozen(result.state)).toBe(true)
  expect(Object.isFrozen(result.state.assistantByLocation)).toBe(true)
  expect(Object.isFrozen(result.state.playerBoards.find(board => board.playerId === command.playerId)!.assistants.assistantOfficeIds)).toBe(true)
  expect(Object.isFrozen(result.events)).toBe(true)
}

describe('EJECT-002: own assistant ejection through public movement and applyTurn', () => {
  it.each([0, 1, 3, 4])('applies return or permanent removal with %i office assistants', officeCount => {
    const { state, command, assistantId, playerId } = scenario(officeCount)
    const before = structuredClone({ state, command })
    const result = applyGalleristMovementToGameState(state, command)
    const board = result.state.playerBoards.find(board => board.playerId === playerId)!
    const original = state.playerBoards.find(board => board.playerId === playerId)!
    expect(result.state.assistantByLocation[destination]).toBeNull()
    expect(board.galleristPosition).toBe(destination)
    expect(board.assistants).toEqual({
      ...original.assistants,
      office: officeCount === 4 ? 4 : officeCount + 1,
      assistantOfficeIds: officeCount === 4 ? original.assistants.assistantOfficeIds
        : [...original.assistants.assistantOfficeIds, assistantId],
    })
    expect(result.events).toEqual([
      { type: 'GalleristMoved', playerId, from: departure, to: destination },
      { type: 'OwnAssistantEjected', playerId, assistantId, locationId: destination },
      { type: officeCount === 4 ? 'AssistantRemovedFromGame' : 'AssistantReturnedHome', playerId, assistantId },
    ])
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    assertPublicResult(state, command, result)
    const turnResult = applyTurn(state, command)
    expect(turnResult.events.slice(0, 3)).toEqual(result.events)
    expect(turnResult.state.playerBoards.find(board => board.playerId === playerId)!.assistants).toEqual(board.assistants)
    expect(turnResult.state.assistantByLocation).toEqual(result.state.assistantByLocation)
    expect({ state, command }).toEqual(before)
    assertPublicResult(state, command, turnResult)
  })

  it('returns the assistant when moving from HOME through a full ordinary turn', () => {
    const { state, command, assistantId, playerId } = scenario(0, true)
    const before = structuredClone({ state, command })
    const movement = applyGalleristMovementToGameState(state, command)
    const result = applyTurn(state, command)
    expect(result.events.slice(0, 3)).toEqual(movement.events)
    expect(result.events[0]).toEqual({ type: 'GalleristMoved', playerId, from: 'HOME', to: destination })
    expect(result.events.some(event => event.type === 'ArtistPromoted')).toBe(true)
    expect(result.state.playerBoards.find(board => board.playerId === playerId)!.assistants.assistantOfficeIds).toEqual([assistantId])
    expect({ state, command }).toEqual(before)
    assertPublicResult(state, command, result)
  })

  it('uses the office freed by leaving an assistant before returning the destination assistant', () => {
    const { state, command: baseCommand, assistantId, playerId } = scenario(4)
    const original = state.playerBoards.find(board => board.playerId === playerId)!
    const leftId = original.assistants.assistantOfficeIds[0]!
    const command = { ...baseCommand, movement: { ...baseCommand.movement, assistantId: leftId } }
    const before = structuredClone({ state, command })
    const result = applyTurn(state, command)
    expect(result.state.assistantByLocation[departure]).toEqual({ playerId, assistantId: leftId })
    expect(result.state.assistantByLocation[destination]).toBeNull()
    expect(result.state.playerBoards.find(board => board.playerId === playerId)!.assistants).toEqual({
      ...original.assistants, assistantOfficeIds: [...original.assistants.assistantOfficeIds.slice(1), assistantId],
    })
    expect(result.events.slice(0, 4)).toEqual([
      { type: 'AssistantLeftAtLocation', playerId, assistantId: leftId, locationId: departure },
      { type: 'GalleristMoved', playerId, from: departure, to: destination },
      { type: 'OwnAssistantEjected', playerId, assistantId, locationId: destination },
      { type: 'AssistantReturnedHome', playerId, assistantId },
    ])
    expect({ state, command }).toEqual(before)
    assertPublicResult(state, command, result)
  })

  it('does not return the destination assistant if it was moved to the departure', () => {
    const { state, command: baseCommand, assistantId, playerId } = scenario(0)
    const command = { ...baseCommand, movement: { ...baseCommand.movement, assistantId } }
    const result = applyTurn(state, command)
    expect(result.state.assistantByLocation[departure]).toEqual({ playerId, assistantId })
    expect(result.state.assistantByLocation[destination]).toBeNull()
    expect(result.state.playerBoards.find(board => board.playerId === playerId)!.assistants.office).toBe(0)
    expect(result.events.slice(0, 2).map(event => event.type)).toEqual(['AssistantLeftAtLocation', 'GalleristMoved'])
    expect(result.events.some(event => event.type === 'OwnAssistantEjected' || event.type === 'AssistantReturnedHome')).toBe(false)
    assertPublicResult(state, command, result)
  })

  it('preserves inputs on a late location action failure after assistant return', () => {
    const { state, command: original } = scenario()
    const command: ConfirmedTurnCommand = { ...original, locationAction: {
      ...original.locationAction, advertisingArtist: { ...original.locationAction.advertisingArtist!, artistId: 'unknown' },
    } }
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow()
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
  })

  it('rejects a returning assistant duplicated in the office without partial changes', () => {
    const { state: base, command, assistantId, playerId } = scenario()
    const state: GameState = { ...base, playerBoards: base.playerBoards.map(board => board.playerId === playerId ? {
      ...board, assistants: { ...board.assistants, office: 2, assistantOfficeIds: [...board.assistants.assistantOfficeIds, assistantId] },
    } : board) }
    const before = structuredClone({ state, command })
    expect(() => applyGalleristMovementToGameState(state, command)).toThrow('Invalid returning assistant')
    expect({ state, command }).toEqual(before)
  })
})
