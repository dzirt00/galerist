import type { GameState, PlayerId } from "./types.js";
import { actionOrderMarket, type TypeActionOrderMarket } from "./action-order-market.js";
import { type GameTransition } from "./game-events.js";
import { changeStatusPlayer } from "./change-status-player.js";
import type { SetupTicketColor } from "./component-catalog.js";


/**
 * Начинает или продолжает отдельное действие получения заказа через actionOrderMarket.
 * При WAITING проверяет лимит один раз; при PENDING/REFRESH сохраняет уже пройденный этап.
 * Возвращает все эффекты выбранного получения, обновления или отказа без передачи обычного хода.
 */
export function receiveOrder(
  state: GameState,
  playerId:PlayerId,
  typeAction: TypeActionOrderMarket,
  orderId: string | null = null,
  boarderSlotOrderId: string | null = null,
  requestedColor: SetupTicketColor | null = null,
  replacementColorsByRequestedColor?: Readonly<
    Partial<Record<SetupTicketColor, SetupTicketColor>>
  >
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

  return (replacementColorsByRequestedColor === undefined )
    ? actionOrderMarket(copyState, playerId, typeAction,orderId,boarderSlotOrderId,requestedColor)
    : actionOrderMarket(copyState, playerId, typeAction,orderId,boarderSlotOrderId,requestedColor,replacementColorsByRequestedColor)
}
