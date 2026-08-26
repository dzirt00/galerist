import { describe, expect, it } from 'vitest'
import { createGame, startGame, advanceTurn, type GameConfig, type GameState, type PlayerState } from './index.js'

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

it( 'prevents changes to the state-config', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина', kind: 'human' },
    { id: 'player-2', name: 'Алина', kind: 'human' },
  ]
  const conf: GameConfig = { playerCount: 2, seed: 42 }
  const confEdit: GameConfig = { playerCount: 3, seed: 55 }

  const state = createGame( conf, players )

  expect( () => Object.assign( state.config as GameConfig, confEdit)).toThrow()
  expect(state.config).toEqual({ playerCount: 2, seed: 42 })
})

it( 'name no change', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина1', kind: 'human' },
    { id: 'player-2', name: 'Алина2', kind: 'human' },
  ]
  const conf: GameConfig = { playerCount: 2, seed: 42 }

  const state = createGame( conf, players )
  players[0].name= 'Огого'
  expect((state.players[0].name === 'Алина1')).toBe(true)
})

it( 'should throw an error when players have duplicate IDs', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина1', kind: 'human' },
    { id: 'player-1', name: 'Алина2', kind: 'human' },
  ]
  const conf: GameConfig = { playerCount: 2, seed: 42 }

  expect(() => createGame(conf, players)).toThrow('Players must have unique IDs')
})


it('prohibition on modifying the player object.', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина1', kind: 'human' },
    { id: 'player-2', name: 'Алина2', kind: 'human' },
  ]

  const conf: GameConfig = { playerCount: 2, seed: 42 }

  const game = createGame(conf, players)

  expect(() => {(game.players[0] as any).name = 'Алина3'}).toThrow(Error)
  expect(game.players[0].name).toBe('Алина1')
})

it('you can\'t change the round from outside', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина1', kind: 'human' },
    { id: 'player-2', name: 'Алина2', kind: 'human' },
  ]

  const conf: GameConfig = { playerCount: 2, seed: 42 }

  const game = createGame(conf, players)

  expect(() => {(game.round as any) = 1}).toThrow(Error)
  expect(game.round).toBe(0)
})

it('startGame is const? no mutation', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина1', kind: 'human' },
    { id: 'player-2', name: 'Алина2', kind: 'human' },
  ]

  const conf: GameConfig = { playerCount: 2, seed: 42 }
  const game = createGame(conf, players)
  const sg = startGame(game)

  expect(game.status).toBe('setup')
  expect(game.round).toBe(0)
  expect(game.activePlayerId).toBe(null)

  expect(sg).not.toBe(game)

  expect(sg.status).toBe('in_progress')
  expect(sg.round).toBe(1)
  expect(sg.activePlayerId).toBe('player-1')

  expect(() => {
    (sg as any).round = 2
  }).toThrow()

  expect(sg.round).toBe(1)
})

it('activePlayerId next active player, round is const', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина1', kind: 'human' },
    { id: 'player-2', name: 'Алина2', kind: 'human' },
  ]

  const conf: GameConfig = { playerCount: 2, seed: 42 }
  const game = createGame(conf, players)
  const sg = startGame(game)

  let nextStep = advanceTurn(sg)

  expect(nextStep.activePlayerId).toBe('player-2')
  expect(nextStep.round).toBe(1)
  expect(sg).not.toBe(nextStep)
  expect(sg.activePlayerId).toBe('player-1')
  expect(sg.round).toBe(1)
})

it('next round, activePlayerId first player', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина1', kind: 'human' },
    { id: 'player-2', name: 'Алина2', kind: 'human' },
  ]

  const conf: GameConfig = { playerCount: 2, seed: 42 }
  const game = createGame(conf, players)
  const sg = startGame(game)

  const nextStep1 = advanceTurn(sg)
  const nextStep2 = advanceTurn(nextStep1)

  expect(nextStep1.activePlayerId).toBe('player-2');
  expect(nextStep2.activePlayerId).toBe('player-1');
  expect(nextStep1.round).toBe(1);
  expect(nextStep2.round).toBe(2);
  expect(nextStep1).not.toBe(nextStep2);
  expect(() => {(nextStep2 as any).round = 3;}).toThrow();

  expect(nextStep2.round).toBe(2);
})
