import { type RewardId, setupComponentCatalog } from './component-catalog.js'
import { freezeTransition, type GameTransition } from './game-events.js'
import { applyOrderRewardEffect, type OrderRewardChoices } from './order-reward-effect.js'
import type { BoardOrders } from './player-boards.js'
import type { GameState, PlayerId } from './types.js'

/**
 * Получает награду выбранной стороны заказа по MGMT-004 после назначения доступного помощника.
 * Помощник может прийти из офиса, локации или текущего выдворения;
 * награда использует состояние после его перемещения и освобождения места в офисе.
 */
export function orderCardReward(
  state: Readonly<GameState>,
  playerId: PlayerId,
  orderSlot: keyof BoardOrders,
  assistantId: string,
  choices: Readonly<OrderRewardChoices> = {},
  assistantSource: 'office' | 'location' | 'ejected' = 'office',
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
  if (!order.orderId || (order.orderStatus !== 'unfulfilled' && order.orderStatus !== 'completed')) {
    throw new Error('Order reward requires an unfulfilled order')
  }

  const definition = setupComponentCatalog.orders.find( item => item.id === order.orderId )
  if ( !definition ) throw new Error( 'Unknown order front reward' )

  let reward: RewardId | null =  null
  if(order.orderStatus === 'unfulfilled') {
    reward = definition.reward
  } else {
    const orderRewardSidesSlot = board.orderRewardSides[orderSlot]

    if(orderRewardSidesSlot !== 'coins' && orderRewardSidesSlot !== 'influence') throw new Error( 'Order reward side required' )

    reward = (orderRewardSidesSlot  === 'coins') ? 'COINS' : 'INFLUENCE'
  }

  if ( order.assistant !== null ) throw new Error( 'Order already has an assistant' )
  if (typeof assistantId !== 'string' || !assistantId) throw new Error('Invalid order assistant')
  if (assistantSource === 'office' && !board.assistants.assistantOfficeIds.includes(assistantId)) {
    throw new Error('Selected assistant must be in the player office')
  }
  if (assistantSource === 'location') {
    const placement = board.locationAssistants.find(item => item.assistantId === assistantId)
    const occupant = placement && state.assistantByLocation[placement.locationId]
    if (!placement || occupant?.playerId !== playerId || occupant.assistantId !== assistantId) {
      throw new Error('Selected assistant must be at the player location')
    }
  } else if (assistantSource === 'ejected') {
    const opportunity = state.pendingEjectionOpportunity
    if (state.phase === 'final_round' || opportunity?.playerId !== playerId
      || opportunity.pieceType !== 'assistant' || opportunity.assistantId !== assistantId
      || board.ejectedAssistant?.assistantId !== assistantId
      || board.ejectedAssistant.displacedByPlayerId !== opportunity.displacedByPlayerId
      || opportunity.displacedByPlayerId === playerId
      || !state.players.some(player => player.id === opportunity.displacedByPlayerId)) {
      throw new Error('Selected ejected assistant has no ejection action')
    }
  } else if (assistantSource !== 'office') throw new Error('Invalid assistant source')

  // Независимое дерево не замораживает объекты входа вместе с результатом.
  const next = structuredClone(state)
  const nextBoard = next.playerBoards[boardIndex]!
  const assistantOfficeIds = assistantSource === 'office'
    ? nextBoard.assistants.assistantOfficeIds.filter(id => id !== assistantId) : nextBoard.assistants.assistantOfficeIds
  const nextState: GameState = {
    ...next,
    playerBoards: next.playerBoards.map((item, index) => index === boardIndex ? {
      ...nextBoard,
      assistants: { ...nextBoard.assistants, assistantOfficeIds, office: assistantOfficeIds.length },
      locationAssistants: assistantSource === 'location'
        ? nextBoard.locationAssistants.filter(item => item.assistantId !== assistantId) : nextBoard.locationAssistants,
      ejectedAssistant: assistantSource === 'ejected' ? null : nextBoard.ejectedAssistant,
      boardOrders: { ...nextBoard.boardOrders, [orderSlot]: { ...nextBoard.boardOrders[orderSlot], assistant: assistantId } },
    } : item),
    assistantByLocation: Object.fromEntries(Object.entries(next.assistantByLocation).map(([locationId, occupant]) =>
      [locationId, assistantSource === 'location' && occupant?.playerId === playerId && occupant.assistantId === assistantId
        ? null : occupant])) as GameState['assistantByLocation'],
  }
  const result = applyOrderRewardEffect(nextState, playerId, reward, choices)
  return freezeTransition(result.state, [
    { type: 'AssistantAssignedToOrder', playerId, orderSlot, orderId: order.orderId, assistantId },
    ...result.events,
  ])
}
