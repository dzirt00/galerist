import type { ConfirmedTurnCommand, GameState, LocationActionCommand, PlayerId } from "./types.js";
import { freezeTransition, type GameEvent, type GameTransition } from "./game-events.js";
import { prepareTurn } from "./turn-preparation.js";
import { applyGalleristMovementToGameState } from "./apply-gallerist-movement-to-game-state.js";
import { advertisingArtist } from "./advertising-artist.js";
import { applyVisitorMovementTickets } from "./apply-visitor-movement-tickets.js";
import { applyAssistantHiringToGameState } from "./apply-assistant-hiring-to-game-state.js";


export function applyTurn(
  state: GameState,
  command: ConfirmedTurnCommand
): GameTransition<GameState> {
  if(command.locationAction.advertisingArtist === undefined && command.locationAction.hireAssistants === undefined)  throw new Error('invalid locationAction.advertisingArtist')
  if(command.locationAction.advertisingArtist !== undefined && command.locationAction.hireAssistants !== undefined)  throw new Error('invalid locationAction.advertisingArtist')
  if(command.movement.locationId !== 'LOC-MEDIA_CENTER') throw new Error('invalid movement.movement.locationId must be defined')
  if(command.management && command.management.command.category !== 'management_action') throw new Error('invalid command.management?.command.category must be defined')

  const copyState = structuredClone(state)
  let events: GameEvent[] = []
  const resultPrepareTurn = prepareTurn(state, command)
  let gameTransition: GameTransition<GameState>
  let updateCopyState: GameState | null = null
  const category = resultPrepareTurn.steps.reduce((acc,step) =>{
    acc.push(step.category)
    return acc
  },[] as string[])

  const setCategory = new Set(category)
  if(setCategory.size !== category.length) throw new Error('invalid size')
  if(command.locationAction.category !== 'location_action') throw new Error('invalid location action')
  resultPrepareTurn.steps.forEach(step => {
    if(!['movement','location_action','management_action'].includes(step.category)) throw new Error('invalid movement')
    if(step.category === 'movement') {
      if(step.locationId !== 'LOC-MEDIA_CENTER')  throw new Error('movement')
      gameTransition = applyGalleristMovementToGameState(copyState, command)
      events.push(...gameTransition.events)
      updateCopyState = {
        ...gameTransition.state
      }
    } else if(step.category === 'location_action') {

      if(step.advertisingArtist === undefined && step.hireAssistants === undefined) throw new Error('location_action')
      if(updateCopyState === null) throw new Error('invalid update state')

      if(step.advertisingArtist !== undefined) {
        const rawRequest = {
          playerId: resultPrepareTurn.playerId,
          artistId: step.advertisingArtist?.artistId,
          visitorId : step.advertisingArtist?.visitorId,
          targetInfluence : step.advertisingArtist?.targetInfluence,
          requestedTicketColors : step.advertisingArtist?.requestedTicketColors,
          replacementColorsByRequestedColor : step.advertisingArtist?.replacementColorsByRequestedColor
        };
        const requestForAdvertisingArtist = Object.fromEntries(
          Object.entries(rawRequest).filter(([_, value]) => value !== undefined)
        ) as Parameters<typeof advertisingArtist>[1];

        gameTransition = advertisingArtist(updateCopyState,requestForAdvertisingArtist )
        events.push(...gameTransition.events)
        updateCopyState = {
          ...gameTransition.state
        }
      }

      if(step.hireAssistants !== undefined) {
        const { playerId, countAssistants, targetInfluence, requestedTicketColors, replacementColorsByRequestedColor } = step.hireAssistants;
        const requestForAdvertisingArtist: Parameters<typeof applyAssistantHiringToGameState>[1] = {
          playerId: command.playerId,
          countAssistants,
          ...(targetInfluence !== undefined && { targetInfluence }),
          ...(requestedTicketColors !== undefined && { requestedTicketColors }),
          ...(replacementColorsByRequestedColor !== undefined && { replacementColorsByRequestedColor }),
        };
        gameTransition =  applyAssistantHiringToGameState(updateCopyState,requestForAdvertisingArtist)
        events.push(...gameTransition.events)
        updateCopyState = {
          ...gameTransition.state
        }
      }

    }else if(step.category === 'management_action') {
      if(step.visitorMovementSteps === undefined) throw new Error('management_action')
      events.push({type: 'ManagementActionStarted', playerId: resultPrepareTurn.playerId})
      if(updateCopyState === null) throw new Error('invalid update state')
      gameTransition = applyVisitorMovementTickets(updateCopyState,resultPrepareTurn.playerId,step.visitorMovementSteps)
      events.push(...gameTransition.events)
      updateCopyState = {
        ...gameTransition.state,
      }
    } else {
      throw new Error('invalid command')
    }
  })

  if(updateCopyState === null) throw new Error('invalid update state')
  return freezeTransition(updateCopyState,events)

}
