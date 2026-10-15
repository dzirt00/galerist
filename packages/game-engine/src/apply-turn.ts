import type { ConfirmedTurnCommand, GameState, PendingEjectionOpportunity } from './types.js'
import { freezeTransition, type GameEvent, type GameTransition } from './game-events.js'
import { prepareTurn } from './turn-preparation.js'
import { applyGalleristMovementToGameState } from './apply-gallerist-movement-to-game-state.js'
import { applyVisitorMovementTickets } from './apply-visitor-movement-tickets.js'
import { orderCardReward } from './order-card-reward.js'
import { returnAssistantToOffice } from "./return-assistant-to-office.js";

import { applyLocationAction, validateLocationAction } from './location-action.js'
import { hasPendingStartingReputation } from './starting-reputation.js'

/**
 * Атомарно применяет подтверждённый ход: перемещение, одно действие новой локации
 * и необязательное управление в выбранный момент. После успеха выдаёт возможность
 * выдворения либо возвращает фишку в финальном раунде; инициативу не передаёт.
 */
export function applyTurn(state: GameState, command: ConfirmedTurnCommand): GameTransition<GameState> {
  if (hasPendingStartingReputation(state)) throw new Error('Resolve starting reputation before another turn')

  const prepared = prepareTurn(state, command)
  const action = command.locationAction

  if(state.pendingEjectionOpportunity !== null) throw new Error('Invalid pending ejection opportunity')
  validateLocationAction(command.movement.locationId, action)
  if (command.management && command.management.command.category !== 'management_action') {
    throw new Error('Invalid management action category')
  }

  let next = state
  const events: GameEvent[] = []

  /** Передаёт состояние предыдущего этапа следующему и сохраняет общий порядок доменных событий. */
  const append = (result: GameTransition<GameState>) => {
    next = result.state
    events.push(...result.events)
  }

  for (const step of prepared.steps) {
    switch (step.category) {
      case 'movement':
        append(applyGalleristMovementToGameState(next, command))
        break
      case 'location_action':
        append(applyLocationAction(next, prepared.playerId, step))
        break
      case 'management_action': {
        const selected = Object.entries(step).filter(([key, value]) => key !== 'category' && value !== undefined)

        if (selected.length !== 1 || !['visitorMovementSteps', 'orderCardReward'].includes(selected[0]![0])) {
          throw new Error('Turn requires exactly one management action')
        }
        events.push({ type: 'ManagementActionStarted', playerId: prepared.playerId })

        if (step.visitorMovementSteps !== undefined) {
          append(applyVisitorMovementTickets(next, prepared.playerId, step.visitorMovementSteps))
        } else if (step.orderCardReward !== undefined) {
          const { orderSlot, assistantId, choices, assistantSource } = step.orderCardReward
          append(orderCardReward(next, prepared.playerId, orderSlot, assistantId, choices === undefined ? {} : choices, assistantSource))
        }
        break
      }
      default: throw new Error('Invalid turn step category')
    }
  }
  // В финальном раунде ответного действия нет: вытесненная фигура возвращается сразу после эффектов хода.
  if(next.phase === 'final_round') {
    const playersBoards = next.playerBoards.map(el => {
      const event = events.find(el => el.type === 'PieceEjected')
      if(event !== undefined && event.pieceType === 'gallerist' && event.playerId === el.playerId ) {
        el = {
          ...el,
          galleristPosition: 'HOME'
        }
        events.push({type: 'GalleristReturnedHome', playerId: el.playerId})
      }
      if(event !== undefined && event.pieceType === 'assistant' && event.playerId === el.playerId ) {
        const assistant = el.ejectedAssistant
        if(assistant !== null) {
          const resultReturnAssistantToOffice = returnAssistantToOffice(el,event.assistantId)
          events.push(...resultReturnAssistantToOffice.events)

          el = {
            ...el,
            ejectedAssistant: null,
            assistants: {
              ...resultReturnAssistantToOffice.assistants
            }
          }
        }
      }
      return el
    })

    next = {
      ...next,
      playerBoards: [
        ...playersBoards
      ]
    }
  }

  // Возможность ответного действия появляется лишь после успешного завершения всего чужого хода.
  // Вход к своему помощнику не даёт такой возможности и не меняет инициативу.
  const findEvent = events.find(el => el.type === 'PieceEjected')
  if((next.phase === 'ending_current_round' || next.phase === 'regular_play') && findEvent !== undefined && findEvent.playerId !== command.playerId) {
    const pendingEjectionOpportunity: PendingEjectionOpportunity = (findEvent.pieceType === 'assistant')
      ? {
        pieceType: 'assistant',
        assistantId: findEvent.assistantId,
        locationId: findEvent.locationId,
        displacedByPlayerId: findEvent.displacedByPlayerId,
        playerId: findEvent.playerId,
      }
      : {
        pieceType: findEvent.pieceType,
        locationId: findEvent.locationId,
        displacedByPlayerId: findEvent.displacedByPlayerId,
        playerId: findEvent.playerId,
      }
    next = {
      ...next,
      pendingEjectionOpportunity: pendingEjectionOpportunity
    }
    events.push({type: 'EjectionOpportunityGranted', playerId: findEvent.playerId, locationId: findEvent.locationId})
  }
  return freezeTransition(next, events)
}
