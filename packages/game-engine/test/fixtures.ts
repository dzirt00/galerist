import type {
  GameConfig,
  GameState,
  PlayerConfig,
  PlayerState, WinnerCandidate,
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

export const player1: WinnerCandidate = {
  playerId: 'player-1',
  coins: 100,
  acquiredArtworkCount: 12,
  galleryVisitorCount: 23,
  assistantsInPlayCount: 444
}
export const player2: WinnerCandidate = {
  playerId: 'player-2',
  coins: 1000,
  acquiredArtworkCount: 12,
  galleryVisitorCount: 23,
  assistantsInPlayCount: 444
}
export const player3: WinnerCandidate = {
  playerId: 'player-3',
  coins: 1001,
  acquiredArtworkCount: 2,
  galleryVisitorCount: 1,
  assistantsInPlayCount: 3
}
export const player4: WinnerCandidate = {
  playerId: 'player-4',
  coins: 1002,
  acquiredArtworkCount: 1,
  galleryVisitorCount: 2,
  assistantsInPlayCount: 1
}

export const player5: WinnerCandidate = {
  playerId: 'player-5',
  coins: 1002,
  acquiredArtworkCount: 2,
  galleryVisitorCount: 2,
  assistantsInPlayCount: 1
}
export const player6: WinnerCandidate = {
  playerId: 'player-6',
  coins: 1002,
  acquiredArtworkCount: 2,
  galleryVisitorCount: 3,
  assistantsInPlayCount: 1
}

export const player7: WinnerCandidate = {
  playerId: 'player-7',
  coins: 1002,
  acquiredArtworkCount: 2,
  galleryVisitorCount: 3,
  assistantsInPlayCount: 2
}

export const player8: WinnerCandidate = {
  playerId: 'player-8',
  coins: 1002,
  acquiredArtworkCount: 2,
  galleryVisitorCount: 3,
  assistantsInPlayCount: 2
}

export const player9: WinnerCandidate = {
  playerId: 'player-9',
  coins: 1002,
  acquiredArtworkCount: 2,
  galleryVisitorCount: 3,
  assistantsInPlayCount: 2
}

export const player10: WinnerCandidate = {
  playerId: 'player-10',
  coins: 1002,
  acquiredArtworkCount: 2,
  galleryVisitorCount: 3,
  assistantsInPlayCount: 2
}

export const player11: WinnerCandidate = {
  playerId: 'player-11',
  coins: 1003,
  acquiredArtworkCount: 2,
  galleryVisitorCount: 3,
  assistantsInPlayCount: 2
}

export const player12: WinnerCandidate = {
  playerId: 'player-12',
  coins: 1003,
  acquiredArtworkCount: 2,
  galleryVisitorCount: 3,
  assistantsInPlayCount: 2
}

export const player13: WinnerCandidate = {
  playerId: 'player-13',
  coins: 1,
  acquiredArtworkCount: 2,
  galleryVisitorCount: 3,
  assistantsInPlayCount: 1000
}
export const onePlayer: WinnerCandidate[] = [player1]
export const soleLeaderCoins : WinnerCandidate[] = [player1,player2,player3,player4]
export const acquiredArtworkCountWin : WinnerCandidate[] = [player5,player2,player3,player4]
export const galleryVisitorCountWin : WinnerCandidate[] = [player5,player6,player3,player4]
export const assistantsInPlayCountWin : WinnerCandidate[] = [player5,player6,player7,player4]
export const allWin : WinnerCandidate[] = [player10,player9,player7,player8]
export const nextWin : WinnerCandidate[] = [player10,player11,player12,player13]
