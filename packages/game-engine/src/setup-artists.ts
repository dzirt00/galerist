import { type ArtistBonusDefinition, type ArtistCategory, type ArtworkGenre, deepFreeze, type VisitorInstance, type VisitorType } from "./component-catalog.js";
import type { SetupRng } from "./setup-rng.js";
import  {type ArtistDefinition,setupComponentCatalog} from "./component-catalog.js"
/** Клетка выбранного художника до размещения компонентов SETUP-005. */
export interface PreparedArtistSlot {
  readonly artistId: string
  readonly genre: ArtworkGenre
  readonly category: ArtistCategory
  readonly isOpen: boolean
}

/** Результат выбора восьми художников для текущей партии. */
export interface PreparedArtistMarket {
  readonly slots: readonly PreparedArtistSlot[]
  readonly unselectedArtistIds: readonly string[]
}

/** Полностью подготовленная клетка художника с бонусом, подписями и коллекционером. */
export interface PreparedArtistSetupSlot {
  readonly artistId: string
  readonly genre: ArtworkGenre
  readonly category: ArtistCategory
  readonly isOpen: boolean
  readonly signatureIds: readonly [string, string]
  readonly bonus: ArtistBonusDefinition | null
  readonly collector: VisitorInstance | null
}
/** Результат SETUP-005 вместе с оставшимися доступными компонентами. */
export interface PreparedArtistSetup {
  readonly slots: readonly PreparedArtistSetupSlot[]
  readonly remainingVisitors: readonly VisitorInstance[]
  readonly unusedBonuses: readonly ArtistBonusDefinition[]
}
const TYPE_VISITOR: VisitorType = 'W'

/** Выбирает художников для восьми пар жанра и категории и открывает первого синего. */
export function prepareArtistMarket(
  artists: readonly ArtistDefinition[],
  rng: SetupRng,
): PreparedArtistMarket {
  const sortedArtists = [...artists].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shuffledArtists = rng.shuffle('artists', sortedArtists);
  const selectedByPair = new Map<string, ArtistDefinition>();
  const selectedInOrder: ArtistDefinition[] = [];

  for (const artist of shuffledArtists) {
    const pairKey = `${artist.genre}-${artist.category}`;

    if (selectedByPair.size < 8 && !selectedByPair.has(pairKey)) {
      selectedByPair.set(pairKey, artist);
      selectedInOrder.push(artist);
    }
  }

  const firstBlueArtist = selectedInOrder.find(artist => artist.category === 'blue');

  const slots: PreparedArtistSlot[] = [];
  for (const genre of setupComponentCatalog.genreOrder) {
    for (const category of setupComponentCatalog.categoryOrder) {
      const pairKey = `${genre}-${category}`;
      const artist = selectedByPair.get(pairKey)!;

      const slot: PreparedArtistSlot = {
        artistId: artist.id,
        genre: artist.genre,
        category: artist.category,
        isOpen: artist === firstBlueArtist,
      };

      Object.freeze(slot);
      slots.push(slot);
    }
  }

  const unselectedArtistIds = shuffledArtists
    .filter(artist => !selectedInOrder.includes(artist))
    .map(artist => artist.id);

  Object.freeze(slots);
  Object.freeze(unselectedArtistIds);

  const result: PreparedArtistMarket = {
    slots,
    unselectedArtistIds,
  };

  return Object.freeze(result);
}

/**
 * Размещает бонусы, подписи и коллекционеров у выбранных художников.
 * Входные данные не изменяются, а возвращаемое дерево глубоко заморожено.
 */
export function prepareArtistSetup(
  artistMarket: PreparedArtistMarket,
  visitors: readonly VisitorInstance[],
  artistBonuses: readonly ArtistBonusDefinition[],
  rng: SetupRng,
): PreparedArtistSetup {

  const openSlots = artistMarket.slots.filter(slot => slot.isOpen)
  const closedSlots = artistMarket.slots.filter(slot => !slot.isOpen)
  const redSlots = artistMarket.slots.filter(slot => slot.category === 'red')
  const pairs = new Set(artistMarket.slots.map(slot => `${slot.genre}-${slot.category}`))
  const artistIds = new Set(artistMarket.slots.map(slot => slot.artistId))
  const expectedPairs = new Set(
    setupComponentCatalog.genreOrder.flatMap(genre =>
      setupComponentCatalog.categoryOrder.map(category => `${genre}-${category}`),
    ),
  )

  if(openSlots.length !== 1
    || closedSlots.length !== 7
    || pairs.size !== expectedPairs.size
    || [...expectedPairs].some(pair => !pairs.has(pair))
    || artistIds.size !== artistMarket.slots.length
  ) {
    throw new Error('Invalid artwork collection')
  }

  if(artistBonuses.length < closedSlots.length
    || new Set(artistBonuses.map(bonus => bonus.id)).size !== artistBonuses.length
  ) {
    throw new Error('Invalid artistBonuses')
  }

  if(new Set(visitors.map(visitor => visitor.id)).size !== visitors.length) {
    throw new Error('Invalid visitors')
  }
  const collectors = visitors.filter(visitor => visitor.type === TYPE_VISITOR)
  if(collectors.length < redSlots.length) {
    throw new Error('Invalid visitors')
  }

  // Канонический порядок делает результат независимым от порядка каталога.
  const sortedBonuses = artistBonuses
    .map(bonus => ({ ...bonus }))
    .sort((a,b) => {
    if ( a.id > b.id ) return 1;
    if ( a.id < b.id ) return -1;
    return 0;
  })
  const remainingVisitors = visitors
    .map(visitor => ({ ...visitor }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const shuffledBonuses = [...rng.shuffle('artist-bonuses', sortedBonuses)]
  // Фиксированный порядок клеток задаёт порядок раздачи бонусов и коллекционеров.
  const slots = artistMarket.slots.map(artistSlot => {
    const bonusElement = artistSlot.isOpen ? null : shuffledBonuses.shift()!
    const index = remainingVisitors.findIndex(visitor => visitor.type === TYPE_VISITOR)
    const isRed = artistSlot.category === 'red'
    const [collector] = isRed ? remainingVisitors.splice(index, 1) : []

    const preparedSlot: PreparedArtistSetupSlot = {
      artistId: artistSlot.artistId,
      genre: artistSlot.genre,
      category: artistSlot.category,
      isOpen: artistSlot.isOpen,
      signatureIds: [`${artistSlot.artistId}-SIG-1`, `${artistSlot.artistId}-SIG-2`],
      bonus: bonusElement,
      collector: collector ?? null,
    }

    return preparedSlot
  })

  return deepFreeze({
    slots,
    remainingVisitors,
    unusedBonuses: shuffledBonuses,
  })
}
