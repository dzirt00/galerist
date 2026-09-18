import { deepFreeze, type VisitorInstance } from './component-catalog.js'
import type { SetupRng } from "./setup-rng.js";

export interface PreparedVisitorBag {
  readonly visitors: readonly VisitorInstance[]
}

export interface PlayerVestibuleVisitor {
  readonly playerId: string,
  readonly vestibuleVisitor: VisitorInstance
}

export interface InitialVisitorPlacement{
  readonly visitorPlayers:  readonly Readonly<PlayerVestibuleVisitor>[]
  readonly plazaVisitors:  readonly Readonly<VisitorInstance>[]
  readonly remainingVisitors: readonly Readonly<VisitorInstance>[]
}
const INITIAL_PLAZA_VISITOR_COUNT = 4

/** Сортирует и перемешивает копии посетителей для стартового мешка. */
export function prepareVisitorBag(
  visitors: readonly VisitorInstance[],
  rng: SetupRng,
): PreparedVisitorBag {
  const sortedVisitors = [ ...visitors ].sort( ( a, b ) => {
    if ( a.id > b.id ) return 1;
    if ( a.id < b.id ) return -1;
    return 0;
  } );
  const shuffled = rng.shuffle( 'visitors', sortedVisitors );
  const shuffleVisitors = Object.freeze( shuffled.map( visitor => ( Object.freeze( { ...visitor } ) ) ) );

  return Object.freeze( { visitors: shuffleVisitors } );
}
/** Выкладывает начальные миплы на поле, к игроку по одному, и в центр 4шт */
export function placeInitialVisitors(
  visitorsBag: PreparedVisitorBag,
  playerIds: readonly string[]
): InitialVisitorPlacement {

  if ( visitorsBag.visitors.length < INITIAL_PLAZA_VISITOR_COUNT + playerIds.length ) {
    throw new Error( 'invalid bag' )
  }

  const setPlayerIds = new Set( playerIds );

  if ( playerIds.length !== setPlayerIds.size || ![ 2, 3, 4 ].includes( playerIds.length ) ) {
    throw new Error( 'invalid playerIds' )
  }

  const visitorPlayers: PlayerVestibuleVisitor[] = []
  const remainingVisitors = [ ...visitorsBag.visitors ];
  const center = remainingVisitors.splice( 0, 4 )

  playerIds.forEach( id => {
    const rawVisitor = remainingVisitors.shift()!;
    visitorPlayers.push( {
      playerId: id,
      vestibuleVisitor: { ...rawVisitor }
    } )
  } )

  return deepFreeze( {
    visitorPlayers: visitorPlayers,
    plazaVisitors: center.map( visitor => ( { ...visitor } ) ),
    remainingVisitors: remainingVisitors.map( visitor => ( { ...visitor } ) )
  })
}
