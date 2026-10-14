import type { ConfirmedTurnCommand, GameState, LocationActionCommand } from "./types.js";
import { freezeTransition, type GameEvent, type GameTransition } from "./game-events.js";
import { prepareTurn } from "./turn-preparation.js";
import { applyGalleristMovementToGameState } from "./apply-gallerist-movement-to-game-state.js";
import { advertisingArtist } from "./advertising-artist.js";

function isLocationCommand(command: any): command is LocationActionCommand {
  return command && 'advertisingArtist' in command;
}


export function applyTurn(
  state: GameState,
  command: ConfirmedTurnCommand
): GameTransition<GameState> {
  if(command.locationAction.advertisingArtist === undefined)  throw new Error('invalid locationAction.advertisingArtist')
  if(command.movement.locationId !== 'LOC-MEDIA_CENTER') throw new Error('invalid movement.movement.locationId must be defined')
  if(command.management !== undefined) throw new Error('invalid management.movement.locationId must be defined')
  const copyState = structuredClone(state)
  let events: GameEvent[] = []
  const resultPrepareTurn = prepareTurn(state, command)
  const commandResultPrepareTurn = resultPrepareTurn.steps.find(el => el.category === 'location_action')

  if(!isLocationCommand(commandResultPrepareTurn)) throw new Error('invalid locationAction')

  const rawRequest = {
    playerId: resultPrepareTurn.playerId,
    artistId: commandResultPrepareTurn.advertisingArtist?.artistId,
    visitorId : commandResultPrepareTurn.advertisingArtist?.visitorId,
    targetInfluence : commandResultPrepareTurn.advertisingArtist?.targetInfluence,
    requestedTicketColors : commandResultPrepareTurn.advertisingArtist?.requestedTicketColors,
    replacementColorsByRequestedColor : commandResultPrepareTurn.advertisingArtist?.replacementColorsByRequestedColor
  };

  const requestForAdvertisingArtist = Object.fromEntries(
    Object.entries(rawRequest).filter(([_, value]) => value !== undefined)
  ) as Parameters<typeof advertisingArtist>[1];

  const updateCopyState = applyGalleristMovementToGameState(copyState, command)
  events.push(...updateCopyState.events)
  const  resultAdvertisingArtist = advertisingArtist(updateCopyState.state,requestForAdvertisingArtist )
  events.push(...resultAdvertisingArtist.events)
  return freezeTransition(resultAdvertisingArtist.state,events)

}
