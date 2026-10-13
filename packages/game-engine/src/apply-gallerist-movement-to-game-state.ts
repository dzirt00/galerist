import type {ConfirmedTurnCommand, GameState} from "./types.js";
import {freezeTransition, type GameTransition} from "./game-events.js";
import {prepareTurn} from "./turn-preparation.js";

export function applyGalleristMovementToGameState(
  state: GameState,
  command:ConfirmedTurnCommand
):GameTransition<GameState> {
  let copyState = structuredClone(state);
  const resultPrepareTurn = prepareTurn(copyState, command);
  const locationId = resultPrepareTurn.steps[0].locationId
  let playerBoard = copyState.playerBoards.find(el => el.playerId === resultPrepareTurn.playerId)
  const playerBoardIndex = copyState.playerBoards.findIndex(el => el.playerId === resultPrepareTurn.playerId)
  if(playerBoard === undefined || playerBoardIndex < 0) throw new Error('invalid playerId')
  const galleristPosition = playerBoard.galleristPosition
  playerBoard = {
    ...playerBoard,
    galleristPosition: locationId,
  }
  copyState = {
    ...copyState,
    playerBoards: copyState.playerBoards.map((el,index) => (index === playerBoardIndex) ? playerBoard : el)
  }
  return freezeTransition(copyState,[{
    type: 'GalleristMoved',
   playerId: resultPrepareTurn.playerId,
   from: galleristPosition,
   to: locationId,
  }])
}
