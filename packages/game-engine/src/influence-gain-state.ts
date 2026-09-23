import type { GameEvent, GameTransition } from './game-events.js'
import { freezeTransition } from './game-events.js'
import { applyInfluenceGainToPlayer } from './influence-gain-award.js'
import type { GameState, PlayerId } from './types.js'

/**
 * Начисляет влияние выбранному игроку по INFLUENCE-001.
 * Сохраняет порядок игроков и не изменяет входное состояние.
 * Отклоняет неизвестный ID игрока или недопустимый прирост влияния.
 */
export function applyInfluenceGainToGameState(
  state: Readonly<GameState>,
  playerId: PlayerId,
  gainedInfluence: number,
): GameTransition<Readonly<GameState>> {
  const playerIndex = state.players.findIndex(player => player.id === playerId);

  if (playerIndex === -1) {
    throw new Error('Invalid game state or PlayerId');
  }

  const updatedPlayer = applyInfluenceGainToPlayer(state.players[playerIndex]!, gainedInfluence)
  const updatedPlayers = [...state.players]
  updatedPlayers[playerIndex] = updatedPlayer
  const actualGainedInfluence = updatedPlayer.influence - state.players[playerIndex]!.influence
  const updatedState = structuredClone({
    ...state,
    players: updatedPlayers,
  })
  const events: readonly GameEvent[] = actualGainedInfluence === 0
    ? []
    : [{
        type: 'InfluenceReceived',
        playerId,
        gainedInfluence: actualGainedInfluence,
      }]

  return freezeTransition(updatedState, events)
}
