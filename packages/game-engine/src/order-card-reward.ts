import { setupComponentCatalog } from './component-catalog.js'
import { freezeTransition, type GameTransition } from './game-events.js'
import { applyOrderRewardEffect, type OrderRewardChoices } from './order-reward-effect.js'
import type { BoardOrders } from './player-boards.js'
import type { GameState, PlayerId } from './types.js'

/** MGMT-004: лицевая награда заказа с помощником из офиса. */
export function orderCardReward(
  state: Readonly<GameState>,
  playerId: PlayerId,
  orderSlot: keyof BoardOrders,
  assistantId: string,
  choices: Readonly<OrderRewardChoices> = {},
): GameTransition<GameState> {
  if (!['regular_play', 'ending_current_round', 'final_round'].includes(state.phase)) {
    throw new Error('Order reward requires a playing phase')
  }
  if (orderSlot !== 1 && orderSlot !== 2 && orderSlot !== 3) throw new Error('Invalid order slot')
  const playerIndex = state.players.findIndex(player => player.id === playerId)
  const boardIndex = state.playerBoards.findIndex(board => board.playerId === playerId)
  if (playerIndex < 0 || boardIndex < 0) throw new Error('Invalid order reward player or playerBoard')
  const board = state.playerBoards[boardIndex]!
  const order = board.boardOrders[orderSlot]
  if (!order.orderId || order.orderStatus !== 'unfulfilled') {
    throw new Error('Order reward requires an unfulfilled order')
  }
  const definition = setupComponentCatalog.orders.find(item => item.id === order.orderId)
  if (!definition) throw new Error('Unknown order front reward')
  if (order.assistant !== null) throw new Error('Order already has an assistant')
  if (typeof assistantId !== 'string' || !assistantId || !board.assistants.assistantOfficeIds.includes(assistantId)) {
    throw new Error('Selected assistant must be in the player office')
  }

  // Независимое дерево не замораживает объекты входа вместе с результатом.
  const next = structuredClone(state)
  const nextBoard = next.playerBoards[boardIndex]!
  const assistantOfficeIds = nextBoard.assistants.assistantOfficeIds.filter(id => id !== assistantId)
  const nextState: GameState = {
    ...next,
    playerBoards: next.playerBoards.map((item, index) => index === boardIndex ? {
      ...nextBoard,
      assistants: { ...nextBoard.assistants, assistantOfficeIds, office: assistantOfficeIds.length },
      boardOrders: { ...nextBoard.boardOrders, [orderSlot]: { ...nextBoard.boardOrders[orderSlot], assistant: assistantId } },
    } : item),
  }
  const result = applyOrderRewardEffect(nextState, playerId, definition.reward, choices)
  return freezeTransition(result.state, [
    { type: 'AssistantAssignedToOrder', playerId, orderSlot, orderId: order.orderId, assistantId },
    ...result.events,
  ])
}
