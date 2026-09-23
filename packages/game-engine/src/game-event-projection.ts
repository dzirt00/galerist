import { deepFreeze } from './component-catalog.js'
import type { GameEvent } from './game-events.js'
import type { GameState, PlayerId } from './types.js'

function canViewEvent(
  event: GameEvent,
  state: GameState,
  viewerId: PlayerId | null,
): boolean {
  if (event.type === 'FirstPlayerSelected') {
    return state.phase !== 'setup'
  }
  if (event.type === 'PrivateGoalsDealt') {
    return state.phase === 'final_scoring'
      || state.phase === 'finished'
      || event.playerId === viewerId
  }
  return true
}

/** Возвращает безопасный для зрителя список доменных событий. */
export function projectEventsForViewer(
  events: readonly GameEvent[],
  state: GameState,
  viewerId: PlayerId | null,
): readonly GameEvent[] {
  if (viewerId !== null && !state.players.some(player => player.id === viewerId)) {
    throw new Error('Viewer must be a player or null')
  }

  return deepFreeze(structuredClone(
    events.filter(event => canViewEvent(event, state, viewerId)),
  ))
}
