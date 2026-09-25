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
    ['неизвестная версия схемы', { stateSchemaVersion: 5 }],
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
    const transition = triggerGameEnd(regularPlay)

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
