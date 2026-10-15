import { setupComponentCatalog } from './component-catalog.js'
import { freezeTransition, type GameEvent, type GameTransition } from './game-events.js'
import { applyOrderRewardEffect, type OrderRewardChoices } from './order-reward-effect.js'
import type { GameState, PlayerId } from './types.js'
import { evaluateEndConditions } from './end-conditions.js'

/** Выбор клетки, возвращаемого посетителя вестибюля и вложенных параметров награды ARTWORK-006. */
export interface StartingReputationRequest {
  readonly boardCellId?: string
  readonly visitorId?: string
  readonly choices?: Readonly<OrderRewardChoices>
}

/** Проверяет, есть ли активированный стартовый жетон, ещё связанный с третьей работой. */
export function hasPendingStartingReputation(state: GameState): boolean {
  return state.playerBoards.some(board => Object.keys(board.reputationTokenArtworkIds ?? {}).length > 0)
}

/**
 * Разрешает стартовую репутацию по ARTWORK-006 в конце хода, до действий выдворения.
 * Переносит жетон с работы на выбранную клетку, выдаёт её награду и возвращает посетителя.
 * Если допустимого места владения нет, удаляет жетон; поздний отказ не меняет вход.
 */
export function resolveStartingReputation(state: GameState, playerId: PlayerId, request: StartingReputationRequest = {}): GameTransition<GameState> {
  if (state.status !== 'in_progress' || !['regular_play', 'ending_current_round', 'final_round'].includes(state.phase)) throw new Error('Starting reputation requires a playing phase')
  const board = state.playerBoards.find(item => item.playerId === playerId)
  const tokens = Object.keys(board?.reputationTokenArtworkIds ?? {})
  if (!board || tokens.length !== 1) throw new Error('No pending starting reputation')
  const tokenId = tokens[0]!
  let next: GameState = { ...state, playerBoards: state.playerBoards.map(item => item.playerId === playerId ? { ...item, reputationTokenArtworkIds: null } : item) }
  // SCORE-003 разрешает владеть только одним жетоном: при уже полученном жетоне легальной клетки нет.
  if (Object.keys(board.boardReputationTokens).length > 0) {
    return freezeTransition(next, [{ type: 'ReputationTokenRemoved', playerId, tokenId }])
  }
  const cell = setupComponentCatalog.boardReputationCells.find(item => item.id === request.boardCellId)
  if (!cell) throw new Error('Choose an available reputation board cell')
  const visitors = state.vestibuleVisitors.filter(item => item.playerId === playerId)
  const visitor = visitors.find(item => item.vestibuleVisitor.id === request.visitorId)
  // При непустом вестибюле выбор обязателен; при пустом не допускается ID из чужой области.
  if (visitors.length > 0 && !visitor || visitors.length === 0 && request.visitorId !== undefined) throw new Error('Choose a visitor from own vestibule')
  next = { ...next, playerBoards: next.playerBoards.map(item => item.playerId === playerId
    ? { ...item, boardReputationTokens: { [cell.id]: tokenId } } : item) }
  const events: GameEvent[] = [
    { type: 'ReputationTokenClaimed', playerId, tokenId, cellId: 'third_partition', boardCellId: cell.id },
    { type: 'BoardRewardClaimed', playerId, boardCellId: cell.id, reward: cell.reward },
  ]
  // Награда видит уже полученный жетон и применяется раньше обязательного возврата посетителя.
  const reward = applyOrderRewardEffect(next, playerId, cell.reward, request.choices ?? {})
  next = reward.state
  events.push(...reward.events)
  if (visitor) {
    next = { ...next, vestibuleVisitors: next.vestibuleVisitors.filter(item => item !== visitor && !(item.playerId === playerId && item.vestibuleVisitor.id === request.visitorId)),
      plazaVisitors: [...next.plazaVisitors, visitor.vestibuleVisitor] }
    events.push({ type: 'VisitorMoved', playerId, fromPlayerId: playerId, visitorId: visitor.vestibuleVisitor.id, from: 'vestibule', to: 'plaza' })
  }
  // Вложенная награда может запустить конец партии; его событие следует за всеми эффектами команды.
  return evaluateEndConditions(state, next, events)
}
