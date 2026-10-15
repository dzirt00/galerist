import { expectRestoredFixture } from './helpers.js'
import { describe, expect, it } from 'vitest'
import {
  applyTurn, applyAssistantHiringToGameState, confirmTurnDraft, createTurnDraft, updateTurnDraft,
  projectGameForViewer, projectEventsForViewer, restoreGameState,
  type ConfirmedTurnCommand, type GameState,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

it('counts defined location actions rather than optional keys with undefined values', () => {
  const { state, command } = scenario()
  const withAbsentActions = {
    ...command,
    locationAction: {
      ...command.locationAction,
      hireAssistants: undefined,
      artworkSale: undefined,
    },
  } as unknown as ConfirmedTurnCommand
  const before = structuredClone({ state, command: withAbsentActions })
  const expected = applyTurn(state, command)
  expect(applyTurn(state, withAbsentActions)).toEqual(expected)
  expect({ state, command: withAbsentActions }).toEqual(before)
})

/** Готовит подтверждённый ход рекламы художника из домашней позиции. */
function scenario() {
  const base = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const artist = base.artistMarket.slots.find(slot => slot.initialPromotion === 0)!
  const state: GameState = {
    ...base,
    playerBoards: base.playerBoards.map(board => board.playerId === base.activePlayerId
      ? { ...board, galleristPosition: 'HOME' } : board),
    artistMarket: { ...base.artistMarket, slots: base.artistMarket.slots.map(slot =>
      slot.artistId === artist.artistId ? { ...slot, isOpen: true, fame: 3 } : slot) },
  }
  const command = confirmTurnDraft(updateTurnDraft(updateTurnDraft(createTurnDraft(state.activePlayerId!), {
    type: 'set_movement', movement: { category: 'movement', locationId: 'LOC-MEDIA_CENTER' },
  }), {
    type: 'set_location_action', locationAction: { category: 'location_action', advertisingArtist: {
      playerId: state.activePlayerId!, artistId: artist.artistId, requestedTicketColors: ['B'],
    } },
  }))
  return { state, command, artist }
}

describe('TURN-002: atomic movement and promotion through public API', () => {
  /** Добавляет перемещение посетителя до либо после рекламы для проверки порядка получения билетов. */
  function managementScenario(timing: 'before_location' | 'after_location', tickets = 0) {
    const { state: base, command: original } = scenario()
    const visitor = { id: 'turn-red-visitor', type: 'R' as const }
    const state: GameState = {
      ...base,
      plazaVisitors: [...base.plazaVisitors, visitor],
      players: base.players.map(player => player.id === original.playerId
        ? { ...player, ticketsByColor: { ...player.ticketsByColor, R: tickets } } : player),
    }
    const command: ConfirmedTurnCommand = {
      ...original,
      locationAction: { ...original.locationAction, advertisingArtist: {
        ...original.locationAction.advertisingArtist!, requestedTicketColors: ['R'],
      } },
      management: { timing, command: { category: 'management_action', visitorMovementSteps: [
        { visitorId: visitor.id, destination: 'vestibule' },
      ] } },
    }
    return { state, command, visitor }
  }

  it.each(['before_location', 'after_location'] as const)(
    'executes management once at %s and preserves all transition results', timing => {
      const { state, command, visitor } = managementScenario(timing, timing === 'before_location' ? 1 : 0)
      const before = structuredClone({ state, command })
      const result = applyTurn(state, command)
      const promotionEvents = ['InfluenceSpent', 'ArtistPromoted', 'TicketReceived', 'ArtistFameIncreased']
      const managementEvents = ['ManagementActionStarted', 'TicketSpent', 'VisitorMoved']
      expect(result.events.map(event => event.type)).toEqual(['GalleristMoved',
        ...(timing === 'before_location' ? [...managementEvents, ...promotionEvents]
          : [...promotionEvents, ...managementEvents]),
      ])
      expect(result.state.players.find(player => player.id === command.playerId)!.ticketsByColor.R)
        .toBe(timing === 'before_location' ? 1 : 0)
      expect(result.state.ticketDiscard.R).toBe(state.ticketDiscard.R + 1)
      expect(result.state.plazaVisitors).not.toContainEqual(visitor)
      expect(result.state.vestibuleVisitors).toContainEqual({ playerId: command.playerId, vestibuleVisitor: visitor })
      expect(result.state.activePlayerId).toBe(state.activePlayerId)
      expect(result.state.round).toBe(state.round)
      expect({ state, command }).toEqual(before)
      expect(Object.isFrozen(command.management!.command.visitorMovementSteps)).toBe(false)
      expect(Object.isFrozen(result.state.vestibuleVisitors)).toBe(true)
      expectRestoredFixture(result.state)
      expect(projectGameForViewer(result.state, null).vestibuleVisitors).toEqual(result.state.vestibuleVisitors)
      expect(projectEventsForViewer(result.events, result.state, null)).toEqual(result.events)
    },
  )

  it('rejects management before promotion when only the future reward could pay for it', () => {
    const { state, command } = managementScenario('before_location')
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow('Insufficient tickets')
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
  })

  it('rejects a second visitor step after promotion without retaining earlier effects', () => {
    const { state, command: base, visitor } = managementScenario('after_location')
    const command: ConfirmedTurnCommand = { ...base, management: {
      timing: 'after_location', command: { category: 'management_action', visitorMovementSteps: [
        { visitorId: visitor.id, destination: 'vestibule' },
        { visitorId: visitor.id, destination: 'gallery' },
      ] },
    } }
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow('Insufficient tickets')
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(command)).toBe(false)
  })

  it('rejects an unknown management category at the runtime boundary instead of silently skipping it', () => {
    const { state, command: base } = managementScenario('after_location')
    const command = { ...base, management: { timing: 'after_location', command: {
      ...base.management!.command, category: 'unknown_action',
    } } } as unknown as ConfirmedTurnCommand
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow()
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(command)).toBe(false)
  })

  it('rejects a location action mislabeled as movement instead of moving twice and skipping promotion', () => {
    const { state, command: base } = scenario()
    const command = { ...base, locationAction: {
      ...base.locationAction, category: 'movement',
    } } as unknown as ConfirmedTurnCommand
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow()
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(command)).toBe(false)
  })

  it('rejects management substituted for the required location action even when categories are unique', () => {
    const { state, command: base } = managementScenario('after_location', 1)
    const { management, ...withoutManagement } = base
    const command = { ...withoutManagement, locationAction: {
      ...base.locationAction, category: 'management_action',
      visitorMovementSteps: management!.command.visitorMovementSteps,
    } } as unknown as ConfirmedTurnCommand
    const before = structuredClone({ state, command })
    expect(() => applyTurn(state, command)).toThrow()
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(command)).toBe(false)
  })

  it('applies a confirmed draft, preserves event order, projects and restores the result', () => {
    const { state, command, artist } = scenario()
    const before = structuredClone({ state, command })
    const result = applyTurn(state, command)
    const player = result.state.players.find(player => player.id === command.playerId)!
    expect(result.state.playerBoards.find(board => board.playerId === command.playerId)!.galleristPosition).toBe('LOC-MEDIA_CENTER')
    expect(player.influence).toBe(state.players.find(player => player.id === command.playerId)!.influence - 1)
    expect(player.ticketsByColor.B).toBe(1)
    expect(result.state.artistMarket.slots.find(slot => slot.artistId === artist.artistId)).toMatchObject({ promotionLevel: 1, fame: 4 })
    expect(result.events.map(event => event.type)).toEqual([
      'GalleristMoved', 'InfluenceSpent', 'ArtistPromoted', 'TicketReceived', 'ArtistFameIncreased',
    ])
    expect(result.events[0]).toEqual({ type: 'GalleristMoved', playerId: command.playerId, from: 'HOME', to: 'LOC-MEDIA_CENTER' })
    expect(result.state.activePlayerId).toBe(state.activePlayerId)
    expect(result.state.round).toBe(state.round)
    expect({ state, command }).toEqual(before)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.state.players)).toBe(true)
    expect(Object.isFrozen(result.events)).toBe(true)
    expectRestoredFixture(result.state)
    expect(projectGameForViewer(result.state, null).playerBoards.find(board => board.playerId === command.playerId)!.galleristPosition).toBe('LOC-MEDIA_CENTER')
    expect(projectEventsForViewer(result.events, result.state, null)).toEqual(result.events)
  })

  it('uses the active player even when the nested request names another player', () => {
    const { state, command } = scenario()
    const other = state.players.find(player => player.id !== command.playerId)!
    const input = { ...command, locationAction: { ...command.locationAction,
      advertisingArtist: { ...command.locationAction.advertisingArtist!, playerId: other.id } } }
    const result = applyTurn(state, input)
    expect(result.state.players.find(player => player.id === other.id)).toEqual(other)
    expect(result.events.filter(event => 'playerId' in event).every(event => 'playerId' in event && event.playerId === command.playerId)).toBe(true)
  })

  it('preserves assistant placement before movement and promotion', () => {
    const { state: base, command } = scenario()
    const board = base.playerBoards.find(board => board.playerId === command.playerId)!
    const assistantId = board.assistants.assistantOfficeIds[0]!
    const state: GameState = { ...base, playerBoards: base.playerBoards.map(board => board.playerId === command.playerId
      ? { ...board, galleristPosition: 'LOC-SALES_OFFICE' } : board),
      assistantByLocation: { ...base.assistantByLocation, 'LOC-SALES_OFFICE': null } }
    const result = applyTurn(state, { ...command, movement: { ...command.movement, assistantId } })
    expect(result.state.assistantByLocation['LOC-SALES_OFFICE']).toEqual({ playerId: command.playerId, assistantId })
    expect(result.state.playerBoards.find(board => board.playerId === command.playerId)!.assistants.assistantOfficeIds).not.toContain(assistantId)
    expect(result.events.map(event => event.type)).toEqual([
      'AssistantLeftAtLocation', 'GalleristMoved', 'InfluenceSpent', 'ArtistPromoted', 'TicketReceived', 'ArtistFameIncreased',
    ])
  })

  it.each(['insufficient influence', 'late reward failure', 'wrong location', 'management', 'wrong active player', 'same location'])(
    'rejects %s without modifying or freezing inputs', reason => {
      const { state: base, command: original } = scenario()
      let state: GameState = base
      let command: ConfirmedTurnCommand = structuredClone(original)
      if (reason === 'insufficient influence') state = { ...state, players: state.players.map(player =>
        player.id === command.playerId ? { ...player, influence: 0 } : player) }
      if (reason === 'late reward failure') command = { ...command, locationAction: { ...command.locationAction,
        advertisingArtist: { ...command.locationAction.advertisingArtist!, targetInfluence: 9 } } }
      if (reason === 'wrong location') command = { ...command, movement: { ...command.movement, locationId: 'LOC-SALES_OFFICE' } }
      if (reason === 'management') command = { ...command, management: { timing: 'after_location', command: { category: 'management_action' } } }
      if (reason === 'wrong active player') command = { ...command, playerId: state.players.find(player => player.id !== state.activePlayerId)!.id }
      if (reason === 'same location') state = { ...state, playerBoards: state.playerBoards.map(board => board.playerId === command.playerId
        ? { ...board, galleristPosition: 'LOC-MEDIA_CENTER' } : board) }
      const before = structuredClone({ state, command })
      expect(() => applyTurn(state, command)).toThrow()
      expect({ state, command }).toEqual(before)
      expect(Object.isFrozen(state)).toBe(false)
      expect(Object.isFrozen(command)).toBe(false)
    },
  )
})

describe('TURN-002: hiring within a confirmed media-center turn', () => {
  /** Готовит найм с заполненным офисом и управлением, способным изменить доступные ресурсы. */
  function hiringScenario(timing?: 'before_location' | 'after_location', tickets = 0) {
    const initial = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
    const playerId = initial.activePlayerId!
    // Два предыдущих найма заполняют офис и делают BOARD-HIRE-3 следующей ячейкой очереди.
    const base = applyAssistantHiringToGameState(initial, { playerId, countAssistants: 2 }).state
    const board = base.playerBoards.find(board => board.playerId === playerId)!
    const visitor = base.visitorBag.visitors.find(visitor => visitor.type === 'R')!
    const state: GameState = {
      ...base,
      players: base.players.map(player => player.id === playerId
        ? { ...player, coins: 9, ticketsByColor: { ...player.ticketsByColor, R: tickets } } : player),
      playerBoards: base.playerBoards.map(board => board.playerId === playerId
        ? { ...board, galleristPosition: 'LOC-ARTISTS_COLONY' } : board),
      assistantByLocation: { ...base.assistantByLocation, 'LOC-ARTISTS_COLONY': null },
      visitorBag: { visitors: base.visitorBag.visitors.filter(item => item.id !== visitor.id) },
      plazaVisitors: [...base.plazaVisitors, visitor],
    }
    const command: ConfirmedTurnCommand = {
      type: 'perform_turn', playerId,
      movement: { category: 'movement', locationId: 'LOC-MEDIA_CENTER',
        assistantId: board.assistants.assistantOfficeIds[0]! },
      locationAction: { category: 'location_action', hireAssistants: { playerId, countAssistants: 1 } },
      ...(timing === undefined ? {} : { management: { timing, command: {
        category: 'management_action' as const,
        visitorMovementSteps: [{ visitorId: visitor.id, destination: 'vestibule' as const }],
      } } }),
    }
    return { state, command, visitor, board }
  }

  it.each([undefined, 'before_location', 'after_location'] as const)(
    'preserves hiring, assistant placement, event order and snapshots with timing %s', timing => {
      const { state, command, visitor, board } = hiringScenario(timing, timing === 'before_location' ? 1 : 0)
      const before = structuredClone({ state, command })
      const result = applyTurn(state, command)
      const hiringEvents = ['AssistantsHired', 'CoinsSpent', 'TicketReceived']
      const managementEvents = ['ManagementActionStarted', 'TicketSpent', 'VisitorMoved']
      expect(result.events.map(event => event.type)).toEqual([
        'AssistantLeftAtLocation', 'GalleristMoved',
        ...(timing === 'before_location' ? managementEvents : []),
        ...hiringEvents,
        ...(timing === 'after_location' ? managementEvents : []),
      ])
      const player = result.state.players.find(player => player.id === command.playerId)!
      expect(player.coins).toBe(7)
      expect(player.ticketsByColor.R).toBe(timing === 'after_location' ? 0 : 1)
      const updatedBoard = result.state.playerBoards.find(board => board.playerId === command.playerId)!
      expect(updatedBoard.galleristPosition).toBe('LOC-MEDIA_CENTER')
      expect(updatedBoard.assistants).toEqual({
        office: 4, hireQueue: 5,
        assistantOfficeIds: [...board.assistants.assistantOfficeIds.slice(1), board.assistants.assistantHireQueueIds[0]!],
        assistantHireQueueIds: board.assistants.assistantHireQueueIds.slice(1),
      })
      expect(result.state.assistantByLocation['LOC-ARTISTS_COLONY']).toEqual({
        playerId: command.playerId, assistantId: command.movement.assistantId,
      })
      expect(result.state.ticketOffice.ticketsByColor.R).toBe(state.ticketOffice.ticketsByColor.R - 1)
      expect(result.state.ticketDiscard.R).toBe(state.ticketDiscard.R + (timing === undefined ? 0 : 1))
      if (timing !== undefined) {
        expect(result.state.plazaVisitors).not.toContainEqual(visitor)
        expect(result.state.vestibuleVisitors).toContainEqual({ playerId: command.playerId, vestibuleVisitor: visitor })
      }
      expect(result.events).toContainEqual({ type: 'AssistantsHired', countHiredAssistants: 1 })
      expect(result.events).toContainEqual({ type: 'CoinsSpent', playerId: command.playerId, paid: 2 })
      expect(result.events).toContainEqual({ type: 'TicketReceived', playerId: command.playerId, color: 'R' })
      expect(result.state.activePlayerId).toBe(state.activePlayerId)
      expect(result.state.round).toBe(state.round)
      expect(result.state.artistMarket).toEqual(state.artistMarket)
      expect({ state, command }).toEqual(before)
      expect(Object.isFrozen(command.locationAction.hireAssistants)).toBe(false)
      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.isFrozen(result.state.playerBoards)).toBe(true)
      expect(Object.isFrozen(updatedBoard.assistants.assistantOfficeIds)).toBe(true)
      expect(Object.isFrozen(result.events)).toBe(true)
      expect(result.events.every(Object.isFrozen)).toBe(true)
      expectRestoredFixture(result.state)
      expect(projectGameForViewer(result.state, null).playerBoards.find(board => board.playerId === command.playerId)!.assistants)
        .toEqual(updatedBoard.assistants)
      expect(projectEventsForViewer(result.events, result.state, null)).toEqual(result.events)
    },
  )

  it('uses the confirmed player rather than the nested hiring player', () => {
    const { state, command } = hiringScenario()
    const other = state.players.find(player => player.id !== command.playerId)!
    const input: ConfirmedTurnCommand = { ...command, locationAction: {
      ...command.locationAction, hireAssistants: { ...command.locationAction.hireAssistants!, playerId: other.id },
    } }
    const result = applyTurn(state, input)
    expect(result.state.players.find(player => player.id === other.id)).toEqual(other)
    expect(result.state.playerBoards.find(board => board.playerId === other.id))
      .toEqual(state.playerBoards.find(board => board.playerId === other.id))
    expect(result.state.players.find(player => player.id === command.playerId)!.coins).toBe(7)
    expect(result.events.filter(event => 'playerId' in event).every(event => 'playerId' in event && event.playerId === command.playerId)).toBe(true)
  })

  it('passes optional payment and ticket choices to the existing hiring command', () => {
    const { state, command } = hiringScenario()
    const request = { ...command.locationAction.hireAssistants!, targetInfluence: 0,
      requestedTicketColors: ['R'] as const, replacementColorsByRequestedColor: { R: 'B' as const } }
    const inputState: GameState = { ...state, ticketOffice: {
      ticketsByColor: { ...state.ticketOffice.ticketsByColor, R: 0 },
    } }
    const freedState: GameState = { ...inputState, playerBoards: inputState.playerBoards.map(board => board.playerId === command.playerId
      ? { ...board, assistants: { ...board.assistants, office: 3,
        assistantOfficeIds: board.assistants.assistantOfficeIds.slice(1) } } : board) }
    const expected = applyAssistantHiringToGameState(freedState, request)
    const result = applyTurn(inputState, { ...command, locationAction: { category: 'location_action', hireAssistants: request } })
    expect(result.state.players).toEqual(expected.state.players)
    expect(result.state.ticketOffice).toEqual(expected.state.ticketOffice)
    expect(result.events.slice(2)).toEqual(expected.events)
  })

  it.each(['future ticket', 'late second step', 'full office', 'payment', 'both actions', 'no action'])(
    'rejects %s atomically', reason => {
      const fixture = hiringScenario(reason === 'future ticket' ? 'before_location' : 'after_location')
      let state = fixture.state
      let command = fixture.command
      if (reason === 'late second step') command = { ...command, management: {
        timing: 'after_location', command: { category: 'management_action', visitorMovementSteps: [
          { visitorId: fixture.visitor.id, destination: 'vestibule' },
          { visitorId: fixture.visitor.id, destination: 'gallery' },
        ] },
      } }
      if (reason === 'full office') command = { ...command, movement: { category: 'movement', locationId: 'LOC-MEDIA_CENTER' } }
      if (reason === 'payment') state = { ...state, players: state.players.map(player => player.id === command.playerId
        ? { ...player, coins: 0 } : player) }
      if (reason === 'both actions') command = { ...command, locationAction: {
        ...command.locationAction, advertisingArtist: scenario().command.locationAction.advertisingArtist!,
      } }
      if (reason === 'no action') command = { ...command, locationAction: { category: 'location_action' } }
      const before = structuredClone({ state, command })
      expect(() => applyTurn(state, command)).toThrow()
      expect({ state, command }).toEqual(before)
      expect(Object.isFrozen(state)).toBe(false)
      expect(Object.isFrozen(command)).toBe(false)
      expect(Object.isFrozen(command.locationAction.hireAssistants)).toBe(reason === 'no action')
    },
  )
})
