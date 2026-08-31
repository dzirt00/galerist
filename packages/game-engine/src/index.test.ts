import { expect, it } from 'vitest'
import { createGame ,startGame, advanceTurn, type EndingSequenceGameState, type GameConfig, type GameState, type PlayerState, type FinishedGameState, triggerGameEnd, type SetupGameState } from './index.js'

const stateConst: GameState = {
  id: 'game-1',
  status: 'setup',
  phase: 'setup',
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

const configConst: GameConfig = { playerCount: 2, seed: 42 }
const playerConst: PlayerState[] = [
  { id: 'player-1', name: 'Алина', kind: 'human' },
  { id: 'player-2', name: 'Бот', kind: 'bot' },
]

function advanceAndExpectTurns(
  initialState: GameState,
  expectedTurns: readonly { activePlayerId: string; round: number }[],
) {
  const initialStateSnapshot = structuredClone(initialState)
  const nextStates: GameState[] = []
  const nextStateSnapshots: GameState[] = []
  let previousState = initialState

  for (const expectedTurn of expectedTurns) {
    const nextState = advanceTurn(previousState)

    expect(nextState).not.toBe(previousState)
    nextStates.push(nextState)
    nextStateSnapshots.push(structuredClone(nextState))

    expect(nextState.id).toBe(initialState.id)
    expect(nextState.status).toBe(initialState.status)
    expect(nextState.config).toEqual(initialState.config)
    expect(nextState.players).toEqual(initialState.players)
    expect(Object.isFrozen(nextState)).toBe(true)
    expect(nextState.activePlayerId).toBe(expectedTurn.activePlayerId)
    expect(nextState.round).toBe(expectedTurn.round)

    previousState = nextState
  }

  expect(nextStates).toEqual(nextStateSnapshots)
  expect(initialState).toEqual(initialStateSnapshot)
}

type EndingTurnExpectation = readonly [
  phase: 'ending_current_round' | 'final_round' | 'final_scoring',
  round: number,
  firstPlayerId: string,
  activePlayerId: string | null,
]

function isEndingSequenceGameState(
  state: GameState,
): state is EndingSequenceGameState {
  return state.phase === 'ending_current_round'
    || state.phase === 'final_round'
    || state.phase === 'final_scoring'
}

function expectEndingTurns(
  states: readonly GameState[],
  initialState: GameState,
  expectedTurns: readonly EndingTurnExpectation[],
) {
  expect(states).toHaveLength(expectedTurns.length)

  states.forEach((state, index) => {
    const [phase, round, firstPlayerId, activePlayerId] = expectedTurns[index]!

    expect(state.phase).toBe(phase)
    if (!isEndingSequenceGameState(state)) {
      throw new Error(`Expected an ending state, received ${state.phase}`)
    }

    expect(state.round).toBe(round)
    expect(state.firstPlayerId).toBe(firstPlayerId)
    expect(state).toMatchObject({ endTriggeredRound: initialState.round })
    expect(state.status).toBe('in_progress')
    expect(state.config).toEqual(initialState.config)
    expect(state.players).toEqual(initialState.players)
    expect(state.activePlayerId).toEqual(activePlayerId)
  })
}

  it( 'stores the initial game data', () => {
    const state = structuredClone(stateConst)
    expect( state.status ).toBe( 'setup' )
    expect( state.players ).toHaveLength( 2 )
  } )


it('createGame is frozen', () =>{
  const state = createGame( configConst, playerConst )
  let sg = startGame(state)
  const sgClone = structuredClone(sg)

  expect(() => startGame(sg)).toThrow('Game can only be started from setup')
  expect(sg).toEqual(sgClone)
  expect(state.phase).toBe('setup')
  expect(state.activePlayerId).toBe(null)
  expect(state).not.toHaveProperty('endTriggeredRound');
  expect(state).not.toHaveProperty('firstPlayerId');

})

it('finish game', () => {
  const state: FinishedGameState = {
    id: 'game-1',
    config: configConst,
    players:  playerConst,
    phase: 'finished',
    status: 'finished',
    round: 0,
    activePlayerId: null,
    firstPlayerId: 'player-1',
    endTriggeredRound: 0
  }

  const stateClone = structuredClone(state)
  expect(() => startGame(state)).toThrow('Game can only be started from setup')
  expect(state).toEqual(stateClone)
})

it( 'creates a deterministic initial game', () => {
  const state = createGame( configConst, playerConst )

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
      configConst,
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
  type Mutable<T> = { -readonly [K in keyof T]: T[K] }
  const conf: GameConfig = { playerCount: 2, seed: 42 }
  const players: Mutable<PlayerState>[] = [
    { id: 'player-1', name: 'Алина1', kind: 'human' },
    { id: 'player-2', name: 'Алина2', kind: 'human' },
  ]

  const state = createGame(conf, players)
  players[0]!.name = 'world'
  expect(state.players[0]!.name).toBe('Алина1')
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
  expect(game.players[0]!.name).toBe('Алина1')
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

it('3 players ,next round, activePlayerId first player', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина1', kind: 'human' },
    { id: 'player-2', name: 'Алина2', kind: 'human' },
    { id: 'player-3', name: 'Алина3', kind: 'human' },
  ]

  const conf: GameConfig = { playerCount: 3, seed: 42 }
  const game = createGame(conf, players)
  const sg = startGame(game)

  advanceAndExpectTurns(sg, [
    { activePlayerId: 'player-2', round: 1 },
    { activePlayerId: 'player-3', round: 1 },
    { activePlayerId: 'player-1', round: 2 },
    { activePlayerId: 'player-2', round: 2 },
    { activePlayerId: 'player-3', round: 2 },
    { activePlayerId: 'player-1', round: 3 },
  ])
})

it('4 players ,next round, activePlayerId first player', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина1', kind: 'human' },
    { id: 'player-2', name: 'Алина2', kind: 'human' },
    { id: 'player-3', name: 'Алина3', kind: 'human' },
    { id: 'player-4', name: 'Алина4', kind: 'human' },
  ]

  const conf: GameConfig = { playerCount: 4, seed: 4 }
  const game = createGame(conf, players)
  const sg = startGame(game)

  advanceAndExpectTurns(sg, [
    { activePlayerId: 'player-2', round: 1 },
    { activePlayerId: 'player-3', round: 1 },
    { activePlayerId: 'player-4', round: 1 },
    { activePlayerId: 'player-1', round: 2 },
    { activePlayerId: 'player-2', round: 2 },
    { activePlayerId: 'player-3', round: 2 },
    { activePlayerId: 'player-4', round: 2 },
    { activePlayerId: 'player-1', round: 3 },
  ])
})

it('advanceTurn status only progress, now setup', () => {
  const state = createGame(
    { playerCount: 2, seed: 42 },
    [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
  )
  const stateCLone = structuredClone(state)
  expect(() => advanceTurn(state)).toThrow('Turns can only be advanced while game is in progress')
  expect(state).toEqual(stateCLone)
})

it('advanceTurn status only progress, now finished', () => {

  const state: GameState = {
    id: 'game-1',
    phase: 'finished',
    status: 'finished',
    round: 0,
    activePlayerId: null,
    firstPlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
    endTriggeredRound: 0
  }
  const stateCLone = structuredClone(state)
  expect(() => advanceTurn(state)).toThrow('Turns can only be advanced while game is in progress')
  expect(state).toEqual(stateCLone)
})

it('triggerGameEnd creates a frozen new state without mutating input', () => {
  const state: GameState = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 10,
    activePlayerId: 'player-1',
    config: { playerCount: 2, seed: 42 },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
    firstPlayerId: 'player-2',
  }
  const stateBefore = structuredClone(state)

  const trigger = triggerGameEnd(state)

  expect(trigger).not.toBe(state)
  expect(Object.isFrozen(trigger)).toBe(true)
  expect(state).toEqual(stateBefore)

  expect(trigger.id).toBe(state.id)
  expect(trigger.phase).toBe('ending_current_round')
  expect(trigger.status).toBe('in_progress')
  expect(trigger.round).toBe(10)
  expect(trigger.endTriggeredRound).toBe(10)
  expect(trigger.activePlayerId).toBe('player-1')
  expect(trigger.firstPlayerId).toBe('player-2')
  expect(trigger.config).toBe(state.config)
  expect(trigger.players).toBe(state.players)
})

it('advanceTurn rejects a null activePlayerId', () => {
  const state = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 0,
    activePlayerId: null,
    config: { playerCount: 2, seed: 42 },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
    firstPlayerId: 'player-1',
  }
  const stateBefore = structuredClone(state)

  expect(() => advanceTurn(state as unknown as GameState)).toThrow(
    'Active player must belong to the game',
  )
  expect(state).toEqual(stateBefore)
})



it(' should return a new frozen state and preserve the original state', () => {
  const initialState: GameState = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 1,
    activePlayerId: 'player-1',
    config: { playerCount: 2, seed: 42 },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
    firstPlayerId: 'player-1',
  };

  const originalStateSnapshot = structuredClone(initialState);
  const nextState = advanceTurn(initialState);

  expect(initialState).toEqual(originalStateSnapshot);
  expect(nextState).not.toBe(initialState);
  expect(Object.isFrozen(nextState)).toBe(true);

});


it('advanceTurn activePlayerId random name', () => {
  const state: GameState = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 0,
    activePlayerId: 'random',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
    firstPlayerId: 'player-1',
  }

  const stateCLone = structuredClone(state)
  expect(() => advanceTurn(state)).toThrow('Active player must belong to the game')
  expect(state).toEqual(stateCLone)
})

it('advanceTurn phase:setup error', () => {
  const state = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'setup',
    round: 0,
    activePlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
    firstPlayerId: 'player-1',
  }

  const stateCLone = structuredClone(state)
  expect(() => advanceTurn(state as unknown as GameState)).toThrow('Turns can only be advanced while game is in progress')
  expect(state).toEqual(stateCLone)
})

it('advanceTurn phase:regular_play', () => {
  const state: GameState = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 0,
    activePlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
    firstPlayerId: 'player-1'
  }

  const stateCLone = structuredClone(state)
  const res = advanceTurn(state)
  expect(res.activePlayerId).toBe('player-2')
  expect(res.firstPlayerId).toBe('player-1')
  expect(res.phase).toBe('regular_play')
  expect(state).toEqual(stateCLone)
})

it('startGame phase:regular_play', () => {
  const state = createGame(configConst, playerConst)
  const sg = startGame(state)

  expect(sg.status).toBe('in_progress')
  expect(sg.phase).toBe('regular_play')
  expect(sg.activePlayerId).toBe('player-1')
  expect(sg.firstPlayerId).toBe('player-1')

})

it(' EndingCurrentRoundGameState ending_current_round', () => {
  const state: GameState = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'ending_current_round',
    round: 0,
    activePlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
    firstPlayerId: 'player-1',
    endTriggeredRound: 1
  }
  const et = advanceTurn(state)

  expect(et.status).toBe('in_progress')
  expect(et.phase).toBe('ending_current_round')
  expect(et.endTriggeredRound).toBe(1)

})

it('phase: final_scoring error', () => {
  const state: GameState = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'final_scoring',
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
    firstPlayerId: 'player-1',
    endTriggeredRound: 1
  }

  expect(() => advanceTurn(state)).toThrow('Turns can only be advanced while game is in progress')

})

it('activePlayerId and firstPlayerId', () => {
  const state: GameState = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 1,
    activePlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
    firstPlayerId: 'player-2',
  }
  const at1 = advanceTurn(state)
  const at2 = advanceTurn(at1)
  expect(at2.round).toBe(2)
  expect(at1.round).toBe(2)
  expect(at1.activePlayerId).toBe('player-2')
  expect(at1.firstPlayerId).toBe('player-2')
  expect(at2.activePlayerId).toBe('player-1')
  expect(at2.firstPlayerId).toBe('player-2')

})

it('final_round advanceTurn', () => {
  const state: GameState = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'final_round',
    round: 10,
    activePlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
    firstPlayerId: 'player-2',
    endTriggeredRound: 2
  }
  const at = advanceTurn(state)

  expect(at.phase).toBe('final_scoring')
  expect(at.firstPlayerId).toBe('player-2')
  expect(at.endTriggeredRound).toBe(2)
})

it('triggerGameEnd, is regular_play', () => {
  const state: GameState = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 10,
    activePlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
    ],
    firstPlayerId: 'player-2',
  }

  const trigger = triggerGameEnd(state)
  const triggerClone = structuredClone(trigger)

  expect(trigger.phase).toBe('ending_current_round')
  expect(trigger.endTriggeredRound).toBe(10)
  expect(trigger.players).toEqual(state.players)
  expect(trigger.config).toEqual(state.config)
  expect(trigger.firstPlayerId).toBe(state.firstPlayerId)
  expect(trigger.round).toBe(state.round)
  expect(trigger.status).toBe(state.status)
  expect(trigger.activePlayerId).toBe(state.activePlayerId)
  expect(trigger).toEqual(triggerClone)
})

it('triggerGameEnd rejects a repeated call', () => {
  const regularState = startGame(createGame(configConst, playerConst))
  const endingState = triggerGameEnd(regularState)
  const endingStateBefore = structuredClone(endingState)

  expect(() => triggerGameEnd(endingState)).toThrow('Only regular_play')
  expect(endingState).toEqual(endingStateBefore)
})

it('final_scoring, all round', () => {
  const state: GameState = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 10,
    activePlayerId: 'player-1',
    config: {
      playerCount: 3,
      seed: 42,
    },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
      { id: 'player-3', name: 'Бот', kind: 'bot' },
    ],
    firstPlayerId: 'player-1',
  }

  const trigger = triggerGameEnd(state)
  const at1 = advanceTurn(trigger)
  const at2 = advanceTurn(at1)
  const at3 = advanceTurn(at2)
  const at4 = advanceTurn(at3)
  const at5 = advanceTurn(at4)
  const at6 = advanceTurn(at5)


  expectEndingTurns([at1, at2, at3, at4, at5, at6], state, [
    ['ending_current_round', 10, 'player-1', 'player-2'],
    ['ending_current_round', 10, 'player-1', 'player-3'],
    ['final_round', 11, 'player-1', 'player-1'],
    ['final_round', 11, 'player-1', 'player-2'],
    ['final_round', 11, 'player-1', 'player-3'],
    ['final_scoring', 11, 'player-1', null],
  ])
})

it('final_scoring, all round firstPlayerId: player-2 activePlayerId: player-1', () => {
  const state: GameState = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 10,
    activePlayerId: 'player-1',
    config: {
      playerCount: 3,
      seed: 42,
    },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
      { id: 'player-3', name: 'Бот', kind: 'bot' },
    ],
    firstPlayerId: 'player-2',
  }

  const trigger = triggerGameEnd(state)
  const at1 = advanceTurn(trigger)
  const at2 = advanceTurn(at1)
  const at3 = advanceTurn(at2)
  const at4 = advanceTurn(at3)

  expectEndingTurns([at1, at2, at3, at4], state, [
    ['final_round', 11, 'player-2', 'player-2'],
    ['final_round', 11, 'player-2', 'player-3'],
    ['final_round', 11, 'player-2', 'player-1'],
    ['final_scoring', 11, 'player-2', null],
  ])

})

it('final_scoring, all round firstPlayerId: player-2 activePlayerId: player-3', () => {
  const state: GameState = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 10,
    activePlayerId: 'player-1',
    config: {
      playerCount: 3,
      seed: 42,
    },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Бот', kind: 'bot' },
      { id: 'player-3', name: 'Бот', kind: 'bot' },
    ],
    firstPlayerId: 'player-3',
  }

  const trigger = triggerGameEnd(state)
  const at1 = advanceTurn(trigger)
  const at2 = advanceTurn(at1)
  const at3 = advanceTurn(at2)
  const at4 = advanceTurn(at3)
  const at5 = advanceTurn(at4)

  expectEndingTurns([at1, at2, at3, at4, at5], state, [
    ['ending_current_round', 10, 'player-3', 'player-2'],
    ['final_round', 11, 'player-3', 'player-3'],
    ['final_round', 11, 'player-3', 'player-1'],
    ['final_round', 11, 'player-3', 'player-2'],
    ['final_scoring', 11, 'player-3', null],
  ])

})

it('final_scoring, all round firstPlayerId: player-2 activePlayerId: player-3', () => {
  const state: SetupGameState = createGame(configConst,playerConst)
  expect(() => triggerGameEnd(state)).toThrow('Only regular_play')
})

it.each([
  { seed: 0, expectedPlayer: 'player-1' },
  { seed: 1, expectedPlayer: 'player-2' },
  { seed: 2, expectedPlayer: 'player-3' },
  { seed: 3, expectedPlayer: 'player-1' },
])('выбирает $expectedPlayer при seed: $seed', ({ seed, expectedPlayer }) => {
  const cg = createGame(
    { playerCount: 3, seed },
    [
      { id: 'player-1', name: 'Алина', kind: 'human' },
      { id: 'player-2', name: 'Алина', kind: 'human' },
      { id: 'player-3', name: 'Алина', kind: 'human' },
    ]
  )
  const sg = startGame(cg)

  expect(sg.firstPlayerId).toBe(expectedPlayer)
  expect(sg.activePlayerId).toBe(expectedPlayer)
})

it('выбирает одного и того же игрока при одинаковом seed', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина', kind: 'human' },
    { id: 'player-2', name: 'Алина', kind: 'human' },
    { id: 'player-3', name: 'Алина', kind: 'human' },
  ]

  const cg1 = createGame({ playerCount: 3, seed: 42 }, players)
  const sg1 = startGame(cg1)

  const cg2 = createGame({ playerCount: 3, seed: 42 }, players)
  const sg2 = startGame(cg2)

  expect(sg1.firstPlayerId).toBe(sg2.firstPlayerId)
})

it('проверка невалидных значений в seed', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина', kind: 'human' },
    { id: 'player-2', name: 'Алина', kind: 'human' },
    { id: 'player-3', name: 'Алина', kind: 'human' },
  ]
  const cg = createGame({ playerCount: 3, seed: -1 }, players)
  const sg = startGame(cg)
  expect(sg.firstPlayerId).toBe('player-3')
  expect(() => createGame({ playerCount: 3, seed: NaN }, players)).toThrow('Seed must be a safe integer')
  expect(() => createGame({ playerCount: 3, seed: Infinity }, players)).toThrow('Seed must be a safe integer')
  expect(() => createGame({ playerCount: 3, seed: 9007199254740992 },players)).toThrow('Seed must be a safe integer')
  expect(() => createGame({ playerCount: 3, seed: 42.32 },players)).toThrow('Seed must be a safe integer')
})

it('каждый ID игрока достижим подходящим seed', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина', kind: 'human' },
    { id: 'player-2', name: 'Алина', kind: 'human' },
    { id: 'player-3', name: 'Алина', kind: 'human' },
  ]

  const firstPlayersSelected: Set<string> = new Set()

  for (let seed = 0; seed < 10; seed++) {
    const cg = createGame({ playerCount: 3, seed }, players)
    const sg = startGame(cg)

    firstPlayersSelected.add(sg.firstPlayerId)
  }

  expect(firstPlayersSelected.size).toBe(players.length)

  expect(firstPlayersSelected.has('player-1')).toBe(true)
  expect(firstPlayersSelected.has('player-2')).toBe(true)
  expect(firstPlayersSelected.has('player-3')).toBe(true)
})

it('переходы хода и увеличение раунда при первом игроке, отличном от players[0]', () => {
  const players: PlayerState[] = [
    { id: 'player-1', name: 'Алина', kind: 'human' },
    { id: 'player-2', name: 'Алина', kind: 'human' },
    { id: 'player-3', name: 'Алина', kind: 'human' },
  ]
  const conf: GameConfig = { playerCount: 3, seed: 1 }
    const cg = createGame(conf, players)
    const sg = startGame(cg)
    const at1 = advanceTurn(sg)
    const at2 = advanceTurn(at1)
    const at3 = advanceTurn(at2)

    expect(sg.round).toBe(1)
    expect(sg.firstPlayerId).toBe('player-2')
    expect(sg.activePlayerId).toBe('player-2')
    expect(at1.round).toBe(1)
    expect(at1.firstPlayerId).toBe('player-2')
    expect(at1.activePlayerId).toBe('player-3')
    expect(at2.round).toBe(1)
    expect(at2.firstPlayerId).toBe('player-2')
    expect(at2.activePlayerId).toBe('player-1')
    expect(at3.round).toBe(2)
    expect(at3.firstPlayerId).toBe('player-2')
    expect(at3.activePlayerId).toBe('player-2')
})
