import type { GameState, OrderCardReward, PlayerId } from './types.js'
import type { GameTransition } from './game-events.js'
import { orderCardReward } from './order-card-reward.js'
import { completeEjectionOpportunity, requireEjectionOpportunity } from './ejection-opportunity.js'

/** Выполняет награду заказа как единственное управление при выдворении и возвращает неиспользованную фишку. */
export function applyEjectionOrderReward(
  state: GameState, playerId: PlayerId, command: Readonly<OrderCardReward>,
): GameTransition<GameState> {
  const opportunity = requireEjectionOpportunity(state, playerId)
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('Invalid order reward command')
  const result = orderCardReward(state, playerId, command.orderSlot, command.assistantId,
    command.choices === undefined ? {} : command.choices, command.assistantSource === undefined ? 'office' : command.assistantSource)
  return completeEjectionOpportunity(result.state, opportunity, [
    { type: 'ManagementActionStarted', playerId },
    ...result.events,
    { type: 'EjectionActionPerformed', playerId },
  ])
}
