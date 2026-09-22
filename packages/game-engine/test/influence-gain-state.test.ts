import { describe, expect, it } from 'vitest'

import {
  applyInfluenceGainToGameState,
  createGame,
  startGame,
  type SetupGameState,
} from '../src/index.js'

function createMutableSetupState(): SetupGameState {
  return {
    id: 'game-test',
    config: { playerCount: 2, seed: 7 },
    players: [
      { id: 'first', name: 'Алина', kind: 'human', coins: 10, influence: 12 },
      { id: 'second', name: 'Борис', kind: 'bot', coins: 10, influence: 34 },
    ],
    phase: 'setup',
    status: 'setup',
    round: 0,
    activePlayerId: null,
  }
}

describe('applyInfluenceGainToGameState', () => {
  it('начисляет влияние выбранному игроку, ограничивая шкалу значением 35', () => {
    const state = createGame(
      { playerCount: 2, seed: 5 },
      [
        { id: 'first', name: 'Алина', kind: 'human' },
        { id: 'second', name: 'Борис', kind: 'bot' },
      ],
    )

    const result = applyInfluenceGainToGameState(state, 'second', 30)

    expect(result.players.map(player => [player.id, player.influence])).toEqual([
      ['first', 10],
      ['second', 35],
    ])
    expect(result.players[0]).toBe(state.players[0])
    expect(result.players[1]).not.toBe(state.players[1])
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.players)).toBe(true)
    expect(Object.isFrozen(result.players[1])).toBe(true)
  })

  it('при нулевом приросте возвращает новое состояние и не замораживает вход', () => {
    const state = createMutableSetupState()
    const originalPlayer = state.players[0]!
    const snapshot = structuredClone(state)

    const result = applyInfluenceGainToGameState(state, 'first', 0)

    expect(result).toEqual(snapshot)
    expect(result).not.toBe(state)
    expect(result.players).not.toBe(state.players)
    expect(result.players[0]).not.toBe(originalPlayer)
    expect(state).toEqual(snapshot)
    expect(Object.isFrozen(state)).toBe(false)
    expect(Object.isFrozen(state.config)).toBe(false)
    expect(Object.isFrozen(state.players)).toBe(false)
    expect(Object.isFrozen(originalPlayer)).toBe(false)
  })

  it('сохраняет поля конкретной фазы игры', () => {
    const state = startGame(createGame(
      { playerCount: 2, seed: 0 },
      [
        { id: 'first', name: 'Алина', kind: 'human' },
        { id: 'second', name: 'Борис', kind: 'bot' },
      ],
    ))

    const result = applyInfluenceGainToGameState(state, 'first', 2)

    expect(result).toMatchObject({
      phase: 'regular_play',
      status: 'in_progress',
      round: 1,
      activePlayerId: state.activePlayerId,
      firstPlayerId: state.firstPlayerId,
    })
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
