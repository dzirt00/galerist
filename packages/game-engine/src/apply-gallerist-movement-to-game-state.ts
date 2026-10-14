import { setupComponentCatalog, type StartingLocationId } from './component-catalog.js'
import {
  freezeTransition,
  type GameEvent,
  type GameTransition,
} from './game-events.js'
import { prepareTurn } from './turn-preparation.js'
import type {
  ConfirmedTurnCommand,
  GameState,
  PlayerId,
} from './types.js'
import { returnAssistantToOffice } from "./return-assistant-to-office.js";

interface AssistantLeavingResult {
  readonly state: GameState
  readonly event: GameEvent
}

/**
 * Проверяет и применяет оставление одного помощника по TURN-004.
 * Вызывающий код уже получил допустимый ход и активного игрока из prepareTurn.
 */
function leaveAssistantAtLocation(
  state: GameState,
  playerId: PlayerId,
  assistantId: unknown,
  departedLocationId: StartingLocationId,
): AssistantLeavingResult {
  if (typeof assistantId !== 'string' || assistantId.trim().length === 0) {
    throw new Error('assistantId must be a non-empty string')
  }
  if (state.assistantByLocation[departedLocationId] !== null) {
    throw new Error('Departed location already has an assistant')
  }

  const playerBoardIndex = state.playerBoards.findIndex(board => board.playerId === playerId)
  const playerBoard = state.playerBoards[playerBoardIndex]
  if (!playerBoard || playerBoardIndex < 0) {
    throw new Error('invalid playerId')
  }

  const officeIndex = playerBoard.assistants.assistantOfficeIds.indexOf(assistantId)
  const sourceLocationId = setupComponentCatalog.startingLocationOrder.find(locationId => {
    const assistant = state.assistantByLocation[locationId]
    return assistant?.playerId === playerId && assistant.assistantId === assistantId
  })

  if (officeIndex < 0 && sourceLocationId === undefined) {
    throw new Error('Assistant does not belong to the active player or is unavailable')
  }
  if (sourceLocationId === departedLocationId) {
    throw new Error('Assistant cannot be sourced from the departed location')
  }

  let nextState: GameState
  if (officeIndex >= 0) {
    const assistantOfficeIds = [
      ...playerBoard.assistants.assistantOfficeIds.slice(0, officeIndex),
      ...playerBoard.assistants.assistantOfficeIds.slice(officeIndex + 1),
    ]
    const nextPlayerBoard = {
      ...playerBoard,
      assistants: {
        ...playerBoard.assistants,
        office: assistantOfficeIds.length,
        assistantOfficeIds,
      },
    }
    nextState = {
      ...state,
      playerBoards: state.playerBoards.map((board, index) =>
        index === playerBoardIndex ? nextPlayerBoard : board),
      assistantByLocation: {
        ...state.assistantByLocation,
        [departedLocationId]: { playerId, assistantId },
      },
    }
  } else {
    nextState = {
      ...state,
      assistantByLocation: {
        ...state.assistantByLocation,
        [sourceLocationId!]: null,
        [departedLocationId]: { playerId, assistantId },
      },
    }
  }

  return {
    state: nextState,
    event: {
      type: 'AssistantLeftAtLocation',
      playerId,
      assistantId,
      locationId: departedLocationId,
    },
  }
}

export function applyGalleristMovementToGameState(
  state: GameState,
  command: ConfirmedTurnCommand,
): GameTransition<GameState> {
  const preparedTurn = prepareTurn(state, command)
  const movement = preparedTurn.steps[0]
  let copiedState = structuredClone(state)
  let playerBoard = copiedState.playerBoards.find(
    board => board.playerId === preparedTurn.playerId,
  )
  const playerBoardIndex = copiedState.playerBoards.findIndex(board => board.playerId === preparedTurn.playerId)
  if (!playerBoard || playerBoardIndex < 0) throw new Error('invalid playerId')

  const departedLocationId = playerBoard.galleristPosition
  const events: GameEvent[] = []

  if (movement.assistantId !== undefined) {
    if (departedLocationId === 'HOME') {
      throw new Error('Assistant cannot be left when moving from HOME')
    }
    const assistantResult = leaveAssistantAtLocation(
      copiedState,
      preparedTurn.playerId,
      movement.assistantId,
      departedLocationId,
    )
    copiedState =  {
      ...assistantResult.state
    }
    playerBoard = {
      ...playerBoard,
      ...copiedState.playerBoards.find((el,index) => index === playerBoardIndex)
    }
    events.push(assistantResult.event)
  }
  events.push({
    type: 'GalleristMoved',
    playerId: preparedTurn.playerId,
    from: departedLocationId,
    to: movement.locationId,
  })
  if(!movement.locationId) throw new Error('invalid location id')
  if (copiedState.assistantByLocation[movement.locationId]?.playerId === command.playerId) {
    const assistantId = copiedState.assistantByLocation[movement.locationId]?.assistantId
    if(assistantId === undefined) throw new  Error('invalid assistantId')
    events.push({type: 'OwnAssistantEjected', playerId: command.playerId, assistantId: assistantId, locationId: movement.locationId})
    const resultAssistantToOffice = returnAssistantToOffice(playerBoard,assistantId)
    playerBoard = {
      ...playerBoard,
      assistants: {
        ...resultAssistantToOffice.assistants,
      }
    }
    copiedState = {
      ...copiedState,
      playerBoards: copiedState.playerBoards.map((board, index) => (index === playerBoardIndex) ? (playerBoard ?? board) : board),
      assistantByLocation: {
        ...copiedState.assistantByLocation,
        [movement.locationId]: null
      }
    }
    events.push(...resultAssistantToOffice.events)
  }

  const movingPlayerBoardIndex = copiedState.playerBoards.findIndex(
    board => board.playerId === preparedTurn.playerId,
  )
  const movingPlayerBoard = copiedState.playerBoards[movingPlayerBoardIndex]
  if (!movingPlayerBoard || movingPlayerBoardIndex < 0) {
    throw new Error('invalid playerId')
  }

  const movedState: GameState = {
    ...copiedState,
    playerBoards: copiedState.playerBoards.map((board, index) =>
      index === movingPlayerBoardIndex
        ? { ...movingPlayerBoard, galleristPosition: movement.locationId }
        : board),
  }
  return freezeTransition(movedState, events)
}
