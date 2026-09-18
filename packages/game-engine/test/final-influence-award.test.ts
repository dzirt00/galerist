import { describe, expect, it } from 'vitest'
import {
  applyFinalInfluenceScoreToPlayer,
  applyFinalInfluenceScoreToPlayers,
  type PlayerState,
} from '../src/index.js'

/** Создаёт игрока с заданными ресурсами для проверки итоговой выплаты. */
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

describe('Итоговая выплата игроку через applyFinalInfluenceScoreToPlayer', () => {
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

describe('Итоговые выплаты игрокам через applyFinalInfluenceScoreToPlayers', () => {
  it('применяет выплату каждому игроку в исходном порядке, включая границы шкалы', () => {
    const players: readonly PlayerState[] = [
      {
        id: 'first',
        name: 'Алина',
        kind: 'human',
        coins: 10,
        influence: 0,
      },
      {
        id: 'second',
        name: 'Борис',
        kind: 'bot',
        coins: 7,
        influence: 35,
      },
    ]

    const result = applyFinalInfluenceScoreToPlayers(players)

    expect(result).toEqual([
      { ...players[0], coins: 10 },
      { ...players[1], coins: 27 },
    ])
    expect(result.map((player) => player.id)).toEqual(['first', 'second'])
  })

  it('не изменяет и не замораживает входы, а возвращает замороженные независимые результаты', () => {
    const firstPlayer: PlayerState = {
      id: 'first',
      name: 'Алина',
      kind: 'human',
      coins: 4,
      influence: 23,
    }
    const secondPlayer: PlayerState = {
      id: 'second',
      name: 'Борис',
      kind: 'bot',
      coins: 6,
      influence: 34,
    }
    const players: readonly PlayerState[] = [firstPlayer, secondPlayer]
    const snapshot = structuredClone(players)

    const firstResult = applyFinalInfluenceScoreToPlayers(players)
    const secondResult = applyFinalInfluenceScoreToPlayers(players)

    expect(players).toEqual(snapshot)
    expect(Object.isFrozen(players)).toBe(false)
    expect(Object.isFrozen(firstPlayer)).toBe(false)
    expect(Object.isFrozen(secondPlayer)).toBe(false)
    expect(Object.isFrozen(firstResult)).toBe(true)
    expect(firstResult.every(Object.isFrozen)).toBe(true)
    expect(firstResult).not.toBe(players)
    expect(firstResult[0]).not.toBe(firstPlayer)
    expect(firstResult[1]).not.toBe(secondPlayer)
    expect(firstResult).toEqual(secondResult)
    expect(firstResult).not.toBe(secondResult)
    expect(firstResult[0]).not.toBe(secondResult[0])
    expect(firstResult[1]).not.toBe(secondResult[1])
  })

  it('возвращает новый замороженный пустой массив', () => {
    const players: readonly PlayerState[] = []

    const firstResult = applyFinalInfluenceScoreToPlayers(players)
    const secondResult = applyFinalInfluenceScoreToPlayers(players)

    expect(firstResult).toEqual([])
    expect(Object.isFrozen(firstResult)).toBe(true)
    expect(firstResult).not.toBe(players)
    expect(secondResult).not.toBe(firstResult)
  })
})
