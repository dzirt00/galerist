import { describe, expect, it } from 'vitest'
import { createGame, type GameState } from './index.js'

describe('GameState', () => {
  it('stores the initial game data', () => {
    const state: GameState = {
      id: 'game-1',
      status: 'setup',
      round: 0,
      activePlayerId: null,
      config: {
        playerCount: 2,
        seed: 42,
      },
      players: [
        { id: 'player-1', name: 'Алина', kind: 'human' },
        { id: 'player-2', name: 'Бот', kind: 'bot' },
      ],
    }

    expect(state.status).toBe('setup')
    expect(state.players).toHaveLength(2)
  })
})

it('creates a deterministic initial game', () => {
  const state = createGame(
    { playerCount: 2, seed: 42 },
    [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
  )

  expect(state).toMatchObject({
    id: 'game-42',
    status: 'setup',
    round: 0,
    activePlayerId: null,
    config: { playerCount: 2, seed: 42 },
  })
  expect(state.players).toHaveLength(2)
})
