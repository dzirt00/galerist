import { describe, expect, it } from 'vitest'
import {
  applyTurn, applyGalleristMovementToGameState, applyAssistantHiringToGameState,
  orderCardReward, receiveOrder, projectGameForViewer, projectEventsForViewer, restoreGameState,
  type ConfirmedTurnCommand, type GameState,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function scenario(timing: 'before_location' | 'after_location', orderId = 'ORDER-03') {
  const initial = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const market = initial.orderMarket
  const previous = market.visibleOrders[1]!
  const swap = (id: string) => id === orderId ? previous : id === previous ? orderId : id
  const input: GameState = { ...initial, orderMarket: {
    ...market,
    visibleOrders: Object.fromEntries(Object.entries(market.visibleOrders).map(([slot, id]) =>
      [slot, id === null ? null : swap(id)])) as typeof market.visibleOrders,
    orderMarket: Object.fromEntries(Object.entries(market.orderMarket).map(([slot, ids]) =>
      [slot, ids.map(swap)])) as typeof market.orderMarket,
    remainingOrderIds: market.remainingOrderIds.map(swap),
  } }
  const playerId = initial.activePlayerId!
  const base = receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, '1', null).state
  const remaining = [...base.visitorBag.visitors]
  const visitors = (['B', 'B', 'W', 'R'] as const).map(type =>
    remaining.splice(remaining.findIndex(visitor => visitor.type === type), 1)[0]!)
  const visitorBag = { visitors: remaining }
  const state: GameState = structuredClone({ ...base, visitorBag,
    artworkMarket: { ...base.artworkMarket, remainingVisitorBag: visitorBag },
    players: base.players.map(player => player.id === playerId ? { ...player, coins: 10 } : player),
    playerBoards: base.playerBoards.map(board => board.playerId === playerId ? {
      ...board, galleristPosition: 'HOME', gallery: { ...board.gallery, visitors },
    } : board),
  })
  const board = state.playerBoards.find(board => board.playerId === playerId)!
  const assistantId = board.assistants.assistantOfficeIds[0]!
  const command: ConfirmedTurnCommand = {
    type: 'perform_turn', playerId,
    movement: { category: 'movement', locationId: 'LOC-MEDIA_CENTER' },
    locationAction: { category: 'location_action', hireAssistants: { playerId, countAssistants: 1 } },
    management: { timing, command: { category: 'management_action',
      orderCardReward: { orderSlot: 1, assistantId },
    } },
  }
  return { state, command, assistantId, board }
}

function expectFrozen(value: unknown, frozen: boolean): void {
  if (!value || typeof value !== 'object') return
  expect(Object.isFrozen(value)).toBe(frozen)
  Object.values(value).forEach(item => expectFrozen(item, frozen))
}

describe('TURN-002 / MGMT-004: order reward in a composed turn', () => {
  it.each(['before_location', 'after_location'] as const)('preserves state and events at %s', timing => {
    const { state, command, assistantId, board } = scenario(timing)
    const before = structuredClone({ state, command })
    const movement = applyGalleristMovementToGameState(state, command)
    const reward = timing === 'before_location'
      ? orderCardReward(movement.state, command.playerId, 1, assistantId)
      : orderCardReward(applyAssistantHiringToGameState(movement.state, command.locationAction.hireAssistants!).state,
        command.playerId, 1, assistantId)
    const hire = applyAssistantHiringToGameState(timing === 'before_location' ? reward.state : movement.state,
      command.locationAction.hireAssistants!)
    const result = applyTurn(state, command)
    const rewardEvents = [{ type: 'ManagementActionStarted', playerId: command.playerId }, ...reward.events]
    expect(result).toEqual({ state: timing === 'before_location' ? hire.state : reward.state,
      events: [...movement.events, ...(timing === 'before_location'
        ? [...rewardEvents, ...hire.events] : [...hire.events, ...rewardEvents])],
    })
    expect(reward.events).toEqual([
      { type: 'AssistantAssignedToOrder', playerId: command.playerId, orderSlot: 1, orderId: 'ORDER-03', assistantId },
      { type: 'CoinsReceived', playerId: command.playerId, coinsReceived: 5 },
    ])
    expect(result.state.players.find(player => player.id === command.playerId)!.coins).toBe(14)
    expect(hire.events).toContainEqual({ type: 'CoinsSpent', playerId: command.playerId, paid: 1 })
    const updated = result.state.playerBoards.find(item => item.playerId === command.playerId)!
    expect(updated.assistants.assistantOfficeIds).toEqual([
      ...board.assistants.assistantOfficeIds.filter(id => id !== assistantId), board.assistants.assistantHireQueueIds[0],
    ])
    expect(updated.assistants.office).toBe(board.assistants.office)
    expect(updated.boardOrders[1].assistant).toBe(assistantId)
    expect(result.state.activePlayerId).toBe(state.activePlayerId)
    expect(result.state.round).toBe(state.round)
    for (const viewer of [null, ...state.players.map(player => player.id)]) {
      expect(projectGameForViewer(result.state, viewer).playerBoards).toEqual(result.state.playerBoards)
      expect(projectEventsForViewer(result.events, result.state, viewer)).toEqual(result.events)
    }
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
    expect({ state, command }).toEqual(before)
    expectFrozen({ state, command }, false)
    expectFrozen(result, true)
  })

  it('uses the reward to pay for a later hire and rejects the opposite timing atomically', () => {
    const { state: base, command } = scenario('before_location')
    const state = { ...base, players: base.players.map(player => player.id === command.playerId
      ? { ...player, coins: 0 } : player) }
    expect(applyTurn(state, command).state.players.find(player => player.id === command.playerId)!.coins).toBe(4)
    const reversed: ConfirmedTurnCommand = { ...command, management: { ...command.management!, timing: 'after_location' } }
    const before = structuredClone({ state, command: reversed })
    expect(() => applyTurn(state, reversed)).toThrow()
    expect({ state, command: reversed }).toEqual(before)
  })

  it('caps influence at 35 while still assigning the assistant', () => {
    const { state: base, command, assistantId } = scenario('after_location', 'ORDER-01')
    const state = { ...base, players: base.players.map(player => player.id === command.playerId
      ? { ...player, influence: 35 } : player) }
    const result = applyTurn(state, command)
    expect(result.state.players.find(player => player.id === command.playerId)!.influence).toBe(35)
    expect(result.events.at(-1)).toEqual({ type: 'InfluenceReceived', playerId: command.playerId, gainedInfluence: 0 })
    expect(result.state.playerBoards.find(board => board.playerId === command.playerId)!.boardOrders[1].assistant).toBe(assistantId)
  })

  it.each(['invalid assistant', 'occupied order', 'invalid choices', 'both actions', 'neither action'])(
    'rejects %s after hiring without keeping earlier effects', failure => {
      const { state: initial, command } = scenario('after_location')
      let state = initial
      const reward = command.management!.command.orderCardReward!
      if (failure === 'invalid assistant') reward.assistantId = 'unknown-assistant'
      if (failure === 'occupied order') {
        state = structuredClone(orderCardReward(state, command.playerId, 1, reward.assistantId).state)
      }
      if (failure === 'invalid choices') reward.choices = null as unknown as NonNullable<typeof reward.choices>
      const next: ConfirmedTurnCommand = { ...command, management: { ...command.management!, command: {
        category: 'management_action',
        ...(failure === 'neither action' ? {} : { orderCardReward: reward }),
        ...(failure === 'both actions' ? { visitorMovementSteps: [] } : {}),
      } } }
      const before = structuredClone({ state, command: next })
      expect(() => applyTurn(state, next)).toThrow()
      expect({ state, command: next }).toEqual(before)
      expectFrozen({ state, command: next }, false)
    },
  )

  it('forwards nested visitor choices and preserves the visitor transition', () => {
    const { state, command, assistantId } = scenario('after_location', 'ORDER-05')
    const visitor = state.plazaVisitors.find(visitor => visitor.type === 'B' || visitor.type === 'R')!
    command.management!.command.orderCardReward!.choices = { visitorId: visitor.id }
    const before = structuredClone({ state, command })
    const result = applyTurn(state, command)
    expect(result.events.slice(-3)).toEqual([
      { type: 'ManagementActionStarted', playerId: command.playerId },
      { type: 'AssistantAssignedToOrder', playerId: command.playerId, orderSlot: 1, orderId: 'ORDER-05', assistantId },
      { type: 'VisitorMoved', visitorId: visitor.id, from: 'plaza', to: 'gallery', playerId: command.playerId },
    ])
    expect(result.state.plazaVisitors).not.toContainEqual(visitor)
    expect(result.state.playerBoards.find(board => board.playerId === command.playerId)!.gallery.visitors).toContainEqual(visitor)
    expect({ state, command }).toEqual(before)
  })
})
