import { describe, expect, it } from 'vitest'
import {
  applyAdditionalFameSpend,
  type ApplyAdditionalFameSpendInput,
  type ArtistFameState,
  type PlayerState,
} from '../src/index.js'

/** Создаёт игрока с заданным влиянием для теста. */
function createPlayer(influence: number): PlayerState {
  return {
    id: 'player-1',
    name: 'Алина',
    kind: 'human',
    coins: 7,
    influence,
    ticketsByColor: { B: 0, R: 0, W: 0 },
  }
}

/** Создаёт художника с заданной славой для теста. */
function createArtist(fame: number): ArtistFameState {
  return { artistId: 'artist-1', fame }
}

/** Собирает допустимые входные данные для траты влияния на славу. */
function createEligibleInput(
  influence: number,
  targetInfluence: number,
  fame: number,
  baseFameGain = 1,
): ApplyAdditionalFameSpendInput {
  return {
    player: createPlayer(influence),
    artist: createArtist(fame),
    targetInfluence,
    fameIncrease: {
      kind: 'eligible',
      source: 'artwork_purchase',
      baseFameGain,
    },
  }
}

describe('Начисление славы за влияние через applyAdditionalFameSpend', () => {
  it.each([
    [10, 5, 7, 8],
    [10, 0, 7, 9],
    [1, 0, 7, 8],
  ] as const)(
    'списывает влияние с %i до %i и прибавляет дополнительную известность',
    (influence, targetInfluence, fame, expectedFame) => {
      const result = applyAdditionalFameSpend(
        createEligibleInput(influence, targetInfluence, fame),
      )

      expect(result.player).toEqual(createPlayer(targetInfluence))
      expect(result.artist).toEqual(createArtist(expectedFame))
    },
  )

  it('не применяет базовый рост, не меняет и не замораживает входы, а возвращает новые замороженные результаты', () => {
    const input = createEligibleInput(10, 0, 7, 3)
    const snapshot = structuredClone(input)

    const firstResult = applyAdditionalFameSpend(input)
    const secondResult = applyAdditionalFameSpend(input)

    expect(firstResult.artist.fame).toBe(9)
    expect(input).toEqual(snapshot)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(input.player)).toBe(false)
    expect(Object.isFrozen(input.artist)).toBe(false)
    expect(Object.isFrozen(input.fameIncrease)).toBe(false)
    expect(Object.isFrozen(firstResult)).toBe(true)
    expect(Object.isFrozen(firstResult.player)).toBe(true)
    expect(Object.isFrozen(firstResult.artist)).toBe(true)
    expect(firstResult).not.toBe(secondResult)
    expect(firstResult.player).not.toBe(input.player)
    expect(firstResult.artist).not.toBe(input.artist)
    expect(firstResult.player).not.toBe(secondResult.player)
    expect(firstResult.artist).not.toBe(secondResult.artist)
    expect(firstResult).toEqual(secondResult)
  })

  it('отклоняет расход для работы X, не меняя и не замораживая входы', () => {
    const input: ApplyAdditionalFameSpendInput = {
      ...createEligibleInput(10, 5, 7),
      fameIncrease: {
        kind: 'blocked_by_artwork_x',
        source: 'artwork_purchase',
      },
    }
    const snapshot = structuredClone(input)

    expect(() => applyAdditionalFameSpend(input)).toThrow(
      'Spending is blocked by artwork X',
    )
    expect(input).toEqual(snapshot)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(input.player)).toBe(false)
    expect(Object.isFrozen(input.artist)).toBe(false)
    expect(Object.isFrozen(input.fameIncrease)).toBe(false)
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', Symbol('1')] as const)(
    'отклоняет невалидный baseFameGain без изменения входа',
    (baseFameGain) => {
      const input = createEligibleInput(10, 5, 7, baseFameGain as number)
      const snapshot = {
        ...input,
        player: { ...input.player },
        artist: { ...input.artist },
        fameIncrease: { ...input.fameIncrease },
      }

      expect(() => applyAdditionalFameSpend(input)).toThrow(RangeError)
      expect(input).toEqual(snapshot)
      expect(Object.isFrozen(input)).toBe(false)
      expect(Object.isFrozen(input.player)).toBe(false)
      expect(Object.isFrozen(input.artist)).toBe(false)
      expect(Object.isFrozen(input.fameIncrease)).toBe(false)
    },
  )

  it('пробрасывает невалидную цель влияния, не меняя и не замораживая входы', () => {
    const input = createEligibleInput(10, 7, 7)
    const snapshot = structuredClone(input)

    expect(() => applyAdditionalFameSpend(input)).toThrow('Invalid influence spend')
    expect(input).toEqual(snapshot)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(input.player)).toBe(false)
    expect(Object.isFrozen(input.artist)).toBe(false)
    expect(Object.isFrozen(input.fameIncrease)).toBe(false)
  })
})
