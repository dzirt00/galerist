import { describe, expect, it } from 'vitest'
import { createGame, type GameConfig, type GameState, type PlayerState } from './index.js'

describe( 'GameState', () => {
  it( 'stores the initial game data', () => {
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

    expect( state.status ).toBe( 'setup' )
    expect( state.players ).toHaveLength( 2 )
  } )
} )

it( 'creates a deterministic initial game', () => {
  const state = createGame(
    { playerCount: 2, seed: 42 },
    [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
  )

  expect( state ).toMatchObject( {
    id: 'game-42',
    status: 'setup',
    round: 0,
    activePlayerId: null,
    config: { playerCount: 2, seed: 42 },
  } )
  expect( state.players ).toHaveLength( 2 )
} )

it( 'rejects a player count that differs from the configuration', () => {
  expect( () =>
    createGame(
      { playerCount: 2, seed: 42 },
      [ { id: 'player-1', name: 'Алина', kind: 'human' } ],
    ),
  ).toThrow( 'Player count must match config.playerCount' )
} )

it('keeps its own player list', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина', kind: 'human' },
    { id: 'player-2', name: 'Алина', kind: 'human' }
  ]
  const player: PlayerState =  { id: 'player-3', name: 'Алина', kind: 'human' }

  const state = createGame({ playerCount: 2, seed: 42 }, players)
  players.push(player)
  expect(state.players).toHaveLength(2)
  expect(state.players.some(val => val.id === 'player-3')).toBe(false)
})

it( 'prevents changes to the state-owned player list', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина', kind: 'human' },
    { id: 'player-2', name: 'Алина', kind: 'human' },
  ]
  const player: PlayerState = {
    id: 'player-3',
    name: 'Алина',
    kind: 'human',
  }

  const state = createGame( { playerCount: 2, seed: 42 }, players )

  expect( () => ( state.players as PlayerState[] ).push( player ) ).toThrow()
  expect( state.players ).toHaveLength( 2 )
})

it( 'keeps its own game configuration', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина', kind: 'human' },
    { id: 'player-2', name: 'Алина', kind: 'human' },
  ]
  const conf: GameConfig = { playerCount: 2, seed: 42 }

  const state = createGame( conf, players )
  Object.assign(conf, { playerCount: 4, seed: 421 })

  expect(state.config).toEqual({ playerCount: 2, seed: 42 })
})
