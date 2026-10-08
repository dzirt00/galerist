import { describe, expect, it } from 'vitest'
import { restoreGameState, projectGameForViewer } from '../src/index.js'
import { changeStatusPlayer } from '../src/change-status-player.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

type Status = 'completed' | 'unfulfilled' | null
function scenario(statuses: readonly [Status, Status, Status] = [null, null, null]) {
  const base = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const ids = base.orderMarket.remainingOrderIds.slice(0, 3)
  const slot = (index: number) => ({
    orderId: statuses[index] === null ? null : ids[index]!,
    orderStatus: statuses[index]!,
  })
  const usedIds = ids.filter((_, index) => statuses[index] !== null)
  return {
    ...base,
    orderMarket: { ...base.orderMarket,
      remainingOrderIds: base.orderMarket.remainingOrderIds.filter(id => !usedIds.includes(id)),
    },
    playerBoards: base.playerBoards.map(board => board.playerId === base.activePlayerId
      ? { ...board, boardOrders: { 1: slot(0), 2: slot(1), 3: slot(2) } }
      : board),
  }
}

describe('ORDER-001: регрессия внутренней проверки лимита и снимка', () => {
  it.each([
    [null, null, null],
    ['unfulfilled', null, null],
    ['unfulfilled', 'unfulfilled', null],
    ['unfulfilled', 'unfulfilled', 'completed'],
    ['completed', 'completed', 'completed'],
  ] as const)('разрешает начало при клетках %s, %s, %s', (a, b, c) => {
    const input = scenario([a, b, c])
    const before = structuredClone(input)
    const result = changeStatusPlayer(input, input.activePlayerId)
    expect(result.events).toEqual([])
    expect(result.state).toEqual({ ...before,
      players: before.players.map(player => player.id === input.activePlayerId
        ? { ...player, status: 'PENDING' } : player),
    })
    expect(input).toEqual(before)
    expect(Object.isFrozen(input.playerBoards[0]!.boardOrders)).toBe(false)
    expect(Object.isFrozen(result.state.playerBoards[0]!.boardOrders[1])).toBe(true)
    expect(() => changeStatusPlayer(result.state, input.activePlayerId)).toThrow()
  })

  it.each([false, true])('три невыполненных заказа запрещают начало; заморожен: %s', frozen => {
    const source = scenario(['unfulfilled', 'unfulfilled', 'unfulfilled'])
    const input = frozen ? restoreGameState(source) : source
    const before = structuredClone(input)
    expect(() => changeStatusPlayer(input, source.activePlayerId)).toThrow('invalid slots')
    expect(input).toEqual(before)
    expect(Object.isFrozen(input.playerBoards[0]!.boardOrders[1])).toBe(frozen)
    expect(input.players.find(player => player.id === source.activePlayerId)!.status).toBe('WAITING')
  })

  it('считает заказы выбранного игрока, даже если его планшет расположен вторым', () => {
    const base = scenario(['unfulfilled', 'unfulfilled', 'unfulfilled'])
    const input = { ...base, playerBoards: [...base.playerBoards].reverse() }
    const otherPlayerId = input.players.find(player => player.id !== input.activePlayerId)!.id
    expect(() => changeStatusPlayer(input, input.activePlayerId)).toThrow('invalid slots')
    const result = changeStatusPlayer(input, otherPlayerId)
    expect(result.state.players.find(player => player.id === otherPlayerId)!.status).toBe('PENDING')
    expect(result.state.playerBoards).toEqual(input.playerBoards)
  })

  it('атомарно отклоняет отсутствующий планшет', () => {
    const base = scenario()
    const input = { ...base, playerBoards: base.playerBoards.filter(board => board.playerId !== base.activePlayerId) }
    const before = structuredClone(input)
    expect(() => changeStatusPlayer(input, input.activePlayerId)).toThrow('invalid board')
    expect(input).toEqual(before)
    expect(Object.isFrozen(input)).toBe(false)
  })

  it.each([
    { orderId: null, orderStatus: 'unfulfilled' as const },
    { orderId: 'ORDER-01', orderStatus: null },
  ])('прямая команда отклоняет несогласованную клетку %j', slot => {
    const base = scenario()
    const input = { ...base, playerBoards: base.playerBoards.map(board => board.playerId === base.activePlayerId
      ? { ...board, boardOrders: { ...board.boardOrders, 1: slot } } : board) }
    const before = structuredClone(input)
    expect(() => changeStatusPlayer(input, input.activePlayerId)).toThrow('invalid boardOrders')
    expect(input).toEqual(before)
    expect(Object.isFrozen(input.playerBoards[0]!.boardOrders)).toBe(false)
  })

  it('схема 12 и публичная проекция сохраняют клетки и решение о лимите', () => {
    const input = scenario(['unfulfilled', 'unfulfilled', 'completed'])
    expect(input.stateSchemaVersion).toBe(12)
    const restored = restoreGameState(JSON.parse(JSON.stringify(input)))
    expect(restored).toEqual(input)
    const result = changeStatusPlayer(restored, input.activePlayerId)
    expect(result).toEqual(changeStatusPlayer(input, input.activePlayerId))
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
    expect(projectGameForViewer(result.state, null).playerBoards).toEqual(input.playerBoards)
    expect(() => restoreGameState({ ...input, stateSchemaVersion: 11 })).toThrow()
  })

  it.each([
    {},
    { 1: { orderId: null, orderStatus: null }, 2: { orderId: null, orderStatus: null } },
    { '01': { orderId: null, orderStatus: null }, 2: { orderId: null, orderStatus: null }, 3: { orderId: null, orderStatus: null } },
    { 1: { orderId: null, orderStatus: null }, 2: { orderId: null, orderStatus: null }, 3: { orderId: null, orderStatus: null }, '01': { orderId: null, orderStatus: null } },
  ])('восстановление отклоняет неверные ключи %j', boardOrders => {
    const source = structuredClone(scenario())
    const board = source.playerBoards[0]! as unknown as Record<string, unknown>
    board.boardOrders = boardOrders
    const before = structuredClone(source)
    expect(() => restoreGameState(source)).toThrow('Invalid game state:')
    expect(source).toEqual(before)
  })

  it.each([
    { orderId: null, orderStatus: 'completed' },
    { orderId: null, orderStatus: 'unfulfilled' },
    { orderId: 'ORDER-01', orderStatus: null },
    { orderId: '', orderStatus: 'unfulfilled' },
    { orderId: 'ORDER-01', orderStatus: 'unknown' },
    { orderId: null },
  ])('восстановление отклоняет повреждённую клетку %j', slot => {
    const source = structuredClone(scenario())
    const orders = source.playerBoards[0]!.boardOrders as unknown as Record<string, unknown>
    orders['1'] = slot
    const before = structuredClone(source)
    expect(() => restoreGameState(source)).toThrow('Invalid game state:')
    expect(source).toEqual(before)
  })
})
