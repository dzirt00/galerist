import { describe, expect, it } from 'vitest'
import {
  restoreGameState, projectGameForViewer,
} from '../src/index.js'
import { actionOrderMarket } from '../src/action-order-market.js'
import { changeStatusPlayer } from '../src/change-status-player.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function scenario() {
  return startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
}

describe('ORDER-002: регрессия внутренних переходов начала, обновления и отказа', () => {
  it('сохраняет обновление после отказа и блокирует повторное начало и обновление', () => {
    const input = scenario()
    const before = structuredClone(input)
    const playerId = input.activePlayerId
    const stage = (state: typeof input | ReturnType<typeof changeStatusPlayer>['state']) =>
      state.players.find(player => player.id === playerId)!.status
    expect(stage(input)).toBe('WAITING')
    expect(() => actionOrderMarket(input, playerId, 'REFRESH')).toThrow()
    const begun = changeStatusPlayer(input, playerId)
    expect(stage(begun.state)).toBe('PENDING')
    expect(begun.state.orderMarket).toEqual(input.orderMarket)
    expect(begun.events).toEqual([])
    expect(() => changeStatusPlayer(begun.state, playerId)).toThrow()
    const refreshed = actionOrderMarket(begun.state, playerId, 'REFRESH')
    expect(stage(refreshed.state)).toBe('REFRESH')
    expect(Object.values(refreshed.state.orderMarket.visibleOrders))
      .toEqual(input.orderMarket.remainingOrderIds.slice(0, 4))
    expect(refreshed.events).toEqual([{ type: 'OrderMarketRefreshed', playerId }])
    expect(() => actionOrderMarket(refreshed.state, playerId, 'REFRESH')).toThrow()
    expect(() => changeStatusPlayer(refreshed.state, playerId)).toThrow()
    const declined = actionOrderMarket(refreshed.state, playerId, 'DECLINE')
    expect(stage(declined.state)).toBe('REFUSAL')
    expect(declined.state.orderMarket).toEqual(refreshed.state.orderMarket)
    expect(declined.state.runtimeRng).toEqual(refreshed.state.runtimeRng)
    expect(declined.state.playerBoards).toEqual(input.playerBoards)
    expect(declined.state.ticketOffice).toEqual(input.ticketOffice)
    expect(declined.events).toEqual([])
    expect(() => actionOrderMarket(declined.state, playerId, 'REFRESH')).toThrow()
    expect(() => actionOrderMarket(declined.state, playerId, 'DECLINE')).toThrow()
    expect(() => changeStatusPlayer(declined.state, playerId)).toThrow()
    expect(input).toEqual(before)
    expect(Object.isFrozen(declined.state.players[0])).toBe(true)
    expect(declined.state.players.filter(player => player.id !== playerId))
      .toEqual(input.players.filter(player => player.id !== playerId))
    expect(declined.state.phase).toBe(input.phase)
    if ('activePlayerId' in declined.state) expect(declined.state.activePlayerId).toBe(playerId)
  })

  it('продолжает обновление и отказ из снимка схемы 12', () => {
    const input = scenario()
    const playerId = input.activePlayerId
    expect(input.stateSchemaVersion).toBe(12)
    expect(restoreGameState(JSON.parse(JSON.stringify(input)))).toEqual(input)
    expect(() => restoreGameState({ ...input, stateSchemaVersion: 10 })).toThrow()
    const begun = changeStatusPlayer(input, playerId).state
    const restoredBegin = restoreGameState(JSON.parse(JSON.stringify(begun)))
    const refreshed = actionOrderMarket(restoredBegin, playerId, 'REFRESH')
    const restored = restoreGameState(JSON.parse(JSON.stringify(refreshed.state)))
    expect(() => actionOrderMarket(restored, playerId, 'REFRESH')).toThrow()
    const declined = actionOrderMarket(restored, playerId, 'DECLINE')
    expect(declined).toEqual(actionOrderMarket(refreshed.state, playerId, 'DECLINE'))
    expect(restoreGameState(JSON.parse(JSON.stringify(declined.state)))).toEqual(declined.state)
  })

  it('передаёт события переработки и сохраняет RNG при отказе, не раскрывая колоду', () => {
    const initial = scenario()
    const input = { ...initial, orderMarket: { ...initial.orderMarket,
      orderDiscard: initial.orderMarket.remainingOrderIds, remainingOrderIds: [],
    } }
    const playerId = input.activePlayerId
    const begun = changeStatusPlayer(input, playerId).state
    const refreshed = actionOrderMarket(begun, playerId, 'REFRESH')
    expect(refreshed.events).toEqual([
      { type: 'OrderDeckRecycled', playerId },
      { type: 'OrderMarketRefreshed', playerId },
    ])
    expect(refreshed.state.runtimeRng.runtimeRngCounters['orders/recycle']).toBeGreaterThan(0)
    const declined = actionOrderMarket(refreshed.state, playerId, 'DECLINE')
    expect(declined.state.runtimeRng).toEqual(refreshed.state.runtimeRng)
    const projection = projectGameForViewer(declined.state, null)
    expect(projection).not.toHaveProperty('runtimeRng')
    expect(projection.orderMarket).toEqual({
      visibleOrders: refreshed.state.orderMarket.visibleOrders,
      remainingOrderCount: refreshed.state.orderMarket.remainingOrderIds.length,
    })
  })

  it('при недостатке карт сохраняет PENDING и не расходует RNG', () => {
    const initial = scenario()
    const input = { ...initial, orderMarket: {
      visibleOrders: { 1: initial.orderMarket.visibleOrders[1], 2: null, 3: null, 4: null },
      orderMarket: { 1: [], 2: [], 3: [], 4: [] },
      orderDiscard: [], remainingOrderIds: [],
    } }
    const begun = changeStatusPlayer(input, input.activePlayerId).state
    const before = structuredClone(begun)
    expect(() => actionOrderMarket(begun, input.activePlayerId, 'REFRESH')).toThrow()
    expect(begun).toEqual(before)
    expect(begun.players.find(player => player.id === input.activePlayerId)!.status).toBe('PENDING')
  })

  it('начало не меняет значения и признаки заморозки незамороженного входа', () => {
    const input = structuredClone(scenario())
    const before = structuredClone(input)
    const result = changeStatusPlayer(input, input.activePlayerId)
    expect(input).toEqual(before)
    expect(Object.isFrozen(result.state.orderMarket)).toBe(true)
    expect(Object.isFrozen(input.orderMarket)).toBe(false)
    expect(Object.isFrozen(input.runtimeRng.runtimeRngCounters)).toBe(false)
    expect(Object.isFrozen(input.players[1])).toBe(false)
    expect(Object.isFrozen(input.players.find(player => player.id === input.activePlayerId)!.ticketsByColor)).toBe(false)
  })

  it('отклоняет setup, отсутствующего игрока и отказ до обновления атомарно', () => {
    const input = structuredClone(scenario())
    const before = structuredClone(input)
    expect(() => changeStatusPlayer(input, 'missing')).toThrow()
    expect(() => actionOrderMarket(input, 'missing', 'REFRESH')).toThrow()
    expect(() => actionOrderMarket(input, input.activePlayerId, 'DECLINE')).toThrow()
    expect(input).toEqual(before)
    expect(Object.isFrozen(input.orderMarket)).toBe(false)
    const setup = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    expect(() => changeStatusPlayer(setup, setup.players[0]!.id)).toThrow()
    expect(() => actionOrderMarket(setup, setup.players[0]!.id, 'REFRESH')).toThrow()
  })

  it.each(['REFRESH', 'DECLINE'] as const)('%s не замораживает билеты игрока во входном состоянии', command => {
    const initial = scenario()
    const playerId = initial.activePlayerId
    const begun = changeStatusPlayer(initial, playerId).state
    const prepared = command === 'REFRESH'
      ? begun
      : actionOrderMarket(begun, playerId, 'REFRESH').state
    const input = structuredClone(prepared)
    const before = structuredClone(input)
    const result = actionOrderMarket(input, playerId, command)
    expect(input).toEqual(before)
    expect(Object.isFrozen(result.state.players.find(player => player.id === playerId)!.ticketsByColor)).toBe(true)
    expect(Object.isFrozen(input.players.find(player => player.id === playerId)!.ticketsByColor)).toBe(false)
  })
})
