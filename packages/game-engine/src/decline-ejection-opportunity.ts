import type { GameState, PlayerId } from "./types.js";
import { freezeTransition, type GameEvent, type GameTransition } from "./game-events.js";
import { returnAssistantToOffice } from "./return-assistant-to-office.js";

export function declineEjectionOpportunity(
  state: GameState,
  playerId:PlayerId
): GameTransition<GameState> {
  let copyState = structuredClone(state)
  if( copyState.phase !== 'ending_current_round'  && copyState.phase !== 'regular_play' ) throw new Error( 'Invalid phase' )
  if(copyState.pendingEjectionOpportunity === null) throw new Error( 'Invalid pendingEjectionOpportunity' )
  if(copyState.pendingEjectionOpportunity.playerId !== playerId ) throw new Error( 'Invalid pendingEjectionOpportunity' )

  let boardPlayer = copyState.playerBoards.find(el => el.playerId === playerId)
  let boardPlayerIndex = copyState.playerBoards.findIndex(el => el.playerId === playerId)

  if( boardPlayerIndex === -1 || boardPlayer === undefined ) throw new Error( 'Invalid player' )
  let events: GameEvent[] = []
  events.push({  type: 'EjectionActionDeclined',  playerId: playerId})

  if(copyState.pendingEjectionOpportunity.pieceType === 'gallerist') {

    if(`${copyState.pendingEjectionOpportunity.locationId}_EJECT` !== boardPlayer.galleristPosition) throw new Error( 'Invalid galleristPosition' )
    boardPlayer = {
      ...boardPlayer,
      galleristPosition: "HOME"
    }

    events.push({  type: 'GalleristReturnedHome',  playerId: playerId})

  } else {
    if(boardPlayer.ejectedAssistant === null) throw new Error( 'Invalid ejectedAssistant' )
    if(boardPlayer.ejectedAssistant.assistantId !== copyState.pendingEjectionOpportunity.assistantId) throw new Error( 'Invalid ejectedAssistant' )
    if(boardPlayer.ejectedAssistant.displacedByPlayerId !== copyState.pendingEjectionOpportunity.displacedByPlayerId) throw new Error( 'Invalid displacedByPlayerId' )
    const resultReturnAssistantToOffice = returnAssistantToOffice(boardPlayer, copyState.pendingEjectionOpportunity.assistantId)
    boardPlayer = {
      ...boardPlayer,
      assistants: {
        ...resultReturnAssistantToOffice.assistants,

      },
      ejectedAssistant: null
    }
    events.push(...resultReturnAssistantToOffice.events)
  }

  copyState = {
    ...copyState,
    playerBoards: copyState.playerBoards.map((el,index) => (index === boardPlayerIndex) ? (boardPlayer ?? el) : el),
    pendingEjectionOpportunity: null
  }

  return freezeTransition(copyState,events)
}
