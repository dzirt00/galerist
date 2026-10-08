import type { GameState, PlayerId } from "./types.js";
import { refreshOrderMarket } from "./refresh-order-market.js";
import { freezeTransition, type GameEvent } from "./game-events.js";

export type TypeActionOrderMarket = 'REFRESH' | 'DECLINE' | 'ACCEPT_ORDER'

export function actionOrderMarket(
  state: GameState,
  playerId: PlayerId,
  typeAction:TypeActionOrderMarket,
  orderId: string | null = null
) {
  if(state.phase !== 'ending_current_round' && state.phase !== 'regular_play' && state.phase !== 'final_round') {
    throw new Error( 'Invalid phase' )
  }
  let copyState:GameState = structuredClone(state)
  const playerIndex = copyState.players.findIndex(el => el.id === playerId)
  if(playerIndex === -1 ) throw new Error( 'Invalid player' )
  let player = copyState.players[playerIndex]
  if(player === undefined) throw new Error( 'Invalid player' )
  if(typeAction !== 'REFRESH' && typeAction !== 'ACCEPT_ORDER' && typeAction !== 'DECLINE') {
    throw new Error( 'Invalid type' )
  }


  if(typeAction === 'ACCEPT_ORDER') throw new Error( 'Invalid type' )


  let events: GameEvent[] = []
  if(typeAction === 'REFRESH') {
    if(player.status !== 'PENDING') throw new Error( 'Invalid player status' )
    const updateMarket = refreshOrderMarket(copyState,playerId)
    player = {
      ...player,
      status: 'REFRESH',
    }

    copyState = {
      ...updateMarket.state,
      players: updateMarket.state.players.map((playerItem, index) =>
        index === playerIndex
          ? { ...playerItem, ...player }
          : playerItem
      ),
    }

    events.push(...updateMarket.events)
  } else if (typeAction === 'DECLINE') {
    if(player.status !== 'REFRESH') throw new Error( 'Invalid player status' )
    player = {
      ...player,
      status: 'REFUSAL',
    }
    copyState = {
      ...copyState,
      players: copyState.players.map((playerItem, index) =>
        index === playerIndex
          ? { ...playerItem, ...player }
          : playerItem
      )
    }
  }

  return freezeTransition(copyState,events)


}
