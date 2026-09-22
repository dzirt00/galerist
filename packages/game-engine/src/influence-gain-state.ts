import type { GameState, PlayerId } from "./types.js";
import { applyInfluenceGainToPlayer } from "./influence-gain-award.js";

/**
 * Начисляет влияние выбранному игроку и возвращает новое замороженное состояние игры.
 * Сохраняет порядок игроков и не изменяет входное состояние.
 * Отклоняет неизвестный ID игрока или недопустимый прирост влияния.
 */
export function applyInfluenceGainToGameState(
  state: Readonly<GameState>,
  playerId: PlayerId,
  gainedInfluence: number,
): Readonly<GameState> {

  const playerIndex = state.players.findIndex( player => player.id === playerId );

  if ( playerIndex === -1 ) {
    throw new Error( 'Invalid game state or PlayerId' );
  }

  const updatedPlayer = applyInfluenceGainToPlayer( state.players[ playerIndex ]!, gainedInfluence )
  const updatedPlayers = [ ...state.players ]
  updatedPlayers[ playerIndex ] = updatedPlayer
  const frozenPlayers = Object.freeze(updatedPlayers)

  return Object.freeze({
    ...state,
    players: frozenPlayers,
  })
}
