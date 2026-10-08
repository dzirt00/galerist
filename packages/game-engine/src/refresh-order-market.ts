import type { GameState, PlayerId } from "./types.js";
import { freezeTransition, type GameEvent, type GameTransition } from "./game-events.js";
import { createRuntimeRng } from "./runtime-rng.js";
import type { PreparedOrderMarket } from "./setup-orders.js";

type KeyOrderMarket = 1 | 2 | 3 | 4
const marketKeys: KeyOrderMarket[] = [ 1, 2, 3, 4 ]

export function refreshOrderMarket(
  state: GameState,
  playerID: PlayerId
): GameTransition<GameState> {
  if ( state.phase !== 'ending_current_round' && state.phase !== 'regular_play' && state.phase !== 'final_round' ) throw new Error( 'Invalid phase' )
  const player = state.players.find( player => player.id === playerID );
  if ( player === undefined ) throw new Error( 'Invalid player' )

  const visibleOrders = { ...state.orderMarket.visibleOrders }
  const orderMarket = { ...state.orderMarket.orderMarket }
  for ( const key of marketKeys ) {
    orderMarket[ key ] = [ ...state.orderMarket.orderMarket[ key ] ]
  }
  const orderDiscard = [ ...state.orderMarket.orderDiscard ]
  const remainingOrderIds = [ ...state.orderMarket.remainingOrderIds ]
  let orderMarketByState: PreparedOrderMarket | null = null
  let runtimeRng = null
  let events: GameEvent[] = []

  if ( remainingOrderIds.length < 4 ) {
    const orderForShuffle: string[] = []
    orderDiscard.forEach( el => {
      orderForShuffle.push( el )
    } )
    for ( let el of Object.values( visibleOrders ) ) {
      if ( el !== null ) {
        orderForShuffle.push( el )
      }
    }
    for ( let val of Object.values( orderMarket ) ) {
      val.forEach( ( el ) => {
        orderForShuffle.push( el )
      } )
    }
    orderForShuffle.push(...remainingOrderIds)

    if(orderForShuffle.length < 4) throw new Error(`Invalid order for shuffle ${orderForShuffle.length}`)

    const input = {
      runtimeRng: state.runtimeRng,
      rulesVersion: state.setupVersions.rulesVersion,
      componentsVersion: state.setupVersions.componentsVersion,
      seedString: String( state.config.seed ),
      playerIds: state.players.map( player => player.id ),
      streamId: 'orders/recycle' as const,
      counterString: state.runtimeRng.runtimeRngCounters[ 'orders/recycle' ],
      orderMarket: orderForShuffle
    }
    const shuffleOrderMarket = createRuntimeRng( input )
    const updateOrderMarket = shuffleOrderMarket.orderMarket.map( el => el )
    runtimeRng = shuffleOrderMarket.runtimeRng
    let updateVisibleOrders: Record<1 | 2 | 3 | 4, string | null> = {
      1: null,
      2: null,
      3: null,
      4: null,
    }
    for ( let i = 1; i <= 4; i++ ) {
      const order = updateOrderMarket.shift()
      if ( order !== undefined ) {
        updateVisibleOrders[ i as 1 | 2 | 3 | 4 ] = order
      }
    }

    orderMarketByState = {
      visibleOrders: updateVisibleOrders,
      orderMarket: {
        1: [],
        2: [],
        3: [],
        4: []
      },
      orderDiscard: [],
      remainingOrderIds: [ ...updateOrderMarket ]
    }
    events.push( { type: 'OrderDeckRecycled', playerId: player.id } )

  } else {
    if ( state.orderMarket.remainingOrderIds.length < 4 ) throw new Error( 'Invalid order market remainingOrderIds' )
    for ( const key of marketKeys ) {
      const order = visibleOrders[ key ];
      if ( order !== null ) {
        orderMarket[ key ].push( order );
      }
      visibleOrders[ key ] = remainingOrderIds.shift()!
    }
  }

  events.push( { type: 'OrderMarketRefreshed', playerId: player.id } )
  return freezeTransition( {
    ...state,
    runtimeRng: {
      ...state.runtimeRng,
      ...( runtimeRng !== null ? runtimeRng : {} )
    },
    orderMarket: {
      ...state.orderMarket,
      visibleOrders: ( orderMarketByState === null ) ? visibleOrders : orderMarketByState.visibleOrders,
      orderMarket: ( orderMarketByState === null ) ? orderMarket : orderMarketByState.orderMarket,
      orderDiscard: ( orderMarketByState === null ) ? orderDiscard : orderMarketByState.orderDiscard,
      remainingOrderIds: ( orderMarketByState === null ) ? remainingOrderIds : orderMarketByState.remainingOrderIds
    }
  }, events )

}
