import type { GameState, PlayerId } from "./types.js";
import { freezeTransition, type GameTransition } from "./game-events.js";


export function changeStatusPlayer(
  state: GameState,
  playerId: PlayerId,
): GameTransition<GameState> {
  if(state.phase !== 'ending_current_round' && state.phase !== 'regular_play' && state.phase !== 'final_round') {
    throw new Error( 'Invalid phase' )
  }
  const playerIndex = state.players.findIndex( player => player.id === playerId )
  let player = structuredClone(state.players[ playerIndex ])
  if ( player === undefined ) {
    throw new Error( `invalid player` );
  }
  if(player.status === 'REFUSAL' || player.status === 'SUCCESS' || player.status === 'REFRESH' || player.status === 'PENDING') {
    throw new Error( 'Invalid status' )
  }
  if ( player.status === 'WAITING' ) {
    player = {
      ...player,
      status: 'PENDING'
    }
  }
  const updateState = structuredClone(state)
  return freezeTransition( {
    ...updateState,
    players: updateState.players.map( ( playerItem, index ) =>
      index === playerIndex
        ? { ...playerItem, ...player }
        : playerItem
    ),
  }, [] )
}
