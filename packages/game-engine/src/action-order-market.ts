import { returnAssistantToOffice } from './return-assistant-to-office.js'
import type { GameState, PlayerId } from "./types.js";
import { refreshOrderMarket } from "./refresh-order-market.js";
import { freezeTransition, type GameEvent } from "./game-events.js";
import { applyTicketRewardToGameState, type TicketRewardRequest } from "./ticket-reward-to-game-state.js";
import type { SetupTicketColor } from "./component-catalog.js";
import type { OrderStatus } from "./player-boards.js";

interface OrderFromBoard {
  orderId: string | null,
  orderStatus: OrderStatus | null,
}

export type TypeActionOrderMarket = 'REFRESH' | 'DECLINE' | 'ACCEPT_ORDER'

/**
 * Продолжает отдельное действие получения заказа (ORDER-002/003).
 * receiveOrder начинает действие; здесь применяются получение, обновление или отказ.
 * Возвращает новый замороженный state/events, не завершая обычный ход.
 */
export function actionOrderMarket(
  state: GameState,
  playerId: PlayerId,
  typeAction: TypeActionOrderMarket,
  orderId: string | null = null,
  boarderSlotOrderId: string | null = null,
  requestedColor: SetupTicketColor | null = null,
  replacementColorsByRequestedColor?: Readonly<
    Partial<Record<SetupTicketColor, SetupTicketColor>>
  >
) {
  if ( state.phase !== 'ending_current_round' && state.phase !== 'regular_play' && state.phase !== 'final_round' ) {
    throw new Error( 'Invalid phase' )
  }
  // Все эффекты собираются в копии: ошибка не оставляет изменений во входном state.
  let copyState: GameState = structuredClone( state )
  let player = copyState.players.find( elem => elem.id === playerId )
  if ( player === undefined ) throw new Error( 'Invalid player' )
  if ( typeAction !== 'REFRESH' && typeAction !== 'ACCEPT_ORDER' && typeAction !== 'DECLINE' ) {
    throw new Error( 'Invalid type' )
  }

  let events: GameEvent[] = []
  if ( typeAction === 'ACCEPT_ORDER' && player.status !== 'PENDING' && player.status !== 'REFRESH' ) {
    throw new Error( 'Invalid status' )
  }

  if ( typeAction === 'ACCEPT_ORDER' ) {
    // Планшет ищем по владельцу: порядок playerBoards может отличаться от порядка игроков.
    const playerBoardIndex = copyState.playerBoards.findIndex( ( board ) => board.playerId === playerId )
    if ( playerBoardIndex === -1 || playerBoardIndex === undefined ) throw new Error( 'Invalid board' )
    let playerBoard = copyState.playerBoards.find( ( board ) => board.playerId === playerId )

    if ( playerBoard === undefined ) throw new Error( 'Invalid board' )
    if ( boarderSlotOrderId !== '1' && boarderSlotOrderId !== '2' && boarderSlotOrderId !== '3' ) throw new Error( 'Invalid boarderSlotOrderId' )
    // Допустимы пустая клетка и замена completed; unfulfilled заменять нельзя.
    if ( playerBoard.boardOrders[ boarderSlotOrderId ].orderId !== null && playerBoard.boardOrders[ boarderSlotOrderId ].orderStatus === 'unfulfilled' ) throw new Error( 'Invalid boardOrder' )
    let isOrder = false
    let keyOrder: string | null = null
    for ( let [ key, value ] of Object.entries( copyState.orderMarket.visibleOrders ) ) {
      if ( value === orderId ) {
        isOrder = true
        keyOrder = key
      }
    }
    if ( !isOrder ) throw new Error( 'Invalid order' )
    if ( keyOrder === null ) throw new Error( 'Invalid order' )
    if ( orderId === null ) throw new Error( 'Invalid order' )
    // Сохраняем старый ID до перезаписи. Он нужен для сброса completed, а orderId — новый заказ.
    const oldOrderId = playerBoard.boardOrders[ boarderSlotOrderId ].orderId
    playerBoard = {
      ...playerBoard,
      boardOrders: {
        ...playerBoard.boardOrders,
        [ boarderSlotOrderId ]: {
          orderId: copyState.orderMarket.visibleOrders[ keyOrder as '1' | '2' | '3' | '4' ],
          orderStatus: 'unfulfilled',
          assistant: null
        }
      }
    }
    copyState = {
      ...copyState,
      playerBoards: copyState.playerBoards.map( board => board.playerId === playerId ? { ...board, ...playerBoard } : board ),
      orderMarket: {
        ...copyState.orderMarket,
        // Исходный статус читаем из state: в playerBoard уже записан новый unfulfilled.
        orderDiscard: ( state.playerBoards[ playerBoardIndex ]!.boardOrders[ boarderSlotOrderId ].orderStatus === 'completed' && oldOrderId !== null ) ? [ ...copyState.orderMarket.orderDiscard, oldOrderId ] : [ ...copyState.orderMarket.orderDiscard ]
      }
    }
    // Событие сброса старого заказа предшествует получению нового.
    if ( state.orderMarket.orderDiscard.length !== copyState.orderMarket.orderDiscard.length && oldOrderId !== null ) {
      events.push( { type: 'OrderDiscarded', playerId: playerId, orderId: oldOrderId } )
    }
    events.push( { type: 'OrderTaken', playerId: playerId, orderId: orderId } )

    // Нижние карты идут от самой нижней к ближайшей к верху; раскрывается последняя.
    const orderMarket = copyState.orderMarket.orderMarket[ keyOrder as '1' | '2' | '3' | '4' ];

    let updateVisibleOrders: string | null = null
    if( orderMarket.length > 0) {
      const lastOrder = orderMarket.at(-1);
      if (lastOrder !== undefined) {
        updateVisibleOrders = lastOrder;
        copyState = {
          ...copyState,
          orderMarket: {
            ...copyState.orderMarket,
            visibleOrders: {
              ...copyState.orderMarket.visibleOrders,
              [ keyOrder ]: updateVisibleOrders
            },
            orderMarket: {
              ...copyState.orderMarket.orderMarket,
              [ keyOrder ]: ( orderMarket.length === 0 ) ? orderMarket : orderMarket.slice( 0, -1 )
            },
            remainingOrderIds: ( orderMarket.length === 0 ) ? copyState.orderMarket.remainingOrderIds.slice( 1 ) : copyState.orderMarket.remainingOrderIds
          },
          players: copyState.players.map( ( playerItem ) =>
            ( playerItem.id === playerId )
              ? { ...playerItem, status: 'SUCCESS' }
              : playerItem
          ),
        }
      }

    } else if (copyState.orderMarket.remainingOrderIds.length > 0 ) {
      const lastOrder = copyState.orderMarket.remainingOrderIds.at(0);
      if (lastOrder !== undefined) {
        updateVisibleOrders = lastOrder;
        copyState = {
          ...copyState,
          orderMarket: {
            ...copyState.orderMarket,
            visibleOrders: {
              ...copyState.orderMarket.visibleOrders,
              [ keyOrder ]: updateVisibleOrders
            },
            orderMarket: {
              ...copyState.orderMarket.orderMarket,
              [ keyOrder ]: ( orderMarket.length === 0 ) ? orderMarket : orderMarket.slice( 0, -1 )
            },
            remainingOrderIds: ( orderMarket.length === 0 ) ? copyState.orderMarket.remainingOrderIds.slice( 1 ) : copyState.orderMarket.remainingOrderIds
          },
          players: copyState.players.map( ( playerItem ) =>
            ( playerItem.id === playerId )
              ? { ...playerItem, status: 'SUCCESS' }
              : playerItem
          ),
        }
      }
    } else {
      copyState = {
        ...copyState,
        orderMarket: {
          ...copyState.orderMarket,
          visibleOrders: {
            ...copyState.orderMarket.visibleOrders,
            [ keyOrder ]: null
          }
        }
      }

      const updateMarket = refreshOrderMarket( copyState, playerId )
      player = {
        ...player,
        status: 'SUCCESS',
      }

      copyState = {
        ...updateMarket.state,
        players: updateMarket.state.players.map( ( playerItem ) =>
          playerItem.id === playerId
            ? { ...playerItem, ...player }
            : playerItem
        ),
      }
      events.push(...updateMarket.events)
    }



    const oldBoardPlayer = state.playerBoards[playerBoardIndex]!
    const returned = returnAssistantToOffice(playerBoard, oldBoardPlayer.boardOrders[boarderSlotOrderId].assistant)
    const orderRewardSides = { ...playerBoard.orderRewardSides }
    delete orderRewardSides[Number(boarderSlotOrderId) as 1 | 2 | 3]
    playerBoard = { ...playerBoard, assistants: returned.assistants, orderRewardSides }
    copyState = { ...copyState, playerBoards: copyState.playerBoards.map((board, index) => index === playerBoardIndex ? playerBoard : board) }
    events.push(...returned.events)
    // Билет положен только за ИСХОДНО пустую клетку. Замена completed пропускает всю ветку,
    // включая выбор цвета третьей клетки и проверку замещения отсутствующего билета.
    if ( state.playerBoards[ playerBoardIndex ]!.boardOrders[ boarderSlotOrderId ].orderId === null ) {

      let requestedColors: SetupTicketColor[];
      if ( boarderSlotOrderId === '1' ) {
        requestedColors = [ 'B' ];
      } else if ( boarderSlotOrderId === '2' ) {
        requestedColors = [ 'R' ];
      } else if ( requestedColor !== null ) {
        requestedColors = [ requestedColor ];
      } else {
        throw new Error( 'Invalid requestedColor' )
      }

      const inputApplyTicketRewardToGameState: TicketRewardRequest = {
        playerId: playerId,
        requestedColors: requestedColors,
        replacementColorsByRequestedColor: ( replacementColorsByRequestedColor !== undefined ) ? replacementColorsByRequestedColor : {}
      }
      // Готовая функция владеет выдачей/замещением и триггерами подсчёта и завершения.
      // Сохраняем весь её state/events, чтобы последующее обновление рынка не потеряло эффекты.
      const resultApplyTicketRewardToGameState = applyTicketRewardToGameState( copyState, inputApplyTicketRewardToGameState )
      events.push( ...resultApplyTicketRewardToGameState.events )
      copyState = {
        ...resultApplyTicketRewardToGameState.state
      }
    }

    // При раскрытии нижней карты OrderMarketRefilled не создаётся; при доборе идёт последним.
    if ( orderMarket.length === 0 ) {
      events.push( { type: 'OrderMarketRefilled' } )
    }

  }
  // Обновление доступно один раз после начала; его state/events сохраняются целиком.
  if ( typeAction === 'REFRESH' ) {
    if ( player.status !== 'PENDING' ) throw new Error( 'Invalid player status' )
    const updateMarket = refreshOrderMarket( copyState, playerId )
    player = {
      ...player,
      status: 'REFRESH',
    }

    copyState = {
      ...updateMarket.state,
      players: updateMarket.state.players.map( ( playerItem ) =>
        playerItem.id === playerId
          ? { ...playerItem, ...player }
          : playerItem
      ),
    }

    events.push( ...updateMarket.events )
  // Отказ после REFRESH меняет этап действия, но не откатывает уже обновлённый рынок.
  } else if ( typeAction === 'DECLINE' ) {
    if ( player.status !== 'REFRESH' ) throw new Error( 'Invalid player status' )
    player = {
      ...player,
      status: 'REFUSAL',
    }
    copyState = {
      ...copyState,
      players: copyState.players.map( ( playerItem ) =>
        playerItem.id === playerId
          ? { ...playerItem, ...player }
          : playerItem
      )
    }
  }

  return freezeTransition( copyState, events )


}
