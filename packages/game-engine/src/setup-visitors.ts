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
  readonly vestibuleVisitors: readonly Readonly<PlayerVestibuleVisitor>[]
  readonly plazaVisitors:  readonly Readonly<VisitorInstance>[]
  readonly remainingVisitors: readonly Readonly<VisitorInstance>[]
}
const INITIAL_PLAZA_VISITOR_COUNT = 4

/** Подготавливает детерминированный мешочек посетителей по SETUP-001 и ADR-001. */
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
/** Размещает четырёх посетителей на площади и по одному в вестибюле по SETUP-010. */
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

  const vestibuleVisitors: PlayerVestibuleVisitor[] = []
  const remainingVisitors = [ ...visitorsBag.visitors ];
  // Площадь получает начало уже перемешанного мешочка до раздачи по местам игроков.
  const center = remainingVisitors.splice( 0, 4 )

  playerIds.forEach( id => {
    const rawVisitor = remainingVisitors.shift()!;
    vestibuleVisitors.push( {
      playerId: id,
      vestibuleVisitor: { ...rawVisitor }
    } )
  } )

  return deepFreeze( {
    vestibuleVisitors,
    plazaVisitors: center.map( visitor => ( { ...visitor } ) ),
    remainingVisitors: remainingVisitors.map( visitor => ( { ...visitor } ) )
  })
}
