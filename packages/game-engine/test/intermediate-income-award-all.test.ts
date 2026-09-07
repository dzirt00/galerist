import { describe, expect, it } from 'vitest'
import {
  applyIntermediateIncomeToPlayers,
  type IntermediateIncomeAwardInput,
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

describe('applyIntermediateIncomeToPlayers', () => {
  it('применяет каждому игроку доход от его посетителей и сохраняет порядок', () => {
    const entries: IntermediateIncomeAwardInput[] = [
      {
        player: createPlayer('first', 2, 2),
        visitors: { investors: 1, celebrities: 1, collectors: 1 },
      },
      {
        player: createPlayer('second', 3, 3),
        visitors: { investors: 2, celebrities: 2, collectors: 2 },
      },
    ]

    expect(applyIntermediateIncomeToPlayers(entries)).toEqual([
      createPlayer('first', 5, 5),
      createPlayer('second', 9, 9),
    ])
  })

  it('ограничивает влияние значением 35 независимо для каждого игрока', () => {
    const entries: IntermediateIncomeAwardInput[] = [
      {
        player: createPlayer('first', 2, 34),
        visitors: { investors: 3, celebrities: 3, collectors: 3 },
      },
      {
        player: createPlayer('second', 3, 3),
        visitors: { investors: 2, celebrities: 2, collectors: 30 },
      },
    ]

    expect(applyIntermediateIncomeToPlayers(entries)).toEqual([
      createPlayer('first', 11, 35),
      createPlayer('second', 37, 35),
    ])
  })

  it('для нулевого состава возвращает нового игрока с прежними ресурсами', () => {
    const player = createPlayer('first', 8, 13)

    const [result] = applyIntermediateIncomeToPlayers([
      {
        player,
        visitors: { investors: 0, celebrities: 0, collectors: 0 },
      },
    ])

    expect(result).toEqual(player)
    expect(result).not.toBe(player)
  })

  it('не изменяет и не замораживает входной массив, записи, игроков и посетителей', () => {
    const firstPlayer = createPlayer('first', 2, 2)
    const secondPlayer = createPlayer('second', 3, 3)
    const firstVisitors = { investors: 1, celebrities: 1, collectors: 1 }
    const secondVisitors = { investors: 2, celebrities: 2, collectors: 2 }
    const firstEntry: IntermediateIncomeAwardInput = {
      player: firstPlayer,
      visitors: firstVisitors,
    }
    const secondEntry: IntermediateIncomeAwardInput = {
      player: secondPlayer,
      visitors: secondVisitors,
    }
    const entries = [firstEntry, secondEntry]
    const snapshot = structuredClone(entries)

    applyIntermediateIncomeToPlayers(entries)

    expect(entries).toEqual(snapshot)
    expect(Object.isFrozen(entries)).toBe(false)
    expect(Object.isFrozen(firstEntry)).toBe(false)
    expect(Object.isFrozen(secondEntry)).toBe(false)
    expect(Object.isFrozen(firstPlayer)).toBe(false)
    expect(Object.isFrozen(secondPlayer)).toBe(false)
    expect(Object.isFrozen(firstVisitors)).toBe(false)
    expect(Object.isFrozen(secondVisitors)).toBe(false)
  })

  it('возвращает замороженный массив новых замороженных игроков', () => {
    const entries: IntermediateIncomeAwardInput[] = [
      {
        player: createPlayer('first', 2, 2),
        visitors: { investors: 1, celebrities: 1, collectors: 1 },
      },
      {
        player: createPlayer('second', 3, 3),
        visitors: { investors: 2, celebrities: 2, collectors: 2 },
      },
    ]

    const result = applyIntermediateIncomeToPlayers(entries)

    expect(Object.isFrozen(result)).toBe(true)
    expect(result).toHaveLength(entries.length)
    result.forEach((player, index) => {
      expect(Object.isFrozen(player)).toBe(true)
      expect(player).not.toBe(entries[index]?.player)
    })
  })

  it('при повторных вызовах возвращает равные, но независимые результаты', () => {
    const entries: IntermediateIncomeAwardInput[] = [
      {
        player: createPlayer('first', 2, 2),
        visitors: { investors: 1, celebrities: 1, collectors: 1 },
      },
      {
        player: createPlayer('second', 3, 3),
        visitors: { investors: 2, celebrities: 2, collectors: 2 },
      },
    ]

    const firstResult = applyIntermediateIncomeToPlayers(entries)
    const secondResult = applyIntermediateIncomeToPlayers(entries)

    expect(secondResult).toEqual(firstResult)
    expect(secondResult).not.toBe(firstResult)
    secondResult.forEach((player, index) => {
      expect(player).not.toBe(firstResult[index])
    })
  })

  it('для пустого входа возвращает новый замороженный пустой массив', () => {
    const entries: IntermediateIncomeAwardInput[] = []

    const firstResult = applyIntermediateIncomeToPlayers(entries)
    const secondResult = applyIntermediateIncomeToPlayers(entries)

    expect(firstResult).toEqual([])
    expect(Object.isFrozen(firstResult)).toBe(true)
    expect(firstResult).not.toBe(entries)
    expect(secondResult).toEqual(firstResult)
    expect(secondResult).not.toBe(firstResult)
    expect(Object.isFrozen(entries)).toBe(false)
  })
})
