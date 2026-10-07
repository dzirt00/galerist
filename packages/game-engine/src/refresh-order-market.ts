import type { GameState, PlayerId } from "./types.js";
import { freezeTransition, type GameTransition } from "./game-events.js";

type KeyOrderMarket = 1 | 2 | 3 | 4
const marketKeys: KeyOrderMarket[] = [1,2,3,4]
export function refreshOrderMarket(
  state: GameState,
  playerID: PlayerId
): GameTransition<GameState> {
  if(state.phase !== 'ending_current_round' && state.phase !== 'regular_play' && state.phase !== 'final_round') throw new Error('Invalid phase')
  const player = state.players.find(player => player.id === playerID);
  if(player === undefined) throw new Error('Invalid player')
  if(state.orderMarket.remainingOrderIds.length < 4) throw new Error('Invalid order market remainingOrderIds')

  const visibleOrders = { ...state.orderMarket.visibleOrders }
  const orderMarket = { ...state.orderMarket.orderMarket }
  for (const key of marketKeys){
    orderMarket[key] = [...state.orderMarket.orderMarket[key]]
  }

  const orderDiscard = [ ...state.orderMarket.orderDiscard ]
  const remainingOrderIds = [ ...state.orderMarket.remainingOrderIds ]

  for (const key of marketKeys) {
    const order = visibleOrders[key];
    if (order !== null) {
      orderMarket[key].push(order);
    }
    visibleOrders[key] = remainingOrderIds.shift()!
  }

  return freezeTransition( {
    ...state,
    orderMarket: {
      ...state.orderMarket,
      visibleOrders: visibleOrders ,
      orderMarket: orderMarket,
      orderDiscard: orderDiscard,
      remainingOrderIds: remainingOrderIds
    }
  },[{ type: 'OrderMarketRefreshed', playerId: player.id }])

}
