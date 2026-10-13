import type {
  ConfirmedTurnCommand,
  GameState,
  PreparedTurn,
  TurnExecutionSteps,
} from './types.js'
import type {StartingLocationId} from './component-catalog.js'

function isGalleristPosition(id: string): id is StartingLocationId {
  return [
    'LOC-ARTISTS_COLONY',
    'LOC-MEDIA_CENTER',
    'LOC-INTERNATIONAL_MARKET',
    'LOC-SALES_OFFICE',
  ].includes(id);
}

/** Готовит действия подтверждённого составного хода по TURN-002. */
export function prepareTurn(
  state: GameState,
  command: ConfirmedTurnCommand,
): PreparedTurn {
  if (state.status !== 'in_progress') {
    throw new Error('Game status must be in_progress')
  }
  if (
    state.phase !== 'regular_play'
    && state.phase !== 'ending_current_round'
    && state.phase !== 'final_round'
  ) {
    throw new Error(`Turn preparation is not allowed in phase: ${state.phase}`)
  }
  if (
    state.activePlayerId === null
    || !state.players.some(player => player.id === state.activePlayerId)
  ) {
    throw new Error('activePlayerId is invalid or not in the game')
  }
  if (command.playerId !== state.activePlayerId) {
    throw new Error('Command playerId does not match activePlayerId')
  }
  if (
    !('movement' in command)
    || command.movement == null
    || !('locationAction' in command)
    || command.locationAction == null
  ) {
    throw new Error('Confirmed turn requires movement and location action')
  }
  if (!isGalleristPosition(command.movement.locationId)) {
   throw new Error('Movement cannot be in a GalleristPosition')
  }
  if(command.movement.locationId === state.playerBoards.find(el => el.playerId === command.playerId)?.galleristPosition) {
    throw new Error('Invalid movement')
  }
  const movement = Object.freeze({ ...command.movement })
  const locationAction = Object.freeze({ ...command.locationAction })
  let steps: TurnExecutionSteps

  if(command.management === undefined) {
    steps = [movement, locationAction]
  } else {
    if(command.management.command === undefined || command.management.command === null) {
      throw new Error('Missing command command')
    }
    switch (command.management?.timing) {
      // Единственное действие управления сохраняет выбранный timing относительно локации.
      case 'before_location':
        steps = [movement, Object.freeze({ ...command.management.command }), locationAction]
        break
      case 'after_location':
        steps = [movement, locationAction, Object.freeze({ ...command.management.command })]
        break
      default:
        throw new Error('Unknown command')
    }
  }
  return Object.freeze({
    playerId: command.playerId,
    steps: Object.freeze(steps),
  })
}
