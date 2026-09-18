import { describe, expect, it, vi } from 'vitest'
import {
  createSetupRng,
  prepareMasterpieceAuction,
  type ArtworkDefinition,
  type SetupRng,
  type SetupRngConfig,
} from '../src/index.js'

const config: SetupRngConfig = {
  rulesVersion: 'galerist-rules-2026-09-15-v1',
  componentsVersion: 'components-transcription-2026-09-15-v4',
  seed: -7,
  playerIds: ['player-1', 'player-2', 'player-3'],
}

const inputArtworks = (): ArtworkDefinition[] => [
  { id: 'WORK-S-09', genre: 'S', fameGain: 'X', ticketReward: 'B+R+W', visitorCount: 3 },
  { id: 'WORK-D-01', genre: 'D', fameGain: 0, ticketReward: 'R', visitorCount: 1 },
  { id: 'WORK-A-01', genre: 'A', fameGain: 1, ticketReward: 'R+(B/W)', visitorCount: 2 },
  { id: 'WORK-P-01', genre: 'P', fameGain: 1, ticketReward: 'DIFF2', visitorCount: 2 },
]

const compareAsciiIds = (left: ArtworkDefinition, right: ArtworkDefinition): number =>
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0

function replaceFirst(value: unknown): ArtworkDefinition[] {
  const input = inputArtworks()
  input[0] = value as ArtworkDefinition
  return input
}

function expectRejectedWithoutRng(input: unknown, playerCount: unknown, message: string): void {
  const snapshot = structuredClone(input)
  const shuffle = vi.fn()
  const rng = { shuffle } as unknown as SetupRng

  expect(() => prepareMasterpieceAuction(
    input as ArtworkDefinition[],
    playerCount as 2 | 3 | 4,
    rng,
  )).toThrow(message)
  expect(shuffle).not.toHaveBeenCalled()
  expect(input).toEqual(snapshot)
  if (Array.isArray(input)) {
    expect(Object.isFrozen(input)).toBe(false)
    expect(input.filter(item => item !== null && typeof item === 'object').every(item => !Object.isFrozen(item))).toBe(true)
  }
}

describe('prepareMasterpieceAuction', () => {
  it.each([2, 3, 4] as const)(
    'детерминированно выставляет %i игрокам нужное число полных уникальных работ',
    playerCount => {
      const input = inputArtworks()
      const sorted = [...input].sort(compareAsciiIds)
      const expected = createSetupRng(config).shuffle('auction-artworks', sorted)
        .slice(0, playerCount - 1)
      const rng = createSetupRng(config)
      const shuffle = vi.fn(rng.shuffle)
      const result = prepareMasterpieceAuction(input, playerCount, { ...rng, shuffle })

      expect(shuffle).toHaveBeenCalledTimes(1)
      expect(shuffle).toHaveBeenCalledWith('auction-artworks', sorted)
      expect(result.artworks).toEqual(expected)
      expect(result.artworks).toHaveLength(playerCount - 1)
      expect(new Set(result.artworks.map(artwork => artwork.id)).size).toBe(playerCount - 1)
      expect(result.artworks.every(artwork => input.some(source => source.id === artwork.id))).toBe(true)
      expect(result.artworks.map(artwork => [
        artwork.id, artwork.genre, artwork.fameGain, artwork.ticketReward, artwork.visitorCount,
      ])).toEqual(expected.map(artwork => [
        artwork.id, artwork.genre, artwork.fameGain, artwork.ticketReward, artwork.visitorCount,
      ]))
    },
  )

  it('не зависит от порядка входа и не изменяет либо не замораживает его', () => {
    const input = inputArtworks()
    const snapshot = structuredClone(input)
    const forward = prepareMasterpieceAuction(input, 4, createSetupRng(config))
    const reversed = prepareMasterpieceAuction([...input].reverse(), 4, createSetupRng(config))

    expect(forward).toEqual(reversed)
    expect(input).toEqual(snapshot)
    expect(Object.isFrozen(input)).toBe(false)
    expect(input.every(artwork => !Object.isFrozen(artwork))).toBe(true)
  })

  it('глубоко замораживает новые объекты и возвращает независимые повторные результаты', () => {
    const input = inputArtworks()
    const first = prepareMasterpieceAuction(input, 4, createSetupRng(config))
    const second = prepareMasterpieceAuction(input, 4, createSetupRng(config))

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.artworks).not.toBe(second.artworks)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.artworks)).toBe(true)
    expect(first.artworks.every(Object.isFrozen)).toBe(true)
    for (const artwork of first.artworks) {
      expect(input.every(source => source !== artwork)).toBe(true)
      expect(second.artworks.find(other => other.id === artwork.id)).not.toBe(artwork)
    }
  })

  it.each([0, 1, 1.5, 5, NaN, Infinity, -Infinity, '3', null])(
    'отклоняет недопустимое число игроков %s до обращения к RNG',
    playerCount => expectRejectedWithoutRng(
      inputArtworks(), playerCount, 'Player count must be 2, 3, or 4',
    ),
  )

  it.each([0, 1, 2, 3, 5])(
    'отклоняет набор из %i работ до обращения к RNG',
    count => expectRejectedWithoutRng(
      [...inputArtworks(), { ...inputArtworks()[0]!, id: 'WORK-D-02' }].slice(0, count),
      3,
      'Exactly four deferred artworks are required',
    ),
  )

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty ID', { ...inputArtworks()[0], id: '' }],
    ['non-ASCII ID', { ...inputArtworks()[0], id: 'WORK-é' }],
    ['non-string ID', { ...inputArtworks()[0], id: 1 }],
    ['unknown genre', { ...inputArtworks()[0], genre: 'Z' }],
    ['negative fame', { ...inputArtworks()[0], fameGain: -1 }],
    ['fractional fame', { ...inputArtworks()[0], fameGain: 1.5 }],
    ['NaN fame', { ...inputArtworks()[0], fameGain: NaN }],
    ['invalid fame', { ...inputArtworks()[0], fameGain: null }],
    ['non-string ticket reward', { ...inputArtworks()[0], ticketReward: 1 }],
    ['negative visitors', { ...inputArtworks()[0], visitorCount: -1 }],
    ['fractional visitors', { ...inputArtworks()[0], visitorCount: 1.5 }],
    ['NaN visitors', { ...inputArtworks()[0], visitorCount: NaN }],
    ['invalid visitors', { ...inputArtworks()[0], visitorCount: null }],
  ])('отклоняет повреждённую работу: %s', (_description, value) => {
    expectRejectedWithoutRng(replaceFirst(value), 3, 'Invalid deferred artwork')
  })

  it('отклоняет повторяющиеся ID до обращения к RNG', () => {
    const input = inputArtworks()
    input[1] = { ...input[1]!, id: input[0]!.id }
    expectRejectedWithoutRng(input, 3, 'Deferred artworks must have unique IDs')
  })

  it('отклоняет повторяющийся жанр и отсутствие одного жанра до обращения к RNG', () => {
    const input = inputArtworks()
    input[1] = { ...input[1]!, genre: 'S' }
    expectRejectedWithoutRng(
      input, 3, 'Deferred artworks must contain exactly one artwork per genre',
    )
  })
})
