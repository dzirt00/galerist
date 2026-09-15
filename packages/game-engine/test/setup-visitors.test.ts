import { describe, expect, it } from 'vitest'
import {
  createSetupRng,
  prepareVisitorBag,
  setupComponentCatalog,
  type SetupRngConfig,
  type VisitorInstance,
} from '../src/index.js'

const config: SetupRngConfig = {
  rulesVersion: 'galerist-rules-2026-09-15-v1',
  componentsVersion: 'components-transcription-2026-09-15-v4',
  seed: 41,
  playerIds: ['player-1', 'player-2', 'player-3'],
}

const compareAsciiIds = (left: VisitorInstance, right: VisitorInstance): number =>
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0

describe('prepareVisitorBag', () => {
  it.each([2, 3, 4] as const)(
    'детерминированно готовит полный уникальный мешочек для %i игроков с точными ID и типами',
    playerCount => {
      const input = setupComponentCatalog.visitorInstancesByPlayerCount[playerCount]
        .map(visitor => ({ ...visitor }))
      const expectedOrder = createSetupRng(config).shuffle(
        'visitors',
        [...input].sort(compareAsciiIds),
      )
      const result = prepareVisitorBag(input, createSetupRng(config))

      expect(result.visitors).toEqual(expectedOrder)
      expect(result.visitors).toHaveLength(input.length)
      expect(new Set(result.visitors.map(visitor => visitor.id)).size).toBe(input.length)
      expect([...result.visitors].sort(compareAsciiIds)).toEqual([...input].sort(compareAsciiIds))
      expect(result.visitors.map(visitor => [visitor.id, visitor.type])).toEqual(
        expectedOrder.map(visitor => [visitor.id, visitor.type]),
      )
    },
  )

  it('не зависит от порядка входного массива', () => {
    const input = setupComponentCatalog.visitorInstancesByPlayerCount[4]
      .map(visitor => ({ ...visitor }))

    const forward = prepareVisitorBag(input, createSetupRng(config))
    const reversed = prepareVisitorBag([...input].reverse(), createSetupRng(config))

    expect(forward).toEqual(reversed)
  })

  it('не изменяет и не замораживает вход, возвращает новые глубоко замороженные объекты', () => {
    const input = setupComponentCatalog.visitorInstancesByPlayerCount[3]
      .map(visitor => ({ ...visitor }))
    const snapshot = structuredClone(input)
    const result = prepareVisitorBag(input, createSetupRng(config))

    expect(input).toEqual(snapshot)
    expect(Object.isFrozen(input)).toBe(false)
    expect(input.every(visitor => !Object.isFrozen(visitor))).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.visitors)).toBe(true)
    expect(result.visitors.every(Object.isFrozen)).toBe(true)
    expect(result.visitors.every(visitor => !input.includes(visitor))).toBe(true)
  })

  it('возвращает равные, но независимые результаты для независимых одинаковых RNG', () => {
    const input = setupComponentCatalog.visitorInstancesByPlayerCount[2]
      .map(visitor => ({ ...visitor }))
    const first = prepareVisitorBag(input, createSetupRng(config))
    const second = prepareVisitorBag(input, createSetupRng(config))

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.visitors).not.toBe(second.visitors)
    expect(first.visitors[0]).not.toBe(second.visitors[0])
  })
})
