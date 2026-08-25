export type GameId = string
export type PlayerId = string

export type GameStatus = 'setup' | 'in_progress' | 'finished'
export type PlayerKind = 'human' | 'bot'

export interface GameConfig {
  playerCount: 2 | 3 | 4
  seed: number
}

export interface PlayerState {
  readonly id: PlayerId
  readonly name: string
  readonly kind: PlayerKind
}

export interface GameState {
  readonly id: GameId
  readonly status: GameStatus
  readonly round: number
  readonly activePlayerId: PlayerId | null
  readonly config: Readonly<GameConfig>
  readonly players: readonly PlayerState[]
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
    newPlayers.push(Object.freeze({
      id: player.id,
      name: player.name,
      kind: player.kind,
    }))
  })

  return Object.freeze({
    id: `game-${config.seed}`,
    status: 'setup',
    round: 0,
    activePlayerId: null,
    config: Object.freeze( { ...config }),
    players: Object.freeze([ ...newPlayers ]),
  })
}

export function startGame(state: GameState): GameState {
  return Object.freeze({
    id: state.id,
    status: 'in_progress',
    round: 1,
    activePlayerId: state.players[0]!.id,
    config: state.config,
    players: state.players
  })
}
