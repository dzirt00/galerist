import { describe, expect, it } from 'vitest'
import {
  applyGalleristMovementToGameState, chooseStartingLocation, confirmTurnDraft,
  createTurnDraft, prepareTurn, projectEventsForViewer, projectGameForViewer,
  restoreGameState, updateTurnDraft,
  type ConfirmedTurnCommand, type GameState, type StartingLocationId,
} from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState, startGameAfterSetup } from './helpers.js'

const locations: readonly StartingLocationId[] = [
  'LOC-ARTISTS_COLONY', 'LOC-MEDIA_CENTER',
  'LOC-INTERNATIONAL_MARKET', 'LOC-SALES_OFFICE',
]

function scenario(position: StartingLocationId | 'HOME') {
  const base = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  return {
    ...base,
    playerBoards: base.playerBoards.map(board => board.playerId === base.activePlayerId
      ? { ...board, galleristPosition: position } : board),
  }
}

function command(
  state: GameState,
  locationId: StartingLocationId,
  assistantId?: string,
): ConfirmedTurnCommand {
  return confirmTurnDraft(updateTurnDraft(updateTurnDraft(createTurnDraft(state.activePlayerId!), {
    type: 'set_movement', movement: {
      category: 'movement',
      locationId,
      ...(assistantId === undefined ? {} : { assistantId }),
    },
  }), {
    type: 'set_location_action', locationAction: { category: 'location_action' },
  }))
}

describe('TURN-003: подготовка перемещения через публичный API', () => {
  it.each(['HOME', ...locations] as const)('сохраняет назначение из позиции %s без перемещения', position => {
    for (const destination of locations.filter(location => location !== position)) {
      const state = scenario(position)
      const input = command(state, destination)
      const snapshot = structuredClone({ state, input })
      const plan = prepareTurn(state, input)
      expect(plan.steps[0]).toEqual({ category: 'movement', locationId: destination })
      expect(plan.steps[0]).not.toBe(input.movement)
      expect(Object.isFrozen(plan.steps[0])).toBe(true)
      expect(Object.isFrozen(plan.steps)).toBe(true)
      expect(Object.isFrozen(plan)).toBe(true)
      expect(plan).not.toHaveProperty('events')
      expect({ state, input }).toEqual(snapshot)
      expect(Object.isFrozen(state)).toBe(false)
      expect(projectGameForViewer(state, null).playerBoards.find(board => board.playerId === input.playerId)
        ?.galleristPosition).toBe(position)
      expect(restoreGameState(state)).toEqual(state)
    }
  })

  it.each(locations)('отклоняет повторную локацию %s без изменения входов', position => {
    const state = scenario(position)
    const input = command(state, position)
    const snapshot = structuredClone({ state, input })
    expect(() => prepareTurn(state, input)).toThrow('Invalid movement')
    expect({ state, input }).toEqual(snapshot)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(input)).toBe(true)
  })

  it.each(['HOME', 'unknown', undefined, null, 42])('отклоняет runtime-назначение %s', locationId => {
    const state = scenario('HOME')
    const valid = command(state, locations[0]!)
    const input = { ...valid, movement: { ...valid.movement, locationId } } as unknown as ConfirmedTurnCommand
    const snapshot = structuredClone({ state, input })
    expect(() => prepareTurn(state, input)).toThrow()
    expect({ state, input }).toEqual(snapshot)
    expect(Object.isFrozen(input)).toBe(false)
  })

  it('инициализирует позицию дома и переносит стартовый выбор в позицию только выбранного игрока', () => {
    const state = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const snapshot = structuredClone(state)
    expect(state.playerBoards.every(board => board.galleristPosition === 'HOME')).toBe(true)
    const playerId = state.currentStartingLocationPlayerId!
    const locationId = state.availableStartingLocationIds[0]!
    const result = chooseStartingLocation(state, playerId, locationId)
    expect(result.state.playerBoards.find(board => board.playerId === playerId)).toMatchObject({
      startingLocationId: locationId, galleristPosition: locationId,
    })
    expect(result.state.playerBoards.find(board => board.playerId !== playerId)?.galleristPosition).toBe('HOME')
    expect(state).toEqual(snapshot)
    expect(restoreGameState(result.state)).toEqual(result.state)
    expect(result.events.map(event => event.type)).toEqual(['StartingLocationChosen'])
  })

  it.each([undefined, null, 'unknown', 42])('отклоняет повреждённую сохранённую позицию %s', position => {
    const state = scenario('HOME')
    const damaged = { ...state, playerBoards: state.playerBoards.map((board, index) => index === 0
      ? { ...board, galleristPosition: position } : board) }
    expect(() => restoreGameState(damaged)).toThrow('Invalid game state:')
  })

  it('отклоняет прежнюю версию схемы без поля позиции', () => {
    expect(() => restoreGameState({ ...scenario('HOME'), stateSchemaVersion: 16 })).toThrow('stateSchemaVersion')
  })
})

describe('TURN-004: оставление помощника через публичный путь перемещения', () => {
  it('переносит помощника из офиса в покидаемую локацию перед перемещением галериста', () => {
    const state = scenario('LOC-ARTISTS_COLONY')
    const playerBoard = state.playerBoards.find(board => board.playerId === state.activePlayerId)!
    const assistantId = playerBoard.assistants.assistantOfficeIds[0]!
    const input = command(state, 'LOC-MEDIA_CENTER', assistantId)
    const snapshot = structuredClone({ state, input })

    expect(prepareTurn(state, input).steps[0]).toEqual({
      category: 'movement',
      locationId: 'LOC-MEDIA_CENTER',
      assistantId,
    })

    const result = applyGalleristMovementToGameState(state, input)
    const resultBoard = result.state.playerBoards.find(board => board.playerId === input.playerId)!

    expect(result.state.assistantByLocation['LOC-ARTISTS_COLONY']).toEqual({
      playerId: input.playerId,
      assistantId,
    })
    expect(result.state.assistantByLocation['LOC-MEDIA_CENTER']).toBeNull()
    expect(resultBoard.assistants.assistantOfficeIds).toEqual(
      playerBoard.assistants.assistantOfficeIds.filter(id => id !== assistantId),
    )
    expect(resultBoard.assistants.office).toBe(playerBoard.assistants.office - 1)
    expect(resultBoard.galleristPosition).toBe('LOC-MEDIA_CENTER')
    expect(result.events).toEqual([
      {
        type: 'AssistantLeftAtLocation',
        playerId: input.playerId,
        assistantId,
        locationId: 'LOC-ARTISTS_COLONY',
      },
      {
        type: 'GalleristMoved',
        playerId: input.playerId,
        from: 'LOC-ARTISTS_COLONY',
        to: 'LOC-MEDIA_CENTER',
      },
    ])
    expect(projectGameForViewer(result.state, null).assistantByLocation)
      .toEqual(result.state.assistantByLocation)
    expect(projectEventsForViewer(result.events, result.state, null)).toEqual(result.events)
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
    expect({ state, input }).toEqual(snapshot)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.state.assistantByLocation)).toBe(true)
    expect(Object.isFrozen(result.state.assistantByLocation['LOC-ARTISTS_COLONY'])).toBe(true)
    expect(Object.isFrozen(result.events[0])).toBe(true)
  })

  it('переносит помощника того же игрока из другой локации и освобождает источник', () => {
    const base = scenario('LOC-ARTISTS_COLONY')
    const activeBoard = base.playerBoards.find(board => board.playerId === base.activePlayerId)!
    const assistantId = activeBoard.assistants.assistantOfficeIds[0]!
    const assistantOfficeIds = activeBoard.assistants.assistantOfficeIds.filter(id => id !== assistantId)
    const state: GameState = {
      ...base,
      playerBoards: base.playerBoards.map(board => board.playerId === base.activePlayerId
        ? {
            ...board,
            assistants: {
              ...board.assistants,
              office: assistantOfficeIds.length,
              assistantOfficeIds,
            },
          }
        : board),
      assistantByLocation: {
        ...base.assistantByLocation,
        'LOC-SALES_OFFICE': { playerId: base.activePlayerId, assistantId },
      },
    }
    const input = command(state, 'LOC-MEDIA_CENTER', assistantId)
    const snapshot = structuredClone({ state, input })

    const result = applyGalleristMovementToGameState(state, input)

    expect(result.state.assistantByLocation).toEqual({
      ...state.assistantByLocation,
      'LOC-ARTISTS_COLONY': { playerId: input.playerId, assistantId },
      'LOC-SALES_OFFICE': null,
    })
    expect(result.state.playerBoards.find(board => board.playerId === input.playerId)?.assistants)
      .toEqual(state.playerBoards.find(board => board.playerId === input.playerId)?.assistants)
    expect(result.events.map(event => event.type)).toEqual([
      'AssistantLeftAtLocation',
      'GalleristMoved',
    ])
    expect({ state, input }).toEqual(snapshot)
  })

  it('сохраняет прежнее поведение без assistantId', () => {
    const state = scenario('LOC-INTERNATIONAL_MARKET')
    const input = command(state, 'LOC-SALES_OFFICE')

    const result = applyGalleristMovementToGameState(state, input)

    expect(result.state.assistantByLocation).toEqual(state.assistantByLocation)
    expect(result.events).toEqual([{
      type: 'GalleristMoved',
      playerId: input.playerId,
      from: 'LOC-INTERNATIONAL_MARKET',
      to: 'LOC-SALES_OFFICE',
    }])
  })

  it.each([
    ['пустая строка', ''],
    ['строка из пробелов', '   '],
    ['null', null],
    ['число', 42],
    ['объект', { id: 'ASSISTANT-1' }],
  ])('атомарно отклоняет runtime-assistantId: %s', (_case, assistantId) => {
    const state = scenario('LOC-ARTISTS_COLONY')
    const valid = command(state, 'LOC-MEDIA_CENTER')
    const input = {
      ...valid,
      movement: { ...valid.movement, assistantId },
    } as unknown as ConfirmedTurnCommand
    expectRejectedWithoutChanges(state, input)
  })

  it('атомарно отклоняет оставление помощника при выходе из HOME', () => {
    const state = scenario('HOME')
    const assistantId = state.playerBoards.find(board => board.playerId === state.activePlayerId)!
      .assistants.assistantOfficeIds[0]!
    expectRejectedWithoutChanges(state, command(state, 'LOC-MEDIA_CENTER', assistantId))
  })

  it('атомарно отклоняет занятую покидаемую локацию', () => {
    const base = scenario('LOC-ARTISTS_COLONY')
    const assistantId = base.playerBoards.find(board => board.playerId === base.activePlayerId)!
      .assistants.assistantOfficeIds[0]!
    const otherPlayerId = base.players.find(player => player.id !== base.activePlayerId)!.id
    const state: GameState = {
      ...base,
      assistantByLocation: {
        ...base.assistantByLocation,
        'LOC-ARTISTS_COLONY': { playerId: otherPlayerId, assistantId },
      },
    }
    expectRejectedWithoutChanges(state, command(state, 'LOC-MEDIA_CENTER', assistantId))
  })

  it('атомарно отклоняет помощника из покидаемой локации как источник', () => {
    const base = scenario('LOC-ARTISTS_COLONY')
    const board = base.playerBoards.find(value => value.playerId === base.activePlayerId)!
    const assistantId = board.assistants.assistantOfficeIds[0]!
    const assistantOfficeIds = board.assistants.assistantOfficeIds.filter(id => id !== assistantId)
    const state: GameState = {
      ...base,
      playerBoards: base.playerBoards.map(value => value.playerId === base.activePlayerId
        ? {
            ...value,
            assistants: {
              ...value.assistants,
              office: assistantOfficeIds.length,
              assistantOfficeIds,
            },
          }
        : value),
      assistantByLocation: {
        ...base.assistantByLocation,
        'LOC-ARTISTS_COLONY': { playerId: base.activePlayerId, assistantId },
      },
    }
    expectRejectedWithoutChanges(state, command(state, 'LOC-MEDIA_CENTER', assistantId))
  })

  it.each(['ASSISTANT-99', 'ASSISTANT-3'])('атомарно отклоняет недоступного помощника %s', assistantId => {
    const state = scenario('LOC-ARTISTS_COLONY')
    expectRejectedWithoutChanges(state, command(state, 'LOC-MEDIA_CENTER', assistantId))
  })

  it('атомарно отклоняет помощника, находящегося только у другого игрока', () => {
    const base = scenario('LOC-ARTISTS_COLONY')
    const board = base.playerBoards.find(value => value.playerId === base.activePlayerId)!
    const assistantId = board.assistants.assistantOfficeIds[0]!
    const assistantOfficeIds = board.assistants.assistantOfficeIds.filter(id => id !== assistantId)
    const otherPlayerId = base.players.find(player => player.id !== base.activePlayerId)!.id
    const state: GameState = {
      ...base,
      playerBoards: base.playerBoards.map(value => value.playerId === base.activePlayerId
        ? {
            ...value,
            assistants: {
              ...value.assistants,
              office: assistantOfficeIds.length,
              assistantOfficeIds,
            },
          }
        : value),
      assistantByLocation: {
        ...base.assistantByLocation,
        'LOC-SALES_OFFICE': { playerId: otherPlayerId, assistantId },
      },
    }
    expectRejectedWithoutChanges(state, command(state, 'LOC-MEDIA_CENTER', assistantId))
  })

  it('восстановление требует точные ключи и форму assistantByLocation', () => {
    const state = scenario('LOC-ARTISTS_COLONY')
    const { 'LOC-SALES_OFFICE': _removed, ...missingLocation } = state.assistantByLocation
    expect(() => restoreGameState({ ...state, assistantByLocation: missingLocation })).toThrow(
      'assistantByLocation must contain exactly the four starting locations',
    )
    expect(() => restoreGameState({
      ...state,
      assistantByLocation: { ...state.assistantByLocation, UNKNOWN: null },
    })).toThrow('assistantByLocation must contain exactly the four starting locations')
    expect(() => restoreGameState({
      ...state,
      assistantByLocation: {
        ...state.assistantByLocation,
        'LOC-SALES_OFFICE': { playerId: state.activePlayerId },
      },
    })).toThrow('must contain playerId and assistantId')
  })

  it.each([
    ['офисе', 'ASSISTANT-1'],
    ['очереди найма', 'ASSISTANT-3'],
  ])('восстановление отклоняет помощника одновременно в локации и %s', (_source, assistantId) => {
    const state = scenario('LOC-ARTISTS_COLONY')
    expect(() => restoreGameState({
      ...state,
      assistantByLocation: {
        ...state.assistantByLocation,
        'LOC-SALES_OFFICE': { playerId: state.activePlayerId, assistantId },
      },
    })).toThrow('assistant must have one location for its player')
  })

  it('восстановление отклоняет одну пару в заказе и локации', () => {
    const base = scenario('LOC-ARTISTS_COLONY')
    const board = base.playerBoards.find(value => value.playerId === base.activePlayerId)!
    const assistantId = board.assistants.assistantOfficeIds[0]!
    const assistantOfficeIds = board.assistants.assistantOfficeIds.filter(id => id !== assistantId)
    const state: GameState = {
      ...base,
      playerBoards: base.playerBoards.map(value => value.playerId === base.activePlayerId
        ? {
            ...value,
            assistants: {
              ...value.assistants,
              office: assistantOfficeIds.length,
              assistantOfficeIds,
            },
            boardOrders: {
              ...value.boardOrders,
              1: { orderId: 'ORDER-TEST', orderStatus: 'unfulfilled', assistant: assistantId },
            },
          }
        : value),
      assistantByLocation: {
        ...base.assistantByLocation,
        'LOC-SALES_OFFICE': { playerId: base.activePlayerId, assistantId },
      },
    }
    expect(() => restoreGameState(state)).toThrow('assistant must have one location for its player')
  })

  it('восстановление отклоняет одну пару в нескольких локациях', () => {
    const base = scenario('LOC-ARTISTS_COLONY')
    const board = base.playerBoards.find(value => value.playerId === base.activePlayerId)!
    const assistantId = board.assistants.assistantOfficeIds[0]!
    const assistantOfficeIds = board.assistants.assistantOfficeIds.filter(id => id !== assistantId)
    const state: GameState = {
      ...base,
      playerBoards: base.playerBoards.map(value => value.playerId === base.activePlayerId
        ? {
            ...value,
            assistants: {
              ...value.assistants,
              office: assistantOfficeIds.length,
              assistantOfficeIds,
            },
          }
        : value),
      assistantByLocation: {
        ...base.assistantByLocation,
        'LOC-MEDIA_CENTER': { playerId: base.activePlayerId, assistantId },
        'LOC-SALES_OFFICE': { playerId: base.activePlayerId, assistantId },
      },
    }
    expect(() => restoreGameState(state)).toThrow('assistant must have one location for its player')
  })
})

function expectRejectedWithoutChanges(state: GameState, input: ConfirmedTurnCommand): void {
  const snapshot = structuredClone({ state, input })
  expect(() => applyGalleristMovementToGameState(state, input)).toThrow()
  expect({ state, input }).toEqual(snapshot)
}

describe('TURN-003: применение перемещения через публичный API', () => {
  it('перемещает активного галериста между локациями и создаёт GalleristMoved', () => {
    const state = scenario('LOC-ARTISTS_COLONY')
    const input = command(state, 'LOC-MEDIA_CENTER')
    const snapshot = structuredClone({ state, input })

    const result = applyGalleristMovementToGameState(state, input)

    expect(result.state).toEqual({
      ...snapshot.state,
      playerBoards: snapshot.state.playerBoards.map(board => board.playerId === input.playerId
        ? { ...board, galleristPosition: 'LOC-MEDIA_CENTER' }
        : board),
    })
    expect(result.events).toEqual([{
      type: 'GalleristMoved',
      playerId: input.playerId,
      from: 'LOC-ARTISTS_COLONY',
      to: 'LOC-MEDIA_CENTER',
    }])
    expect(projectEventsForViewer(result.events, result.state, null)).toEqual(result.events)
    expect(projectEventsForViewer(result.events, result.state, input.playerId)).toEqual(result.events)
    expect({ state, input }).toEqual(snapshot)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.state)).toBe(true)
    expect(Object.isFrozen(result.state.playerBoards)).toBe(true)
    expect(Object.isFrozen(result.events)).toBe(true)
    expect(Object.isFrozen(result.events[0])).toBe(true)
  })

  it('перемещает галериста из HOME в любую локацию', () => {
    for (const destination of locations) {
      const base = scenario('HOME')
      // This scenario checks movement into an empty location; ejection is tested separately.
      const state: GameState = { ...base, playerBoards: base.playerBoards.map(board => ({
        ...board, galleristPosition: 'HOME',
      })) }
      const input = command(state, destination)

      const result = applyGalleristMovementToGameState(state, input)

      expect(result.state.playerBoards.find(board => board.playerId === input.playerId)
        ?.galleristPosition).toBe(destination)
      expect(result.events).toEqual([{
        type: 'GalleristMoved', playerId: input.playerId, from: 'HOME', to: destination,
      }])
    }
  })

  it('атомарно отклоняет повторную локацию', () => {
    const state = scenario('LOC-INTERNATIONAL_MARKET')
    const input = command(state, 'LOC-INTERNATIONAL_MARKET')
    const snapshot = structuredClone({ state, input })

    expect(() => applyGalleristMovementToGameState(state, input)).toThrow('Invalid movement')
    expect({ state, input }).toEqual(snapshot)
  })
})
