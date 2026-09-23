import { describe, expect, it } from 'vitest'

import {
  applyInfluenceGainToGameState,
  projectEventsForViewer,
  type SetupGameState,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'

function createMutableSetupState(
  firstInfluence = 12,
  secondInfluence = 34,
): SetupGameState {
  const state = structuredClone(createGameState(
    { playerCount: 2, seed: 7 },
    [
      { id: 'first', name: 'Алина', kind: 'human' },
      { id: 'second', name: 'Борис', kind: 'bot' },
    ],
  ))

  return {
    ...state,
    players: state.players.map(player => ({
      ...player,
      influence: player.id === 'first' ? firstInfluence : secondInfluence,
    })),
  }
}

describe('applyInfluenceGainToGameState', () => {
  it('начисляет влияние выбранному игроку и публикует фактический прирост', () => {
    const state = createMutableSetupState()
    const snapshot = structuredClone(state)

    const result = applyInfluenceGainToGameState(state, 'second', 30)

    expect(result.state.players.map(player => [player.id, player.influence])).toEqual([
      ['first', 12],
      ['second', 35],
    ])
    expect(result.events).toEqual([{
      type: 'InfluenceReceived',
      playerId: 'second',
      gainedInfluence: 1,
    }])
    expect(projectEventsForViewer(result.events, result.state, null)).toEqual(result.events)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.state)).toBe(true)
    expect(Object.isFrozen(result.state.players)).toBe(true)
    expect(Object.isFrozen(result.state.players[1])).toBe(true)
    expect(Object.isFrozen(result.events)).toBe(true)
    expect(Object.isFrozen(result.events[0])).toBe(true)
    expect(state).toEqual(snapshot)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(state.players)).toBe(false)
  })

  it.each([
    ['нулевой прирост', 12, 0],
    ['верхняя граница шкалы', 35, 4],
  ] as const)('при условии «%s» возвращает новое состояние без события', (_case, influence, gain) => {
    const state = createMutableSetupState(influence)
    const originalPlayer = state.players[0]!
    const snapshot = structuredClone(state)

    const result = applyInfluenceGainToGameState(state, 'first', gain)

    expect(result.state).toEqual(snapshot)
    expect(result.events).toEqual([])
    expect(result.state).not.toBe(state)
    expect(result.state.players).not.toBe(state.players)
    expect(result.state.players[0]).not.toBe(originalPlayer)
    expect(state).toEqual(snapshot)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(state.config)).toBe(false)
    expect(Object.isFrozen(state.players)).toBe(false)
    expect(Object.isFrozen(originalPlayer)).toBe(false)
  })

  it('сохраняет поля конкретной фазы игры', () => {
    const state = startGameAfterSetup(createGameState(
      { playerCount: 2, seed: 0 },
      [
        { id: 'first', name: 'Алина', kind: 'human' },
        { id: 'second', name: 'Борис', kind: 'bot' },
      ],
    ))

    const result = applyInfluenceGainToGameState(state, 'first', 2)

    expect(result.state).toMatchObject({
      phase: 'regular_play',
      status: 'in_progress',
      round: 1,
      activePlayerId: state.activePlayerId,
      firstPlayerId: state.firstPlayerId,
    })
    expect(result.events).toEqual([{
      type: 'InfluenceReceived',
      playerId: 'first',
      gainedInfluence: 2,
    }])
  })

  it.each([
    ['неизвестный ID игрока', 'missing', 1, 'Invalid game state or PlayerId'],
    ['отрицательный прирост', 'first', -1, 'gainedInfluence must be a non-negative safe integer'],
  ] as const)('отклоняет %s без изменения входа', (_case, playerId, gain, message) => {
    const state = createMutableSetupState()
    const snapshot = structuredClone(state)

    expect(() => applyInfluenceGainToGameState(state, playerId, gain)).toThrow(message)
    expect(state).toEqual(snapshot)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(state.players)).toBe(false)
    expect(state.players.every(player => !Object.isFrozen(player))).toBe(true)
  })
})
