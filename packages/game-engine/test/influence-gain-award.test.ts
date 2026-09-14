import { describe, expect, it } from 'vitest'
import {
  applyInfluenceGainToPlayer,
  applyInfluenceGainToPlayers,
  type PlayerGainedInfluence,
  type PlayerState,
} from '../src/index.js'

function createPlayer(
  id: string,
  coins: number,
  influence: number,
): PlayerState {
  return {
    id,
    name: `Player ${id}`,
    kind: 'human',
    coins,
    influence,
  }
}

describe('applyInfluenceGainToPlayer', () => {
  it('применяет прирост, сохраняет остальные поля и возвращает нового замороженного игрока', () => {
    const player = createPlayer('first', 8, 32)
    const snapshot = structuredClone(player)

    const result = applyInfluenceGainToPlayer(player, 3)

    expect(result).toEqual(createPlayer('first', 8, 35))
    expect(player).toEqual(snapshot)
    expect(Object.isFrozen(player)).toBe(false)
    expect(result).not.toBe(player)
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('возвращает нового замороженного игрока и при нулевом приросте', () => {
    const player = Object.freeze(createPlayer('first', 4, 12))

    const result = applyInfluenceGainToPlayer(player, 0)

    expect(result).toEqual(player)
    expect(result).not.toBe(player)
    expect(Object.isFrozen(result)).toBe(true)
  })
})

describe('applyInfluenceGainToPlayers', () => {
  it('применяет награды в исходном порядке, не изменяет входы и создаёт независимые замороженные результаты', () => {
    const sharedPlayer = createPlayer('shared', 5, 10)
    const secondPlayer = createPlayer('second', 9, 34)
    const firstEntry: PlayerGainedInfluence = { player: sharedPlayer, gainedInfluence: 2 }
    const secondEntry: PlayerGainedInfluence = { player: sharedPlayer, gainedInfluence: 4 }
    const thirdEntry: PlayerGainedInfluence = { player: secondPlayer, gainedInfluence: 3 }
    const entries: readonly PlayerGainedInfluence[] = [firstEntry, secondEntry, thirdEntry]
    const snapshot = structuredClone(entries)

    const result = applyInfluenceGainToPlayers(entries)

    expect(result).toEqual([
      createPlayer('shared', 5, 12),
      createPlayer('shared', 5, 14),
      createPlayer('second', 9, 35),
    ])
    expect(entries).toEqual(snapshot)
    expect(Object.isFrozen(entries)).toBe(false)
    expect(Object.isFrozen(firstEntry)).toBe(false)
    expect(Object.isFrozen(secondEntry)).toBe(false)
    expect(Object.isFrozen(thirdEntry)).toBe(false)
    expect(Object.isFrozen(sharedPlayer)).toBe(false)
    expect(Object.isFrozen(secondPlayer)).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(result[0]).not.toBe(sharedPlayer)
    expect(result[1]).not.toBe(sharedPlayer)
    expect(result[2]).not.toBe(secondPlayer)
    expect(result[0]).not.toBe(result[1])
    expect(result.every(Object.isFrozen)).toBe(true)
  })

  it('возвращает новый замороженный пустой массив', () => {
    const entries: readonly PlayerGainedInfluence[] = []

    const firstResult = applyInfluenceGainToPlayers(entries)
    const secondResult = applyInfluenceGainToPlayers(entries)

    expect(firstResult).toEqual([])
    expect(Object.isFrozen(firstResult)).toBe(true)
    expect(firstResult).not.toBe(entries)
    expect(secondResult).not.toBe(firstResult)
  })

  it('пробрасывает ошибку в записи, не изменяя входные данные', () => {
    const firstPlayer = Object.freeze(createPlayer('first', 3, 10))
    const invalidPlayer = Object.freeze(createPlayer('invalid', 4, 12))
    const entries = Object.freeze([
      Object.freeze({ player: firstPlayer, gainedInfluence: 2 }),
      Object.freeze({ player: invalidPlayer, gainedInfluence: -1 }),
    ])
    const snapshot = structuredClone(entries)

    expect(() => applyInfluenceGainToPlayers(entries)).toThrow(
      'gainedInfluence must be a non-negative safe integer',
    )
    expect(entries).toEqual(snapshot)
    expect(Object.isFrozen(entries)).toBe(true)
    expect(Object.isFrozen(entries[0])).toBe(true)
    expect(Object.isFrozen(entries[1])).toBe(true)
    expect(Object.isFrozen(firstPlayer)).toBe(true)
    expect(Object.isFrozen(invalidPlayer)).toBe(true)
  })
})
