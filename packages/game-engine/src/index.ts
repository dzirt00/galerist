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
  config: Readonly<GameConfig>
  players: readonly PlayerState[]
}

export function createGame(
  config: GameConfig,
  players: readonly PlayerState[],
): GameState {
  if (players.length !== config.playerCount) {
    throw new Error('Player count must match config.playerCount')
  }

  const hasDuplicates = new Set(players.map(item => item.id)).size !== players.length;

  if(hasDuplicates) {
    throw new Error('Players must have unique IDs')
  }

  const newPlayers: PlayerState[] = []

  players.forEach((player: PlayerState) => {
    newPlayers.push({
      id: player.id,
      name: player.name,
      kind: player.kind,
    })
  })

  return {
    id: `game-${config.seed}`,
    status: 'setup',
    round: 0,
    activePlayerId: null,
    config: Object.freeze( { ...config }),
    players: Object.freeze([ ...newPlayers ]),
  }
}
