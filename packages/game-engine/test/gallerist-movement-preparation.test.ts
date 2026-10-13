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

function command(state: GameState, locationId: StartingLocationId): ConfirmedTurnCommand {
  return confirmTurnDraft(updateTurnDraft(updateTurnDraft(createTurnDraft(state.activePlayerId!), {
    type: 'set_movement', movement: { category: 'movement', locationId },
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
    expect(() => restoreGameState({ ...scenario('HOME'), stateSchemaVersion: 15 })).toThrow('stateSchemaVersion')
  })
})

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
      const state = scenario('HOME')
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
