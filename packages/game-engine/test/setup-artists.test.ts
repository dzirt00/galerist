import { describe, expect, it } from 'vitest'
import {
  createSetupRng,
  prepareArtistMarket,
  prepareArtistSetup,
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

describe('Подготовка бонусов, коллекционеров и подписей художников', () => {
  const inputMarket = () => prepareArtistMarket(
    setupComponentCatalog.artists.map(artist => ({ ...artist })),
    createSetupRng(config),
  )
  const inputVisitors = () =>
    setupComponentCatalog.visitorInstancesByPlayerCount[2].map(visitor => ({ ...visitor }))
  const inputBonuses = () => setupComponentCatalog.artistBonuses.map(bonus => ({ ...bonus }))

  it('раздаёт бонусы закрытым художникам, коллекционеров красным и по две подписи каждому', () => {
    const result = prepareArtistSetup(
      inputMarket(),
      inputVisitors(),
      inputBonuses(),
      createSetupRng(config),
    )
    const slots = result.slots
    const closedSlots = slots.filter(slot => !slot.isOpen)
    const redSlots = slots.filter(slot => slot.category === 'red')
    const signatureIds = slots.flatMap(slot => slot.signatureIds)

    expect(slots).toHaveLength(8)
    expect(slots.filter(slot => slot.isOpen).map(slot => slot.bonus)).toEqual([null])
    expect(closedSlots.every(slot => slot.bonus !== null)).toBe(true)
    expect(new Set(closedSlots.map(slot => slot.bonus!.id)).size).toBe(7)
    expect(result.unusedBonuses).toHaveLength(3)
    expect(redSlots).toHaveLength(4)
    expect(redSlots.every(slot => slot.collector?.type === 'W')).toBe(true)
    expect(new Set(redSlots.map(slot => slot.collector!.id)).size).toBe(4)
    expect(signatureIds).toHaveLength(16)
    expect(new Set(signatureIds).size).toBe(16)
    expect(result.remainingVisitors).toHaveLength(inputVisitors().length - 4)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(slots)).toBe(true)
    expect(slots.every(Object.isFrozen)).toBe(true)
  })

  it('не зависит от порядка бонусов и посетителей и не изменяет либо не замораживает входы', () => {
    const market = inputMarket()
    const visitors = inputVisitors()
    const bonuses = inputBonuses()
    const marketSnapshot = structuredClone(market)
    const visitorsSnapshot = structuredClone(visitors)
    const bonusesSnapshot = structuredClone(bonuses)

    const forward = prepareArtistSetup(
      market,
      visitors,
      bonuses,
      createSetupRng(config),
    )
    const reversed = prepareArtistSetup(
      inputMarket(),
      [...inputVisitors()].reverse(),
      [...inputBonuses()].reverse(),
      createSetupRng(config),
    )

    expect(forward).toEqual(reversed)
    expect(market).toEqual(marketSnapshot)
    expect(visitors).toEqual(visitorsSnapshot)
    expect(bonuses).toEqual(bonusesSnapshot)
    expect(visitors.every(visitor => !Object.isFrozen(visitor))).toBe(true)
    expect(bonuses.every(bonus => !Object.isFrozen(bonus))).toBe(true)
  })

  it('отклоняет рынок без восьми уникальных пар жанра и категории', () => {
    const market = inputMarket()
    const malformedMarket = {
      ...market,
      slots: market.slots.map((slot, index) => index === 1
        ? { ...slot, genre: market.slots[0]!.genre, category: market.slots[0]!.category }
        : { ...slot }),
    }

    expect(() => prepareArtistSetup(
      malformedMarket,
      inputVisitors(),
      inputBonuses(),
      createSetupRng(config),
    )).toThrow()
  })

  it('отклоняет повторяющиеся компоненты и нехватку коллекционеров', () => {
    const bonuses = inputBonuses()
    const duplicateBonuses = [...bonuses.slice(0, -1), { ...bonuses[0]! }]
    const visitors = inputVisitors()
    const duplicateVisitors = visitors.map((visitor, index) => index === 1
      ? { ...visitor, id: visitors[0]!.id }
      : visitor)
    const insufficientCollectors = visitors.filter(visitor => visitor.type !== 'W')
      .concat(visitors.filter(visitor => visitor.type === 'W').slice(0, 3))

    expect(() => prepareArtistSetup(
      inputMarket(), duplicateVisitors, inputBonuses(), createSetupRng(config),
    )).toThrow()
    expect(() => prepareArtistSetup(
      inputMarket(), inputVisitors(), duplicateBonuses, createSetupRng(config),
    )).toThrow()
    expect(() => prepareArtistSetup(
      inputMarket(), insufficientCollectors, inputBonuses(), createSetupRng(config),
    )).toThrow()
  })
})
