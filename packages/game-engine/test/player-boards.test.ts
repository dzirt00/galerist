import { expect, it } from 'vitest'
import { preparePlayerBoards } from '../src/index.js'

it('готовит планшеты в порядке игроков с двумя помощниками в офисе и восемью в очереди', () => {
  const result = preparePlayerBoards(
    ['player-2', 'player-1'],
    { office: 2, hireQueue: 8 },
  )

  expect(result.map(board => board.playerId)).toEqual(['player-2', 'player-1'])
  expect(result.every(board => (
    board.assistants.office === 2
    && board.assistants.hireQueue === 8
    && board.startingLocationId === null
    && board.thirdPartitionReputationTokenId === null
  ))).toBe(true)
})

it('глубоко замораживает результат, не замораживая входной запас', () => {
  const assistants = { office: 2, hireQueue: 8 } as const
  const result = preparePlayerBoards(['player-1', 'player-2'], assistants)

  expect(Object.isFrozen(result)).toBe(true)
  expect(result.every(Object.isFrozen)).toBe(true)
  expect(result.every(board => Object.isFrozen(board.assistants))).toBe(true)
  expect(Object.isFrozen(assistants)).toBe(false)
})
