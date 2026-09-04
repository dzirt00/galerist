import type {
  GameConfig,
  GameState,
  PlayerConfig,
  PlayerState,
} from '../src/index.js'

export const twoPlayerStates: PlayerState[] = [
  { id: 'player-1', name: 'Алина', kind: 'human', coins: 10, influence: 10 },
  { id: 'player-2', name: 'Алина', kind: 'human', coins: 10, influence: 10 },
]

export const threePlayerStates: PlayerState[] = [
  { id: 'player-1', name: 'Алина1', kind: 'human', coins: 10, influence: 10 },
  { id: 'player-2', name: 'Алина2', kind: 'human', coins: 10, influence: 10 },
  { id: 'player-3', name: 'Алина3', kind: 'human', coins: 10, influence: 10 },
]

export const setupGameStateFixture: GameState = {
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
    { id: 'player-1', name: 'Алина', kind: 'human', coins: 10, influence: 10 },
    { id: 'player-2', name: 'Бот', kind: 'bot', coins: 10, influence: 10 },
  ],
}

export const twoPlayerGameConfig: GameConfig = { playerCount: 2, seed: 42 }

export const twoPlayerConfigs: PlayerConfig[] = [
  { id: 'player-1', name: 'Алина', kind: 'human' },
  { id: 'player-2', name: 'Бот', kind: 'bot' },
]

export const threePlayerConfigs: PlayerConfig[] = [
  { id: 'player-1', name: 'Алина', kind: 'human' },
  { id: 'player-2', name: 'Бот', kind: 'bot' },
  { id: 'player-3', name: 'Бот', kind: 'bot' },
]

export const fourPlayerConfigs: PlayerConfig[] = [
  { id: 'player-1', name: 'Алина', kind: 'human' },
  { id: 'player-2', name: 'Бот', kind: 'bot' },
  { id: 'player-3', name: 'Бот', kind: 'bot' },
  { id: 'player-4', name: 'Бот', kind: 'bot' },
]
