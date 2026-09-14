import { describe, expect, it } from 'vitest'
import {
  applyFinalInfluenceScoreToPlayer,
  type PlayerState,
} from '../src/index.js'

function createPlayer(
  coins: number,
  influence: number,
): Readonly<PlayerState> {
  return Object.freeze({
    id: 'player-1',
    name: 'Алина',
    kind: 'human',
    coins,
    influence,
  })
}

describe('applyFinalInfluenceScoreToPlayer', () => {
  it.each([
    [10, 0, 10],
    [10, 23, 18],
    [10, 35, 30],
  ] as const)(
    'прибавляет финальную выплату за %i влияния',
    (coins, influence, expectedCoins) => {
      const player = createPlayer(coins, influence)

      const result = applyFinalInfluenceScoreToPlayer(player)

      expect(result).toEqual({
        id: 'player-1',
        name: 'Алина',
        kind: 'human',
        coins: expectedCoins,
        influence,
      })
    },
  )

  it('не изменяет входного игрока и возвращает новый замороженный объект', () => {
    const player = createPlayer(7, 26)
    const snapshot = structuredClone(player)

    const result = applyFinalInfluenceScoreToPlayer(player)

    expect(player).toEqual(snapshot)
    expect(result).not.toBe(player)
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('возвращает независимые результаты повторных вызовов', () => {
    const player = createPlayer(12, 34)

    const firstResult = applyFinalInfluenceScoreToPlayer(player)
    const secondResult = applyFinalInfluenceScoreToPlayer(player)

    expect(firstResult).toEqual(secondResult)
    expect(firstResult).not.toBe(secondResult)
  })
})
