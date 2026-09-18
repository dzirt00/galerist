import { describe, expect, it } from 'vitest'
import {
  createSetupRng,
  prepareArtistMarket,
  setupComponentCatalog,
  type ArtistDefinition,
  type SetupRngConfig,
} from '../src/index.js'

const config: SetupRngConfig = {
  rulesVersion: 'galerist-rules-2026-09-15-v1',
  componentsVersion: 'components-transcription-2026-09-15-v4',
  seed: 29,
  playerIds: ['player-1', 'player-2', 'player-3'],
}

/** Выбирает ожидаемых художников из входного каталога для проверки рынка. */
function selectArtists(artists: readonly ArtistDefinition[]): readonly ArtistDefinition[] {
  const selectedByPair = new Map<string, ArtistDefinition>()

  for (const artist of artists) {
    const pair = `${artist.genre}-${artist.category}`
    if (!selectedByPair.has(pair)) {
      selectedByPair.set(pair, artist)
    }
  }

  return [...selectedByPair.values()]
}

describe('Подготовка рынка художников через prepareArtistMarket', () => {
  it('детерминированно заполняет восемь пар и открывает первого выбранного синего художника', () => {
    const input = setupComponentCatalog.artists.map(artist => ({ ...artist }))
    const shuffled = createSetupRng(config).shuffle(
      'artists',
      [...input].sort((left, right) => left.id.localeCompare(right.id)),
    )
    const selected = selectArtists(shuffled)
    const result = prepareArtistMarket(input, createSetupRng(config))

    expect(result.slots.map(slot => [slot.genre, slot.category, slot.artistId])).toEqual([
      ['D', 'blue', expect.any(String)], ['D', 'red', expect.any(String)],
      ['P', 'blue', expect.any(String)], ['P', 'red', expect.any(String)],
      ['S', 'blue', expect.any(String)], ['S', 'red', expect.any(String)],
      ['A', 'blue', expect.any(String)], ['A', 'red', expect.any(String)],
    ])
    expect(result.slots.map(slot => slot.artistId)).toEqual([
      ...setupComponentCatalog.genreOrder.flatMap(genre =>
        setupComponentCatalog.categoryOrder.map(category =>
          selected.find(artist => artist.genre === genre && artist.category === category)!.id,
        ),
      ),
    ])
    expect(result.slots.filter(slot => slot.isOpen)).toEqual([
      expect.objectContaining({
        artistId: selected.find(artist => artist.category === 'blue')!.id,
        category: 'blue',
        isOpen: true,
      }),
    ])
    expect(result.unselectedArtistIds).toEqual(
      shuffled.filter(artist => !selected.includes(artist)).map(artist => artist.id),
    )
  })

  it('не зависит от порядка входного каталога и не теряет либо не дублирует художников', () => {
    const input = setupComponentCatalog.artists.map(artist => ({ ...artist }))
    const forward = prepareArtistMarket(input, createSetupRng(config))
    const reversed = prepareArtistMarket([...input].reverse(), createSetupRng(config))
    const allIds = [...forward.slots.map(slot => slot.artistId), ...forward.unselectedArtistIds]

    expect(forward).toEqual(reversed)
    expect(forward.slots).toHaveLength(8)
    expect(forward.unselectedArtistIds).toHaveLength(8)
    expect(new Set(allIds).size).toBe(16)
    expect([...allIds].sort()).toEqual([...input.map(artist => artist.id)].sort())
  })

  it('не изменяет и не замораживает вход, а глубоко замораживает результат', () => {
    const input = setupComponentCatalog.artists.map(artist => ({ ...artist }))
    const snapshot = structuredClone(input)
    const result = prepareArtistMarket(input, createSetupRng(config))

    expect(input).toEqual(snapshot)
    expect(Object.isFrozen(input)).toBe(false)
    expect(input.every(artist => !Object.isFrozen(artist))).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.slots)).toBe(true)
    expect(result.slots.every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(result.unselectedArtistIds)).toBe(true)
  })

  it('возвращает равные, но независимые результаты для одинаковых независимых RNG', () => {
    const input = setupComponentCatalog.artists.map(artist => ({ ...artist }))
    const first = prepareArtistMarket(input, createSetupRng(config))
    const second = prepareArtistMarket(input, createSetupRng(config))

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.slots).not.toBe(second.slots)
    expect(first.unselectedArtistIds).not.toBe(second.unselectedArtistIds)
    expect(first.slots[0]).not.toBe(second.slots[0])
  })
})
