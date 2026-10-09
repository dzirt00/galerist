import type { GameState, PlayerId } from "./types.js";
import { refreshOrderMarket } from "./refresh-order-market.js";
import { freezeTransition, type GameEvent } from "./game-events.js";
import { applyTicketRewardToGameState, type TicketRewardRequest } from "./ticket-reward-to-game-state.js";

export type TypeActionOrderMarket = 'REFRESH' | 'DECLINE' | 'ACCEPT_ORDER'

export function actionOrderMarket(
  state: GameState,
  playerId: PlayerId,
  typeAction:TypeActionOrderMarket,
  orderId: string | null = null,
  boarderSlotOrderId: string | null = null
) {
  if(state.phase !== 'ending_current_round' && state.phase !== 'regular_play' && state.phase !== 'final_round') {
    throw new Error( 'Invalid phase' )
  }
  let copyState:GameState = structuredClone(state)
  let player = copyState.players.find(elem => elem.id === playerId)
  if(player === undefined) throw new Error( 'Invalid player' )
  if(typeAction !== 'REFRESH' && typeAction !== 'ACCEPT_ORDER' && typeAction !== 'DECLINE') {
    throw new Error( 'Invalid type' )
  }

  let events: GameEvent[] = []
  if(typeAction === 'ACCEPT_ORDER' && player.status !== 'PENDING' && player.status !== 'REFRESH') {
    throw new Error( 'Invalid status' )
  }

  if(typeAction === 'ACCEPT_ORDER') {
   let playerBoard = copyState.playerBoards.find(board => board.playerId === playerId)
   if(playerBoard === undefined) throw new Error( 'Invalid board')
   if(boarderSlotOrderId !== '1' && boarderSlotOrderId !== '2' ) throw new Error( 'Invalid boarderSlotOrderId' )
   if(playerBoard.boardOrders[boarderSlotOrderId].orderId !== null) throw new Error( 'Invalid boardOrder' )
    let isOrder = false
    let keyOrder: string | null = null
    for(let [key, value] of Object.entries(copyState.orderMarket.visibleOrders)) {
      if(value === orderId) {
        isOrder = true
        keyOrder = key
      }
    }
    if(!isOrder) throw new Error( 'Invalid order' )
    if(keyOrder === null ) throw new Error( 'Invalid order' )
    if(orderId === null ) throw new Error( 'Invalid order' )
    if(copyState.orderMarket.remainingOrderIds.length === 0 && copyState.orderMarket.orderMarket[keyOrder as '1'|'2'|'3'|'4'].length === 0) throw new Error( 'Invalid order market' )
    if(boarderSlotOrderId === '1' && copyState.ticketOffice.ticketsByColor['B'] <= 1) throw new Error( 'Invalid tickets of tickets' )
    if(boarderSlotOrderId === '2' && copyState.ticketOffice.ticketsByColor['R'] <= 1) throw new Error( 'Invalid tickets of tickets' )
    playerBoard = {
      ...playerBoard,
      boardOrders: {
        ...playerBoard.boardOrders,
        [boarderSlotOrderId] : {
          orderId: copyState.orderMarket.visibleOrders[keyOrder as '1'|'2'|'3'|'4'],
          orderStatus: 'unfulfilled'
        }
      }
    }

    copyState = {
      ...copyState,
      playerBoards: copyState.playerBoards.map( board => board.playerId === playerId ? {...board, ...playerBoard } : board),
    }
    events.push({  type: 'OrderTaken',  playerId: playerId, orderId: orderId })
    const orderMarket = copyState.orderMarket.orderMarket[keyOrder as '1'|'2'|'3'|'4'];
    const updateVisibleOrders =  (orderMarket.length !== 0) ? orderMarket[orderMarket.length-1]: copyState.orderMarket.remainingOrderIds[0]
    const inputApplyTicketRewardToGameState: TicketRewardRequest = {
      playerId: playerId,
      requestedColors: (boarderSlotOrderId === '1') ? ['B'] : ['R'],
    }

    const resultApplyTicketRewardToGameState = applyTicketRewardToGameState(copyState, inputApplyTicketRewardToGameState)
    events.push(...resultApplyTicketRewardToGameState.events)
    copyState = {
      ...resultApplyTicketRewardToGameState.state
    }

    copyState = {
      ...copyState,
      orderMarket: {
          ...copyState.orderMarket,
        visibleOrders: {
            ...copyState.orderMarket.visibleOrders,
          [keyOrder]: updateVisibleOrders
        },
        orderMarket: {
            ...copyState.orderMarket.orderMarket,
          [keyOrder]: (orderMarket.length === 0) ? orderMarket : orderMarket.slice(0, -1)
        },
        remainingOrderIds: (orderMarket.length === 0) ? copyState.orderMarket.remainingOrderIds.slice(1) : copyState.orderMarket.remainingOrderIds
      },
      players: copyState.players.map((playerItem) =>
        (playerItem.id === playerId)
          ? { ...playerItem, status: 'SUCCESS' }
          : playerItem

      ),
    }
    if(orderMarket.length === 0) {
      events.push({  type: 'OrderMarketRefilled'})
    }

  }
  if(typeAction === 'REFRESH') {
    if(player.status !== 'PENDING') throw new Error( 'Invalid player status' )
    const updateMarket = refreshOrderMarket(copyState,playerId)
    player = {
      ...player,
      status: 'REFRESH',
    }

    copyState = {
      ...updateMarket.state,
      players: updateMarket.state.players.map((playerItem) =>
        playerItem.id === playerId
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
      players: copyState.players.map((playerItem) =>
        playerItem.id === playerId
          ? { ...playerItem, ...player }
          : playerItem
      )
    }
  }

  return freezeTransition(copyState,events)


}
