import type { GameState, PlayerId } from "./types.js";
import { actionOrderMarket, type TypeActionOrderMarket } from "./action-order-market.js";
import { type GameTransition } from "./game-events.js";
import { changeStatusPlayer } from "./change-status-player.js";


export function receiveOrder(
  state: GameState,
  playerId:PlayerId,
  typeAction: TypeActionOrderMarket,
  orderId: string | null = null,
  boarderSlotOrderId: string | null = null
): GameTransition<GameState> {

  if(state.phase !== 'ending_current_round' && state.phase !== 'regular_play' && state.phase !== 'final_round') {
    throw new Error( 'Invalid phase' )
  }
  let copyState:GameState = structuredClone(state)
  let player = copyState.players.find(el => el.id === playerId)
  if ( player === undefined ) {
    throw new Error( `invalid player` );
  }
  if(player.status === 'WAITING' ) {
    copyState = {
      ...changeStatusPlayer(copyState,player.id).state,
    }
  }

  return actionOrderMarket(copyState, playerId, typeAction,orderId,boarderSlotOrderId)
}
