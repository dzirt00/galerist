import { describe, expect, it } from 'vitest'
import {
  refreshOrderMarket, restoreGameState, projectGameForViewer, projectEventsForViewer,
  type GameState,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function scenario() {
  return startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
}

describe('ORDER-002: обновление без переработки колоды', () => {
  it('дважды обновляет замороженное состояние, сохраняя нижние слои и все карты', () => {
    const state = scenario()
    const before = structuredClone(state)
    const playerId = state.activePlayerId
    const deck = state.orderMarket.remainingOrderIds
    const first = refreshOrderMarket(state, playerId)
    const second = refreshOrderMarket(first.state, playerId)
    expect(state).toEqual(before)
    expect(first.events).toEqual([{ type: 'OrderMarketRefreshed', playerId }])
    expect(second.events).toEqual(first.events)
    for (const position of [1, 2, 3, 4] as const) {
      expect(first.state.orderMarket.orderMarket[position]).toEqual([state.orderMarket.visibleOrders[position]])
      expect(second.state.orderMarket.orderMarket[position]).toEqual([
        state.orderMarket.visibleOrders[position], deck[position - 1],
      ])
      expect(second.state.orderMarket.visibleOrders[position]).toBe(deck[position + 3])
      expect(first.state.orderMarket.orderMarket[position]).not.toBe(state.orderMarket.orderMarket[position])
      expect(Object.isFrozen(second.state.orderMarket.orderMarket[position])).toBe(true)
    }
    expect(second.state.orderMarket.remainingOrderIds).toEqual(deck.slice(8))
    expect(second.state.orderMarket.orderDiscard).toEqual(state.orderMarket.orderDiscard)
    expect(second.state.players).toEqual(state.players)
    expect(second.state.playerBoards).toEqual(state.playerBoards)
    expect(second.state.phase).toBe(state.phase)
    expect(second.state.activePlayerId).toBe(state.activePlayerId)
    const allIds = [
      ...Object.values(second.state.orderMarket.visibleOrders),
      ...Object.values(second.state.orderMarket.orderMarket).flat(),
      ...second.state.orderMarket.remainingOrderIds,
    ]
    expect(allIds.sort()).toEqual([
      ...Object.values(state.orderMarket.visibleOrders), ...deck,
    ].sort())
    const restored = restoreGameState(JSON.parse(JSON.stringify(first.state)))
    expect(refreshOrderMarket(restored, playerId)).toEqual(second)
    expect(projectGameForViewer(second.state, null).orderMarket).toEqual({
      visibleOrders: second.state.orderMarket.visibleOrders,
      remainingOrderCount: deck.length - 8,
    })
    expect(projectEventsForViewer(second.events, second.state, null)).toEqual(second.events)
  })

  it('обновляет незамороженный вход без изменения или замораживания его стопок', () => {
    const state = structuredClone(scenario())
    const before = structuredClone(state)
    refreshOrderMarket(state, state.activePlayerId)
    expect(state).toEqual(before)
    expect(Object.isFrozen(state.orderMarket.orderMarket[1])).toBe(false)
  })

  it('при ровно четырёх картах оставляет пустую колоду; пустая позиция не добавляет null вниз', () => {
    const initial = scenario()
    const state = { ...initial, orderMarket: { ...initial.orderMarket,
      visibleOrders: { ...initial.orderMarket.visibleOrders, 1: null },
      remainingOrderIds: initial.orderMarket.remainingOrderIds.slice(0, 4),
    } }
    const result = refreshOrderMarket(state, state.activePlayerId)
    expect(result.state.orderMarket.remainingOrderIds).toEqual([])
    expect(result.state.orderMarket.orderMarket[1]).toEqual([])
    expect(Object.values(result.state.orderMarket.visibleOrders)).toEqual(state.orderMarket.remainingOrderIds)
  })

  it('отклоняет отсутствующего игрока и setup до переноса карт', () => {
    const state = scenario()
    expect(() => refreshOrderMarket(state, 'missing')).toThrow('Invalid player')
    const setup = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const before = structuredClone(setup)
    expect(() => refreshOrderMarket(setup, setup.players[0]!.id)).toThrow('Invalid phase')
    expect(setup).toEqual(before)
  })

  it.each(['ending_current_round', 'final_round'] as const)('обновляет область в фазе %s', phase => {
    const initial = scenario()
    const state: GameState = { ...initial, phase, endTriggeredRound: initial.round }
    const before = structuredClone(state)
    const result = refreshOrderMarket(state, initial.activePlayerId)
    expect(result.state.phase).toBe(phase)
    expect(result.state.orderMarket.remainingOrderIds).toEqual(state.orderMarket.remainingOrderIds.slice(4))
    expect(state).toEqual(before)
  })

  it.each(['final_scoring', 'finished'] as const)('отклоняет обновление в фазе %s', phase => {
    const initial = scenario()
    const state: GameState = phase === 'final_scoring'
      ? { ...initial, phase, activePlayerId: null, endTriggeredRound: initial.round, finalInfluenceScored: false }
      : { ...initial, phase, status: 'finished', activePlayerId: null, endTriggeredRound: initial.round, winnerIds: [] }
    const before = structuredClone(state)
    expect(() => refreshOrderMarket(state, initial.activePlayerId)).toThrow('Invalid phase')
    expect(state).toEqual(before)
  })
})

describe('Валидация области заказов в снимке версии 10', () => {
  it('сохраняет null в видимой позиции и независимые замороженные нижние стопки', () => {
    const state = structuredClone(scenario())
    const source = { ...state, orderMarket: { ...state.orderMarket,
      visibleOrders: { ...state.orderMarket.visibleOrders, 1: null },
    } }
    const restored = restoreGameState(source)
    expect(restored).toEqual(source)
    expect(restored.orderMarket.orderMarket[1]).not.toBe(source.orderMarket.orderMarket[1])
    expect(Object.isFrozen(restored.orderMarket.orderMarket[1])).toBe(true)
    expect(Object.isFrozen(source.orderMarket.orderMarket[1])).toBe(false)
  })

  it.each([
    ['visibleOrders', {}],
    ['visibleOrders', { 1: null, 2: null, 3: null }],
    ['visibleOrders', { 1: null, 2: null, 3: null, 4: null, 5: null }],
    ['visibleOrders', { 1: 42, 2: null, 3: null, 4: null }],
    ['visibleOrders', { 1: '', 2: null, 3: null, 4: null }],
    ['visibleOrders', { 1: '   ', 2: null, 3: null, 4: null }],
    ['orderMarket', {}],
    ['orderMarket', { 1: [], 2: [], 3: [] }],
    ['orderMarket', { 1: [], 2: [], 3: [], 4: [], 5: [] }],
    ['orderMarket', { 1: null, 2: [], 3: [], 4: [] }],
    ['orderMarket', { 1: [''], 2: [], 3: [], 4: [] }],
    ['orderDiscard', null],
    ['orderDiscard', ['']],
    ['remainingOrderIds', {}],
    ['remainingOrderIds', [42]],
  ])('отклоняет повреждённое поле %s: %j', (field, value) => {
    const state = structuredClone(scenario())
    const source = { ...state, orderMarket: { ...state.orderMarket, [field]: value } }
    const before = structuredClone(source)
    expect(() => restoreGameState(source)).toThrow('Invalid game state:')
    expect(source).toEqual(before)
  })
})
