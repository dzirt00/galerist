import type { ArtistCategory, ArtworkGenre } from "./component-catalog.js";
import type { SetupRng } from "./setup-rng.js";
import  {type ArtistDefinition, setupComponentCatalog} from "./component-catalog.js"
export interface PreparedArtistSlot {
  readonly artistId: string
  readonly genre: ArtworkGenre
  readonly category: ArtistCategory
  readonly isOpen: boolean
}

export interface PreparedArtistMarket {
  readonly slots: readonly PreparedArtistSlot[]
  readonly unselectedArtistIds: readonly string[]
}

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
