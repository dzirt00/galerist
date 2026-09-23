import { setupComponentCatalog, type SetupTicketColor } from "./component-catalog.js";

export interface PreparedTicketOffice {
  readonly ticketsByColor: Readonly<Record<'B' | 'R' | 'W', number>>
}

/** Подготавливает билетную кассу для состава игроков по SETUP-001. */
export function prepareTicketOffice( playerCount: 2 | 3 | 4 ): PreparedTicketOffice {

  if ( playerCount !== 2 && playerCount !== 3 && playerCount !== 4 ) {
    throw new Error( 'Not enough player count' )
  }

  const ticketsPerColor = setupComponentCatalog.ticketsPerColor[playerCount]
  const ticketsByColor = {} as  Record<SetupTicketColor, number>
  const colors = [ ...setupComponentCatalog.ticketColors ]

  colors.forEach( ( color ) => {
    if ( !( color in ticketsByColor ) ) ticketsByColor[ color ] = ticketsPerColor
  } )

  return Object.freeze( {
    ticketsByColor: Object.freeze( { ...ticketsByColor })
  } )
}
