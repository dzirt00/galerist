import { describe, expect, it } from 'vitest'
import { createSetupRng, type SetupRngConfig } from '../src/index.js'

const config: SetupRngConfig = {
  rulesVersion: 'galerist-rules-2026-09-15-v1',
  componentsVersion: 'components-transcription-2026-09-06-v3',
  seed: -0,
  playerIds: ['p1', 'p2', 'p3'],
}

describe('setup-rng-v1', () => {
  it('produces the fixed SHA-256 vectors and keeps stage counters independent', () => {
    const rng = createSetupRng(config)
    const independentRng = createSetupRng(config)

    expect(Object.isFrozen(rng)).toBe(true)
    expect(independentRng).not.toBe(rng)
    expect(rng.nextUint32('orders')).toBe(1423811139)
    expect(independentRng.nextUint32('orders')).toBe(1423811139)
    expect(rng.nextUint32('artists')).toBe(3455824396)
    expect(rng.nextUint32('orders')).toBe(1685466954)
    expect(rng.nextUint32('artists')).toBe(1628201228)
  })

  it('normalizes negative zero and snapshots mutable caller configuration', () => {
    const mutableConfig = {
      ...config,
      playerIds: [...config.playerIds],
    }
    const configSnapshot = structuredClone(mutableConfig)
    const rng = createSetupRng(mutableConfig)

    expect(mutableConfig).toEqual(configSnapshot)
    expect(Object.isFrozen(mutableConfig)).toBe(false)
    expect(Object.isFrozen(mutableConfig.playerIds)).toBe(false)
    mutableConfig.playerIds[0] = 'changed-after-creation'

    expect(rng.nextUint32('orders')).toBe(1423811139)
    expect(mutableConfig).not.toEqual(configSnapshot)
  })

  it.each([NaN, Infinity, -Infinity, 1.5, 9007199254740992])(
    'rejects invalid seed %s',
    seed => {
      expect(() => createSetupRng({ ...config, seed })).toThrow('Seed must be a safe integer')
    },
  )

  it('rejects empty stages and invalid selection sizes', () => {
    const rng = createSetupRng(config)

    expect(() => rng.nextUint32('')).toThrow('Stage ID must be a non-empty string')
    expect(() => rng.chooseIndex('', 1)).toThrow('Stage ID must be a non-empty string')
    expect(() => rng.shuffle('', [])).toThrow('Stage ID must be a non-empty string')
    for (const itemCount of [0, -1, 1.5, NaN, Infinity, 2 ** 32 + 1]) {
      expect(() => rng.chooseIndex('orders', itemCount)).toThrow(
        'Item count must be an integer from 1 to 2^32',
      )
    }
  })

  it('accepts the inclusive selection-size boundaries', () => {
    const rng = createSetupRng(config)
    const maxSizeRng = createSetupRng(config)
    const directRng = createSetupRng(config)

    expect(rng.chooseIndex('single-choice', 1)).toBe(0)
    expect(maxSizeRng.chooseIndex('full-uint32', 2 ** 32)).toBe(
      directRng.nextUint32('full-uint32'),
    )
  })

  it('uses rejection sampling and consumes rejected values from the stage counter', () => {
    const rng = createSetupRng(config)

    expect(rng.chooseIndex('rejection-4', 2 ** 31 + 1)).toBe(508397661)
    expect(rng.nextUint32('rejection-4')).toBe(1755801826)
  })

  it('shuffles without mutating or freezing the input and freezes a new result', () => {
    const input = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }]
    const inputSnapshot = structuredClone(input)
    const result = createSetupRng(config).shuffle('orders', input)

    expect(result).not.toBe(input)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(input)).toBe(false)
    expect(input.every(item => !Object.isFrozen(item))).toBe(true)
    expect(input).toEqual(inputSnapshot)
    expect([...result].sort((left, right) => left.id.localeCompare(right.id))).toEqual(input)
    expect(result.every(item => input.includes(item))).toBe(true)
  })

  it('does not consume RNG for empty or singleton shuffles', () => {
    const emptyRng = createSetupRng(config)
    const singletonRng = createSetupRng(config)
    const emptyReferenceRng = createSetupRng(config)
    const singletonReferenceRng = createSetupRng(config)

    const emptyResult = emptyRng.shuffle('orders', [])
    const secondEmptyResult = emptyRng.shuffle('orders', [])
    const singleton = { id: 'only' }
    const singletonResult = singletonRng.shuffle('orders', [singleton])
    const secondSingletonResult = singletonRng.shuffle('orders', [singleton])

    expect(emptyResult).toEqual([])
    expect(emptyResult).not.toBe(secondEmptyResult)
    expect(Object.isFrozen(emptyResult)).toBe(true)
    expect(singletonResult).toEqual([singleton])
    expect(singletonResult).not.toBe(secondSingletonResult)
    expect(Object.isFrozen(singletonResult)).toBe(true)
    expect(Object.isFrozen(singleton)).toBe(false)
    expect(emptyRng.nextUint32('orders')).toBe(emptyReferenceRng.nextUint32('orders'))
    expect(singletonRng.nextUint32('orders')).toBe(singletonReferenceRng.nextUint32('orders'))
  })

  it('returns equal but independent shuffled results from independent RNG instances', () => {
    const input = ['A', 'B', 'C', 'D']
    const firstResult = createSetupRng(config).shuffle('orders', input)
    const secondResult = createSetupRng(config).shuffle('orders', input)

    expect(firstResult).toEqual(secondResult)
    expect(firstResult).not.toBe(secondResult)
  })
})
