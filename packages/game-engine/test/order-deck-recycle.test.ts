import { describe, expect, it } from 'vitest'
import {
  refreshOrderMarket, restoreGameState, projectGameForViewer, projectEventsForViewer,
  type GameState,
} from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function scenario() {
  const state = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const ids = [...Object.values(state.orderMarket.visibleOrders), ...state.orderMarket.remainingOrderIds]
    .filter((id): id is string => id !== null)
  return {
    ...state,
    orderMarket: {
      visibleOrders: { 1: null, 2: ids[0]!, 3: ids[1]!, 4: ids[2]! },
      orderMarket: { 1: [], 2: [ids[3]!], 3: [ids[4]!], 4: [ids[5]!] },
      orderDiscard: [ids[6]!],
      remainingOrderIds: [],
    },
  }
}

function allOrders(state: GameState) {
  return [
    ...Object.values(state.orderMarket.visibleOrders).filter((id): id is string => id !== null),
    ...Object.values(state.orderMarket.orderMarket).flat(),
    ...state.orderMarket.orderDiscard,
    ...state.orderMarket.remainingOrderIds,
  ].sort()
}

describe('ORDER-002 / ADR-008: переработка изначально пустой колоды', () => {
  it('собирает все слои и сброс, сохраняет карты, события и независимый замороженный результат', () => {
    const input = structuredClone(scenario())
    const before = structuredClone(input)
    const result = refreshOrderMarket(input, input.activePlayerId)
    expect(input).toEqual(before)
    expect(Object.isFrozen(input.runtimeRng.runtimeRngCounters)).toBe(false)
    expect(Object.isFrozen(input.orderMarket.orderMarket[2])).toBe(false)
    expect(allOrders(result.state)).toEqual(allOrders(input))
    expect(new Set(allOrders(result.state)).size).toBe(7)
    expect(Object.values(result.state.orderMarket.visibleOrders)).not.toContain(null)
    expect(result.state.orderMarket.remainingOrderIds).toHaveLength(3)
    expect(result.state.orderMarket.orderDiscard).toEqual([])
    expect(Object.values(result.state.orderMarket.orderMarket)).toEqual([[], [], [], []])
    expect(result.state.runtimeRng.runtimeRngCounters['orders/recycle']).toBeGreaterThanOrEqual(6)
    expect(Object.isFrozen(result.state.runtimeRng.runtimeRngCounters)).toBe(true)
    expect(Object.isFrozen(result.state.orderMarket.remainingOrderIds)).toBe(true)
    expect(result.state.players).toEqual(input.players)
    expect(result.state.playerBoards).toEqual(input.playerBoards)
    expect(result.state.phase).toBe(input.phase)
    expect(result.state.activePlayerId).toBe(input.activePlayerId)
    expect(result.events).toEqual([
      { type: 'OrderDeckRecycled', playerId: input.activePlayerId },
      { type: 'OrderMarketRefreshed', playerId: input.activePlayerId },
    ])
    expect(refreshOrderMarket(input, input.activePlayerId)).toEqual(result)
    expect(projectEventsForViewer(result.events, result.state, null)).toEqual(result.events)
    for (const viewerId of [null, ...input.players.map(player => player.id)]) {
      const projection = projectGameForViewer(result.state, viewerId)
      expect(projection).not.toHaveProperty('runtimeRng')
      expect(projection).not.toHaveProperty('setupVersions')
      expect(projection.orderMarket).toEqual({
        visibleOrders: result.state.orderMarket.visibleOrders, remainingOrderCount: 3,
      })
    }
  })

  it('при ровно четырёх собранных картах допускает повторные переработки и продолжение из JSON', () => {
    const initial = scenario()
    const ids = allOrders(initial).slice(0, 4)
    const input = { ...initial, orderMarket: {
      visibleOrders: { 1: ids[0]!, 2: ids[1]!, 3: ids[2]!, 4: ids[3]! },
      orderMarket: { 1: [], 2: [], 3: [], 4: [] },
      orderDiscard: [], remainingOrderIds: [],
    } }
    const first = refreshOrderMarket(restoreGameState(input), input.activePlayerId)
    expect(first.state.orderMarket.remainingOrderIds).toEqual([])
    const restored = restoreGameState(JSON.parse(JSON.stringify(first.state)))
    const second = refreshOrderMarket(first.state, input.activePlayerId)
    expect(refreshOrderMarket(restored, input.activePlayerId)).toEqual(second)
    expect(second.state.runtimeRng.runtimeRngCounters['orders/recycle'])
      .toBeGreaterThan(first.state.runtimeRng.runtimeRngCounters['orders/recycle'])
    expect(allOrders(second.state)).toEqual(ids)
  })

  it('сохраняет независимые счётчики других потоков и не расходует RNG без переработки', () => {
    const input = scenario()
    const withOtherStream = { ...input, runtimeRng: { ...input.runtimeRng,
      runtimeRngCounters: { ...input.runtimeRng.runtimeRngCounters, other: 17 },
    } }
    const plain = refreshOrderMarket(input, input.activePlayerId)
    const other = refreshOrderMarket(restoreGameState(withOtherStream), input.activePlayerId)
    expect(other.state.orderMarket).toEqual(plain.state.orderMarket)
    expect(other.state.runtimeRng.runtimeRngCounters).toEqual({
      ...plain.state.runtimeRng.runtimeRngCounters, other: 17,
    })
    const regular = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
    expect(refreshOrderMarket(regular, regular.activePlayerId).state.runtimeRng).toEqual(regular.runtimeRng)
  })

  it.each(['insufficient', 'missing-player', 'setup', 'overflow'] as const)(
    'атомарно отклоняет %s без расхода входного RNG', reason => {
      const input = structuredClone(scenario())
      let source: GameState = input
      let playerId = input.activePlayerId
      if (reason === 'insufficient') source = { ...input, orderMarket: {
        visibleOrders: { 1: null, 2: null, 3: null, 4: null },
        orderMarket: { 1: [], 2: [], 3: [], 4: [] },
        orderDiscard: input.orderMarket.orderDiscard, remainingOrderIds: [],
      } }
      if (reason === 'missing-player') playerId = 'missing'
      if (reason === 'setup') source = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
      if (reason === 'overflow') source = { ...input, runtimeRng: { ...input.runtimeRng,
        runtimeRngCounters: { 'orders/recycle': Number.MAX_SAFE_INTEGER },
      } }
      const before = structuredClone(source)
      expect(() => refreshOrderMarket(source, playerId)).toThrow()
      expect(source).toEqual(before)
    },
  )
})

describe('ADR-008: валидация runtime-RNG в схеме 10', () => {
  it('инициализирует RNG и отклоняет старую схему', () => {
    const state = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    expect(state.runtimeRng).toEqual({
      runtimeRngVersion: 'runtime-rng-v1', runtimeRngCounters: { 'orders/recycle': 0 },
    })
    expect(() => restoreGameState({ ...state, stateSchemaVersion: 9 })).toThrow()
  })

  it.each([
    undefined, null, {},
    { runtimeRngVersion: 'unknown', runtimeRngCounters: { 'orders/recycle': 0 } },
    { runtimeRngVersion: 'runtime-rng-v1', runtimeRngCounters: null },
    { runtimeRngVersion: 'runtime-rng-v1', runtimeRngCounters: {} },
    ...[-1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1].map(value => ({
      runtimeRngVersion: 'runtime-rng-v1', runtimeRngCounters: { 'orders/recycle': value },
    })),
    ...[-1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1].map(value => ({
      runtimeRngVersion: 'runtime-rng-v1', runtimeRngCounters: { 'orders/recycle': 0, other: value },
    })),
  ])('отклоняет повреждённое RNG: %j', runtimeRng => {
    const source = { ...structuredClone(scenario()), runtimeRng }
    const before = structuredClone(source)
    expect(() => restoreGameState(source)).toThrow('Invalid game state:')
    expect(source).toEqual(before)
  })
})
