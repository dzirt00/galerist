import { createHash } from 'node:crypto'

export interface SetupRngConfig {
  readonly rulesVersion: string
  readonly componentsVersion: string
  readonly seed: number
  readonly playerIds: readonly string[]
}

export interface SetupRng {
  nextUint32(stageId: string): number
  chooseIndex(stageId: string, itemCount: number): number
  shuffle<T>(stageId: string, items: readonly T[]): readonly T[]
}

const UINT32_RANGE = 2 ** 32

function assertStageId(stageId: string): void {
  if (typeof stageId !== 'string' || stageId.length === 0) {
    throw new Error('Stage ID must be a non-empty string')
  }
}

function assertItemCount(itemCount: number): void {
  if (!Number.isInteger(itemCount) || itemCount < 1 || itemCount > UINT32_RANGE) {
    throw new Error('Item count must be an integer from 1 to 2^32')
  }
}

export function createSetupRng(config: SetupRngConfig): SetupRng {
  if (!Number.isSafeInteger(config.seed)) {
    throw new Error('Seed must be a safe integer')
  }

  const playerIds = Object.freeze([...config.playerIds])
  const seedString = Object.is(config.seed, -0) ? '0' : String(config.seed)
  const stageCounters = new Map<string, bigint>()

  function nextUint32(stageId: string): number {
    assertStageId(stageId)

    const counter = stageCounters.get(stageId) ?? 0n
    const payload = JSON.stringify([
      'setup-rng-v1',
      config.rulesVersion,
      config.componentsVersion,
      seedString,
      playerIds,
      stageId,
      counter.toString(),
    ])
    const digest = createHash('sha256').update(payload, 'utf8').digest()

    stageCounters.set(stageId, counter + 1n)
    return (
      digest[0]! * 2 ** 24
      + digest[1]! * 2 ** 16
      + digest[2]! * 2 ** 8
      + digest[3]!
    )
  }

  function chooseIndex(stageId: string, itemCount: number): number {
    assertStageId(stageId)
    assertItemCount(itemCount)

    const limit = Math.floor(UINT32_RANGE / itemCount) * itemCount
    let value: number
    do {
      value = nextUint32(stageId)
    } while (value >= limit)

    return value % itemCount
  }

  function shuffle<T>(stageId: string, items: readonly T[]): readonly T[] {
    assertStageId(stageId)

    const shuffled = [...items]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = chooseIndex(stageId, index + 1)
      const current = shuffled[index]!
      shuffled[index] = shuffled[swapIndex]!
      shuffled[swapIndex] = current
    }

    return Object.freeze(shuffled)
  }

  return Object.freeze({ nextUint32, chooseIndex, shuffle })
}
