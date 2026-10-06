import { expect, it } from 'vitest'
import { restoreGameState } from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState } from './helpers.js'

it.each([undefined, null, 0, 1, 'false', 'true', {}, []])(
  'END-001: восстановление отклоняет нелогический ticketOfficeEmptyReached=%j',
  value => {
    const snapshot: Record<string, unknown> = structuredClone(
      createGameState(twoPlayerGameConfig, twoPlayerConfigs),
    ) as unknown as Record<string, unknown>
    if (value === undefined) delete snapshot.ticketOfficeEmptyReached
    else snapshot.ticketOfficeEmptyReached = value
    const before = structuredClone(snapshot)

    expect(() => restoreGameState(snapshot)).toThrow(/ticketOfficeEmptyReached/)
    expect(snapshot).toEqual(before)
  },
)

it.each([false, true])('END-001: восстановление сохраняет ticketOfficeEmptyReached=%s', value => {
  const snapshot = {
    ...structuredClone(createGameState(twoPlayerGameConfig, twoPlayerConfigs)),
    ticketOfficeEmptyReached: value,
  }
  const restored = restoreGameState(JSON.parse(JSON.stringify(snapshot)))
  expect(restored.ticketOfficeEmptyReached).toBe(value)
  expect(restored).toEqual(snapshot)
  expect(restored).not.toBe(snapshot)
  expect(Object.isFrozen(restored)).toBe(true)
})
