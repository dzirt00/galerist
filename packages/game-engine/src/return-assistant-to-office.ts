import type { GameEvent } from './game-events.js'
import type { PlayerBoard } from './player-boards.js'

/** EJECT-005: вызывающий слой освобождает исходную клетку помощника. */
export function returnAssistantToOffice(board: PlayerBoard, assistantId: string | null): {
  readonly assistants: PlayerBoard['assistants']; readonly events: readonly GameEvent[]
} {
  if (assistantId === null) return { assistants: board.assistants, events: [] }
  const { assistantOfficeIds, office } = board.assistants
  if (office !== assistantOfficeIds.length || office < 0 || office > 4 || assistantOfficeIds.includes(assistantId)
    || board.assistants.assistantHireQueueIds.includes(assistantId)) throw new Error('Invalid returning assistant')
  if (office === 4) return { assistants: board.assistants, events: [{ type: 'AssistantRemovedFromGame', playerId: board.playerId, assistantId }] }
  return {
    assistants: { ...board.assistants, office: office + 1, assistantOfficeIds: [...assistantOfficeIds, assistantId] },
    events: [{ type: 'AssistantReturnedHome', playerId: board.playerId, assistantId }],
  }
}
