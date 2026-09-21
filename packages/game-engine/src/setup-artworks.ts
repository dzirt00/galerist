import {
  deepFreeze,
  setupComponentCatalog,
  type ArtworkDefinition,
  type ArtworkGenre,
  type VisitorInstance,
} from './component-catalog.js'
import type { SetupRng } from './setup-rng.js'
import type { PreparedVisitorBag } from './setup-visitors.js'

/** Открытая работа одного жанра вместе с выложенными на неё посетителями. */
export interface OpenArtworkSlot {
  readonly artwork: ArtworkDefinition
  readonly visitors: readonly VisitorInstance[]
}

/** Результат подготовки четырёх стопок работ и расхода начального мешочка посетителей. */
export interface PreparedArtworkMarket {
  /** По одной верхней работе каждого жанра, отложенной для SETUP-009. */
  readonly deferredArtworksByGenre: Readonly<Record<ArtworkGenre, ArtworkDefinition>>
  /** Новая верхняя работа каждого жанра и посетители в количестве, напечатанном на ней. */
  readonly openArtworksByGenre: Readonly<Record<ArtworkGenre, OpenArtworkSlot>>
  /** Закрытые части стопок после удаления отложенной и открытой работ. */
  readonly remainingArtworksByGenre: Readonly<
    Record<ArtworkGenre, readonly ArtworkDefinition[]>
  >
  /** Остаток ранее перемешанного мешочка после заполнения четырёх открытых работ. */
  readonly remainingVisitorBag: PreparedVisitorBag
}

interface SelectedArtworkStack {
  readonly deferred: ArtworkDefinition
  readonly open: ArtworkDefinition
  readonly remaining: readonly ArtworkDefinition[]
}

/** Сравнивает устойчивые ASCII-идентификаторы без зависимости от локали среды. */
function compareAsciiIds(left: ArtworkDefinition, right: ArtworkDefinition): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/** Создаёт независимую копию работы, которую можно безопасно заморозить в результате. */
function copyArtwork(artwork: ArtworkDefinition): ArtworkDefinition {
  return {
    id: artwork.id,
    genre: artwork.genre,
    fameGain: artwork.fameGain,
    ticketReward: artwork.ticketReward,
    visitorCount: artwork.visitorCount,
  }
}

/** Создаёт независимую копию посетителя, не замораживая объект входного мешочка. */
function copyVisitor(visitor: VisitorInstance): VisitorInstance {
  return { id: visitor.id, type: visitor.type }
}

/** Проверяет поля работы до первого обращения к состоянию RNG. */
function isValidArtwork(artwork: unknown): artwork is ArtworkDefinition {
  if (artwork === null || typeof artwork !== 'object') {
    return false
  }

  const candidate = artwork as Partial<ArtworkDefinition>
  return (
    typeof candidate.id === 'string'
    && candidate.id.length > 0
    && /^[\x00-\x7F]+$/.test(candidate.id)
    && setupComponentCatalog.genreOrder.includes(candidate.genre as ArtworkGenre)
    && (
      candidate.fameGain === 'X'
      || (Number.isInteger(candidate.fameGain) && (candidate.fameGain as number) >= 0)
    )
    && typeof candidate.ticketReward === 'string'
    && Number.isInteger(candidate.visitorCount)
    && (candidate.visitorCount as number) >= 0
  )
}

/** Проверяет поля посетителя, полученного из подготовленного мешочка. */
function isValidVisitor(visitor: unknown): visitor is VisitorInstance {
  if (visitor === null || typeof visitor !== 'object') {
    return false
  }

  const candidate = visitor as Partial<VisitorInstance>
  return (
    typeof candidate.id === 'string'
    && candidate.id.length > 0
    && /^[\x00-\x7F]+$/.test(candidate.id)
    && setupComponentCatalog.ticketColors.includes(candidate.type as VisitorInstance['type'])
  )
}

/**
 * Подготавливает рынок произведений по SETUP-006.
 *
 * Для каждого жанра в фиксированном порядке каталога функция сортирует входные
 * работы по ASCII ID и перемешивает отдельным потоком `artworks/<genre>`.
 * Первая работа перемешанной стопки откладывается для будущего аукциона, вторая
 * становится открытой, а остальные сохраняются как закрытая стопка жанра.
 *
 * Мешочек посетителей уже перемешан этапом `visitors`. Поэтому дополнительных
 * случайных выборов здесь нет: функция последовательно снимает посетителей с
 * начала мешочка в порядке жанров и кладёт на каждую открытую работу ровно её
 * `visitorCount`. Входные массивы и вложенные объекты не меняются и не
 * замораживаются; результат состоит из независимых копий и глубоко заморожен.
 */
export function prepareArtworkMarket(
  artworks: readonly ArtworkDefinition[],
  visitorsBag: PreparedVisitorBag,
  rng: SetupRng,
): PreparedArtworkMarket {
  if (!Array.isArray(artworks)) {
    throw new Error('Invalid artwork collection')
  }
  const artworkItems = artworks as readonly ArtworkDefinition[]
  if (artworkItems.some(artwork => !isValidArtwork(artwork))) {
    throw new Error('Invalid artwork collection')
  }
  if (new Set(artworkItems.map(artwork => artwork.id)).size !== artworkItems.length) {
    throw new Error('Artwork IDs must be unique')
  }
  if (
    visitorsBag === null
    || typeof visitorsBag !== 'object'
    || !Array.isArray(visitorsBag.visitors)
    || visitorsBag.visitors.some(visitor => !isValidVisitor(visitor))
  ) {
    throw new Error('Invalid visitor bag')
  }
  if (new Set(visitorsBag.visitors.map(visitor => visitor.id)).size !== visitorsBag.visitors.length) {
    throw new Error('Visitor IDs must be unique')
  }

  // Группировка хранит только ссылки для чтения. Сами работы и входной массив
  // не сортируются: для каждого жанра ниже создаётся отдельная копия массива.
  const artworksByGenre: Partial<Record<ArtworkGenre, ArtworkDefinition[]>> = {}
  for (const artwork of artworkItems) {
    const genreArtworks = artworksByGenre[artwork.genre] ?? []
    genreArtworks.push(artwork)
    artworksByGenre[artwork.genre] = genreArtworks
  }

  // Полноту всех четырёх стопок проверяем до первого shuffle. Поэтому ошибка
  // входа не расходует значения RNG и вызов можно безопасно повторить.
  for (const genre of setupComponentCatalog.genreOrder) {
    const genreArtworks = artworksByGenre[genre]
    if (!genreArtworks || genreArtworks.length < 2) {
      throw new Error(`At least two artworks are required for genre ${genre}`)
    }
  }

  // После полной проверки выбираем позиции во всех четырёх стопках.
  const selectedByGenre: Partial<Record<ArtworkGenre, SelectedArtworkStack>> = {}
  let requiredVisitorCount = 0
  for (const genre of setupComponentCatalog.genreOrder) {
    const genreArtworks = artworksByGenre[genre]!
    const sorted = [...genreArtworks].sort(compareAsciiIds)
    const shuffled = rng.shuffle(`artworks/${genre}`, sorted)
    const deferred = shuffled[0]!
    const open = shuffled[1]!

    selectedByGenre[genre] = {
      deferred,
      open,
      remaining: shuffled.slice(2),
    }
    requiredVisitorCount += open.visitorCount
  }

  // Расход посетителей начинается только после проверки общего количества.
  // Так функция никогда не возвращает частично заполненный рынок.
  if (visitorsBag.visitors.length < requiredVisitorCount) {
    throw new Error('Not enough visitors for open artworks')
  }

  const deferredArtworksByGenre = {} as Record<ArtworkGenre, ArtworkDefinition>
  const openArtworksByGenre = {} as Record<ArtworkGenre, OpenArtworkSlot>
  const remainingArtworksByGenre = {} as Record<ArtworkGenre, readonly ArtworkDefinition[]>
  let visitorOffset = 0

  // Результат собирается в том же фиксированном порядке жанров. Все сущности
  // копируются, поскольку последующий deepFreeze не должен заморозить вход.
  for (const genre of setupComponentCatalog.genreOrder) {
    const selected = selectedByGenre[genre]!
    const nextVisitorOffset = visitorOffset + selected.open.visitorCount

    deferredArtworksByGenre[genre] = copyArtwork(selected.deferred)
    openArtworksByGenre[genre] = {
      artwork: copyArtwork(selected.open),
      visitors: visitorsBag.visitors
        .slice(visitorOffset, nextVisitorOffset)
        .map(copyVisitor),
    }
    remainingArtworksByGenre[genre] = selected.remaining.map(copyArtwork)
    visitorOffset = nextVisitorOffset
  }

  return deepFreeze({
    deferredArtworksByGenre,
    openArtworksByGenre,
    remainingArtworksByGenre,
    remainingVisitorBag: {
      visitors: visitorsBag.visitors.slice(visitorOffset).map(copyVisitor),
    },
  })
}
