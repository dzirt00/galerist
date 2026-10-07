import { withGameEndConditions } from './helpers.js'
import { describe, expect, it } from 'vitest'
import {
  createGame,
  projectEventsForViewer,
  restoreGameState,
  startGame,
  triggerGameEnd,
} from '../src/index.js'
import { twoPlayerConfigs } from './fixtures.js'
import { completeStartingLocationSelection } from './helpers.js'

/** Создаёт детерминированную тестовую партию с заданным внешним ID. */
describe('acquiredArtworkCount snapshot contract', () => {
  it('initializes counts and preserves them in schema 9', () => {
    const setup = createSetup().state
    expect(setup.stateSchemaVersion).toBe(9)
    expect(setup.players.map(player => player.acquiredArtworkCount)).toEqual([0, 0])
    const source = {
      ...structuredClone(setup),
      players: setup.players.map((player, index) => ({ ...player, acquiredArtworkCount: index + 5 })),
    }
    const restored = restoreGameState(source)
    expect(restored.players.map(player => player.acquiredArtworkCount)).toEqual([5, 6])
    expect(restored).toEqual(source)
    expect(Object.isFrozen(restored.players[0])).toBe(true)
  })

  it.each([undefined, null, -1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid acquired count: %s', count => {
      const source = structuredClone(createSetup().state)
      const player = source.players[0]! as unknown as Record<string, unknown>
      if (count === undefined) delete player.acquiredArtworkCount
      else player.acquiredArtworkCount = count
      const before = structuredClone(source)
      expect(() => restoreGameState(source)).toThrow('Invalid game state:')
      expect(source).toEqual(before)
    },
  )

  it('rejects schema 6', () => {
    expect(() => restoreGameState({ ...createSetup().state, stateSchemaVersion: 6 })).toThrow('Invalid game state:')
  })
})

function createSetup(gameId = 'game-boundary') {
  return createGame({
    gameId,
    config: { playerCount: 2, seed: 42 },
    players: twoPlayerConfigs,
  })
}

describe('граница игрового движка', () => {
  it('принимает внешний ID и не связывает идентичность партии с seed', () => {
    const first = createSetup('game-first').state
    const second = createSetup('game-second').state

    expect(first.id).toBe('game-first')
    expect(second.id).toBe('game-second')
    expect(first.id).not.toBe(second.id)
    expect(first.orderMarket).toEqual(second.orderMarket)
  })

  it('отклоняет пустой внешний ID', () => {
    expect(() => createSetup('   ')).toThrow('Game ID must be a non-empty string')
  })

  it('восстанавливает только согласованный снимок, копирует и глубоко замораживает его', () => {
    const source = structuredClone(createSetup().state)
    const restored = restoreGameState(source)

    expect(restored).toEqual(source)
    expect(restored).not.toBe(source)
    expect(Object.isFrozen(restored)).toBe(true)
    expect(Object.isFrozen(restored.players)).toBe(true)
    expect(Object.isFrozen(source)).toBe(false)
  })

  it.each([
    ['прежняя версия схемы', { stateSchemaVersion: 8 }],
    ['неизвестный статус промежуточного подсчёта', { intermediateScoringStatus: 'unknown' }],
    ['несогласованная фаза', { phase: 'regular_play' }],
    ['неизвестный активный игрок', {
      phase: 'regular_play',
      status: 'in_progress',
      round: 1,
      firstPlayerId: 'player-1',
      activePlayerId: 'missing',
    }],
  ])('отклоняет повреждённый снимок: %s', (_title, patch) => {
    const source = structuredClone(createSetup().state)

    expect(() => restoreGameState({ ...source, ...patch })).toThrow('Invalid game state:')
  })

  it('скрывает преждевременный выбор первого игрока и чужую приватную раздачу', () => {
    const transition = createSetup()
    const playerEvents = projectEventsForViewer(
      transition.events,
      transition.state,
      'player-1',
    )
    const observerEvents = projectEventsForViewer(
      transition.events,
      transition.state,
      null,
    )

    expect(playerEvents).not.toContainEqual(expect.objectContaining({
      type: 'FirstPlayerSelected',
    }))
    expect(playerEvents.filter(event => event.type === 'PrivateGoalsDealt')).toEqual([
      { type: 'PrivateGoalsDealt', playerId: 'player-1' },
    ])
    expect(observerEvents.some(event => event.type === 'PrivateGoalsDealt')).toBe(false)
    expect(Object.isFrozen(playerEvents)).toBe(true)
  })

  it('раскрывает выбор первого игрока после завершения setup', () => {
    const transition = createSetup()
    const regularPlay = startGame(
      completeStartingLocationSelection(transition.state),
    ).state
    const events = projectEventsForViewer(transition.events, regularPlay, null)

    expect(events).toContainEqual({
      type: 'FirstPlayerSelected',
      playerId: 'player-1',
    })
  })

  it('показывает событие запуска завершения игрокам и наблюдателю', () => {
    const setup = createSetup()
    const regularPlay = startGame(
      completeStartingLocationSelection(setup.state),
    ).state
    const transition = triggerGameEnd(withGameEndConditions(regularPlay))

    expect(projectEventsForViewer(
      transition.events,
      transition.state,
      'player-1',
    )).toEqual([{ type: 'GameEndTriggered' }])
    expect(projectEventsForViewer(
      transition.events,
      transition.state,
      null,
    )).toEqual([{ type: 'GameEndTriggered' }])
  })
})
