import { describe, expect, it } from 'vitest'
import {
  createSetupRng,
  placeInitialVisitors,
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

/** Сравнивает ASCII-идентификаторы посетителей для проверки порядка. */
const compareAsciiIds = (left: VisitorInstance, right: VisitorInstance): number =>
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0

describe('Подготовка мешка посетителей через prepareVisitorBag', () => {
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

describe('Начальное размещение посетителей через placeInitialVisitors', () => {
  const playerIds = ['player-1', 'player-2', 'player-3']

  it('берёт первых четырёх на площадь, затем по одному игрокам в порядке мест', () => {
    const visitors = setupComponentCatalog.visitorInstancesByPlayerCount[3]
      .slice(0, 10).map(visitor => ({ ...visitor }))
    const result = placeInitialVisitors({ visitors }, playerIds)

    expect(result.plazaVisitors.map(visitor => visitor.id)).toEqual(visitors.slice(0, 4).map(visitor => visitor.id))
    expect(result.visitorPlayers.map(({ playerId, vestibuleVisitor }) => [playerId, vestibuleVisitor.id])).toEqual(
      playerIds.map((id, index) => [id, visitors[index + 4]!.id]),
    )
    expect(result.remainingVisitors.map(visitor => visitor.id)).toEqual(visitors.slice(7).map(visitor => visitor.id))
    expect([
      ...result.plazaVisitors,
      ...result.visitorPlayers.map(({ vestibuleVisitor }) => vestibuleVisitor),
      ...result.remainingVisitors,
    ].map(visitor => visitor.id)).toEqual(visitors.map(visitor => visitor.id))
  })

  it('отклоняет недостаточный остаток мешочка и недопустимый состав игроков', () => {
    const visitors = setupComponentCatalog.visitorInstancesByPlayerCount[2]
      .slice(0, 5).map(visitor => ({ ...visitor }))
    const enoughVisitors = setupComponentCatalog.visitorInstancesByPlayerCount[2]
      .slice(0, 8).map(visitor => ({ ...visitor }))

    expect(() => placeInitialVisitors({ visitors }, ['player-1', 'player-2'])).toThrow()
    expect(() => placeInitialVisitors({ visitors: enoughVisitors }, ['player-1'])).toThrow('invalid playerIds')
    expect(() => placeInitialVisitors({ visitors: enoughVisitors }, ['player-1', 'player-1'])).toThrow('invalid playerIds')
    expect(visitors).toHaveLength(5)
  })

  it('возвращает замороженные независимые данные, не изменяя и не замораживая вход', () => {
    const visitors = setupComponentCatalog.visitorInstancesByPlayerCount[2]
      .slice(0, 8).map(visitor => ({ ...visitor }))
    const snapshot = structuredClone(visitors)
    const result = placeInitialVisitors({ visitors }, ['player-1', 'player-2'])

    expect(visitors).toEqual(snapshot)
    expect(Object.isFrozen(visitors)).toBe(false)
    expect(visitors.every(visitor => !Object.isFrozen(visitor))).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.plazaVisitors)).toBe(true)
    expect(Object.isFrozen(result.visitorPlayers)).toBe(true)
    expect(Object.isFrozen(result.remainingVisitors)).toBe(true)
    expect(result.visitorPlayers.every(Object.isFrozen)).toBe(true)
    expect(result.plazaVisitors[0]).not.toBe(visitors[0])
  })
})
