export type GameId = string
export type PlayerId = string

export type GameStatus = 'setup' | 'in_progress' | 'finished'
export type PlayerKind = 'human' | 'bot'
export type GamePhase = 'setup'| 'regular_play' | 'ending_current_round' | 'final_round' | 'final_scoring' | 'finished'

export interface GameStateBase {
  readonly id: GameId
  readonly config: Readonly<GameConfig>
  readonly players:  readonly PlayerState[]
}

export interface RegularPlayGameState extends GameStateBase {
  readonly phase: 'regular_play'
  readonly status: 'in_progress'
  readonly round: number
  readonly activePlayerId: PlayerId
  readonly firstPlayerId: PlayerId
}

export interface EndingCurrentRoundGameState extends GameStateBase {
  readonly phase: 'ending_current_round'
  readonly status: 'in_progress'
  readonly round: number
  readonly activePlayerId: PlayerId
  readonly firstPlayerId: PlayerId
  readonly endTriggeredRound: number
}

export interface FinalRoundGameState extends GameStateBase {
  readonly phase: 'final_round'
  readonly status: 'in_progress'
  readonly round: number
  readonly activePlayerId: PlayerId
  readonly firstPlayerId: PlayerId
  readonly endTriggeredRound: number
}

export interface FinalScoringGameState extends GameStateBase {
  readonly phase: 'final_scoring'
  readonly status: 'in_progress'
  readonly round: number
  readonly activePlayerId: null
  readonly firstPlayerId: PlayerId
  readonly endTriggeredRound: number
}

export interface FinishedGameState extends GameStateBase {
  readonly phase: 'finished'
  readonly status: 'finished'
  readonly round: number
  readonly activePlayerId: null
  readonly firstPlayerId: PlayerId
  readonly endTriggeredRound: number
}

export interface SetupGameState extends GameStateBase {
  readonly phase: 'setup'
  readonly status: 'setup'
  readonly round: 0
  readonly activePlayerId: null
}

export interface GameConfig {
  playerCount: 2 | 3 | 4
  seed: number
}

export interface PlayerState {
  readonly id: PlayerId
  readonly name: string
  readonly kind: PlayerKind
}

export interface GameState extends GameStateBase {
  readonly status: GameStatus
  readonly round: number
  readonly activePlayerId: PlayerId | null
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

  if(state.status !== 'setup') throw new Error('Game can only be started from setup')

  return Object.freeze({
    id: state.id,
    status: 'in_progress',
    round: 1,
    activePlayerId: state.players[0]!.id,
    config: state.config,
    players: state.players
  })
}

export function advanceTurn(state: GameState): GameState {

  if(state.status !== 'in_progress') throw new Error('Turns can only be advanced while game is in progress')

  const havePlayer = state.players.find(player => player.id === state.activePlayerId)

  if(havePlayer === undefined) throw new Error('Active player must belong to the game')

  const activePlayerId = state.activePlayerId
  const currentIndex = state.players.findIndex(p => p.id === activePlayerId)
  const nextIndex = (currentIndex + 1) % state.players.length
  const nextPlayer = state.players[nextIndex]!.id
  const round = (state.players[nextIndex]!.id === state.players[0]!.id) ? state.round + 1 : state.round

  return  Object.freeze({
    id: state.id,
    status: state.status,
    round: round,
    activePlayerId: nextPlayer,
    config: state.config,
    players: state.players
  })
}
