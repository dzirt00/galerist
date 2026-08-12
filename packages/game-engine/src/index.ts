export type GameId = string
export type PlayerId = string

export type GameStatus = 'setup' | 'in_progress' | 'finished'
export type PlayerKind = 'human' | 'bot'

export interface GameConfig {
  playerCount: 2 | 3 | 4
  seed: number
}

export interface PlayerState {
  id: PlayerId
  name: string
  kind: PlayerKind
}

export interface GameState {
  id: GameId
  status: GameStatus
  round: number
  activePlayerId: PlayerId | null
  config: GameConfig
  players: readonly PlayerState[]
}
