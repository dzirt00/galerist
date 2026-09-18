import { describe, expect, it } from 'vitest'
import {
  spendInfluenceForImmediatePayment,
  type PlayerState,
} from '../src/index.js'

/** Создаёт игрока с заданными монетами и влиянием для проверки оплаты. */
function createPlayer(coins: number, influence: number): Readonly<PlayerState> {
  return Object.freeze({
    id: 'player-1',
    name: 'Алина',
    kind: 'human',
    coins,
    influence,
  })
}

describe('Оплата влиянием через spendInfluenceForImmediatePayment', () => {
  it('оплачивает стоимость собственными монетами и доходом от влияния', () => {
    const player = createPlayer(2, 10)

    const result = spendInfluenceForImmediatePayment(player, 3, 8)

    expect(result).toEqual({
      ...player,
      coins: 0,
      influence: 8,
    })
  })

  it('разрешает потратить влияние при достаточном числе собственных монет', () => {
    const player = createPlayer(10, 10)

    const result = spendInfluenceForImmediatePayment(player, 5, 8)

    expect(result).toEqual({
      ...player,
      coins: 6,
      influence: 8,
    })
  })

  it('учитывает монету при переходе с 1 влияния к 0', () => {
    const player = createPlayer(0, 1)

    const result = spendInfluenceForImmediatePayment(player, 1, 0)

    expect(result).toEqual({
      ...player,
      coins: 0,
      influence: 0,
    })
  })

  it('учитывает все достигнутые денежные символы', () => {
    const player = createPlayer(0, 10)

    const result = spendInfluenceForImmediatePayment(player, 2, 4)

    expect(result).toEqual({
      ...player,
      coins: 0,
      influence: 4,
    })
  })

  it('отклоняет оплату при недостатке средств без изменения входа', () => {
    const player = createPlayer(1, 10)
    const snapshot = structuredClone(player)

    expect(() => spendInfluenceForImmediatePayment(player, 3, 8)).toThrow(
      'Coins < 0',
    )
    expect(player).toEqual(snapshot)
    expect(Object.isFrozen(player)).toBe(true)
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'отклоняет невалидную стоимость %s без изменения входа',
    (cost) => {
      const player = createPlayer(5, 10)
      const snapshot = structuredClone(player)

      expect(() => spendInfluenceForImmediatePayment(player, cost, 8)).toThrow(
        'cost invalid',
      )
      expect(player).toEqual(snapshot)
    },
  )

  it.each([10, 9, 7.5, -1])(
    'пробрасывает ошибку невалидной цели %s без изменения входа',
    (targetInfluence) => {
      const player = createPlayer(5, 10)
      const snapshot = structuredClone(player)

      expect(() =>
        spendInfluenceForImmediatePayment(player, 1, targetInfluence),
      ).toThrow('Invalid influence spend')
      expect(player).toEqual(snapshot)
    },
  )

  it('не изменяет вход, возвращает замороженный результат и создаёт независимые результаты', () => {
    const player = createPlayer(5, 10)
    const snapshot = structuredClone(player)

    const firstResult = spendInfluenceForImmediatePayment(player, 2, 8)
    const secondResult = spendInfluenceForImmediatePayment(player, 2, 8)

    expect(player).toEqual(snapshot)
    expect(firstResult).toEqual(secondResult)
    expect(firstResult).not.toBe(player)
    expect(secondResult).not.toBe(player)
    expect(firstResult).not.toBe(secondResult)
    expect(Object.isFrozen(firstResult)).toBe(true)
    expect(Object.isFrozen(secondResult)).toBe(true)
  })
})
