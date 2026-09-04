import type {
  ConfirmedTurnCommand,
  GameState,
  PreparedTurn,
  TurnExecutionSteps,
} from './types.js'

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

  const movement = Object.freeze({ ...command.movement })
  const locationAction = Object.freeze({ ...command.locationAction })
  let steps: TurnExecutionSteps

  switch (command.management?.timing) {
    case 'before_location':
      steps = [movement, Object.freeze({ ...command.management.command }), locationAction]
      break
    case 'after_location':
      steps = [movement, locationAction, Object.freeze({ ...command.management.command })]
      break
    default:
      steps = [movement, locationAction]
  }

  return Object.freeze({
    playerId: command.playerId,
    steps: Object.freeze(steps),
  })
}
