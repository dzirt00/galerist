export type ArtworkGenre = 'D' | 'P' | 'S' | 'A'
export type ArtistCategory = 'blue' | 'red'
export type SetupTicketColor = 'B' | 'R' | 'W'
export type VisitorType = SetupTicketColor
export type MarketColumn = 1 | 2 | 3
export type RewardId = 'COINS' | 'INFLUENCE' | 'FAME-C' | 'VISITOR-ANY' | 'VISITOR-BR' | 'VISITOR-BAG' | 'HIRE-FREE' | 'ORDER-ACTION' | 'TICKET-ANY' | 'TICKET-DIFF2' | 'TICKET-B' | 'TICKET-R'
export type StartingLocationId =
  | 'LOC-ARTISTS_COLONY'
  | 'LOC-MEDIA_CENTER'
  | 'LOC-INTERNATIONAL_MARKET'
  | 'LOC-SALES_OFFICE'

export interface VisitorInstance {
  readonly id: string
  readonly type: VisitorType
}

export interface SetupComponentCatalog {
  readonly version: string
  readonly genreOrder: readonly ArtworkGenre[]
  readonly categoryOrder: readonly ArtistCategory[]
  readonly ticketColors: readonly SetupTicketColor[]
  readonly artists: readonly { readonly id: string; readonly genre: ArtworkGenre; readonly category: ArtistCategory; readonly initialFame: number; readonly initialPromotion: number }[]
  readonly artworks: readonly { readonly id: string; readonly genre: ArtworkGenre; readonly fameGain: number | 'X'; readonly ticketReward: string; readonly visitorCount: number }[]
  readonly artistBonuses: readonly { readonly id: string; readonly reward: RewardId }[]
  readonly orders: readonly { readonly id: string; readonly genre: ArtworkGenre; readonly reward: RewardId }[]
  readonly curatorGoals: readonly string[]
  readonly dealerGoals: readonly string[]
  readonly reputationTokenIds: readonly string[]
  readonly visitorPools: Readonly<Record<2 | 3 | 4, Readonly<Record<VisitorType, number>>>>
  readonly ticketsPerColor: Readonly<Record<2 | 3 | 4, number>>
  readonly auctionEasels: Readonly<Record<2 | 3 | 4, number>>
  readonly marketBidCells: readonly { readonly id: string; readonly column: MarketColumn; readonly bid: 1 | 3 | 6; readonly reward: RewardId }[]
  readonly marketReputationCells: readonly { readonly id: string; readonly column: MarketColumn; readonly genre: ArtworkGenre; readonly playerCounts: readonly (2 | 3 | 4)[] }[]
  readonly marketReputationPlacementOrder: readonly string[]
  readonly hireQueue: readonly { readonly id: string; readonly position: number; readonly cost: number; readonly reward: RewardId | null }[]
  readonly boardReputationCells: readonly { readonly id: string; readonly row: 1 | 2 | 3; readonly side: 'L' | 'R'; readonly reward: RewardId }[]
  readonly boardOrderCells: readonly { readonly id: string; readonly position: 1 | 2 | 3; readonly reward: RewardId }[]
  readonly assistantsPerPlayer: { readonly office: 2; readonly hireQueue: 8 }
  readonly promotionTokens: readonly { readonly id: string; readonly level: 1 | 2 | 3 | 4 | 5; readonly influenceCost: 1 | 2 | 3 | 4 | 5; readonly reward: RewardId }[]
  readonly superstarTokenIds: readonly string[]
  readonly componentsVersion: string
  readonly startingLocationOrder: readonly StartingLocationId[]
  readonly visitorInstancesByPlayerCount: Readonly<Record<2 | 3 | 4, readonly VisitorInstance[]>>
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

const APPROVED_COMPONENTS_VERSION = 'components-transcription-2026-09-15-v4'

const artistRows: readonly [ArtworkGenre, ArtistCategory, number, number][] = [
  ['D', 'blue', 1, 0], ['D', 'blue', 4, 1], ['D', 'red', 5, 2], ['D', 'red', 8, 3],
  ['P', 'blue', 1, 0], ['P', 'blue', 4, 1], ['P', 'red', 5, 2], ['P', 'red', 8, 3],
  ['S', 'blue', 3, 0], ['S', 'blue', 5, 1], ['S', 'red', 7, 2], ['S', 'red', 10, 3],
  ['A', 'blue', 3, 0], ['A', 'blue', 5, 1], ['A', 'red', 7, 2], ['A', 'red', 10, 3],
]

const artworkRows: Readonly<Record<ArtworkGenre, readonly [number | 'X', string, number][]>> = {
  S: [[0,'ANY',1],[1,'R+(B/W)',2],[0,'ANY',1],[3,'—',0],[1,'DIFF2',2],[2,'DIFF2',2],[0,'B',1],[1,'B+(R/W)',2],['X','B+R+W',3],[0,'R',1]],
  P: [[1,'DIFF2',2],[2,'DIFF2',2],[0,'R',1],[1,'B+(R/W)',2],[0,'ANY',1],[1,'R+(B/W)',2],[0,'ANY',1],[1,'R+(B/W)',2],['X','B+R+W',3],[3,'—',0],[0,'B',1]],
  D: [[0,'R',1],[2,'DIFF2',2],[0,'ANY',1],[1,'R+(B/W)',2],['X','B+R+W',3],[1,'B+(R/W)',2],[0,'ANY',1],[1,'DIFF2',2],[2,'DIFF2',2],[0,'B',1],[3,'—',0]],
  A: [[1,'R+(B/W)',2],[0,'ANY',1],[1,'B+(R/W)',2],[1,'R+(B/W)',2],[0,'R',1],[0,'B',1],[0,'ANY',1],['X','B+R+W',3],[2,'DIFF2',2],[1,'DIFF2',2],[3,'—',0],[2,'DIFF2',2]],
}

const orderRows: readonly [ArtworkGenre, RewardId][] = [
  ['D','INFLUENCE'],['P','ORDER-ACTION'],['P','COINS'],['A','ORDER-ACTION'],['A','VISITOR-BR'],['P','VISITOR-BAG'],['D','ORDER-ACTION'],['S','ORDER-ACTION'],['A','HIRE-FREE'],['A','COINS'],['D','HIRE-FREE'],['A','VISITOR-BAG'],['P','VISITOR-BR'],['S','VISITOR-BAG'],['S','VISITOR-BR'],['D','VISITOR-BAG'],['D','VISITOR-BR'],['P','HIRE-FREE'],['S','INFLUENCE'],['S','HIRE-FREE'],
]

function createVisitorInstances(playerCount: 2 | 3 | 4): VisitorInstance[] {
  const counts: Readonly<Record<2 | 3 | 4, Readonly<Record<VisitorType, number>>>> = {
    2: { B: 10, R: 10, W: 8 },
    3: { B: 12, R: 12, W: 10 },
    4: { B: 14, R: 14, W: 12 },
  }

  return (['B', 'R', 'W'] as const).flatMap(type =>
    Array.from({ length: counts[playerCount][type] }, (_, index) => ({
      id: `VIS-${type}-${String(index + 1).padStart(2, '0')}`,
      type,
    })),
  )
}

export const setupComponentCatalog: Readonly<SetupComponentCatalog> = deepFreeze({
  version: APPROVED_COMPONENTS_VERSION,
  componentsVersion: APPROVED_COMPONENTS_VERSION,
  startingLocationOrder: ['LOC-ARTISTS_COLONY', 'LOC-MEDIA_CENTER', 'LOC-INTERNATIONAL_MARKET', 'LOC-SALES_OFFICE', ],
  visitorInstancesByPlayerCount: { 2: createVisitorInstances(2), 3: createVisitorInstances(3), 4: createVisitorInstances(4) },
  genreOrder: ['D', 'P', 'S', 'A'],
  categoryOrder: ['blue', 'red'],
  ticketColors: ['B', 'R', 'W'],
  artists: artistRows.map(([genre, category, initialFame, initialPromotion]) => ({ id: `ART-${genre}-${category.toUpperCase()}-${initialFame}`, genre, category, initialFame, initialPromotion })),
  artworks: (Object.entries(artworkRows) as [ArtworkGenre, readonly [number | 'X', string, number][]][]).flatMap(([genre, rows]) => rows.map(([fameGain, ticketReward, visitorCount], index) => ({ id: `WORK-${genre}-${String(index + 1).padStart(2, '0')}`, genre, fameGain, ticketReward, visitorCount }))),
  artistBonuses: ['INFLUENCE','COINS','VISITOR-ANY','FAME-C','VISITOR-ANY','TICKET-DIFF2','COINS','FAME-C','TICKET-DIFF2','INFLUENCE'].map((reward, index) => ({ id: `BONUS-${String(index + 1).padStart(2, '0')}`, reward: reward as RewardId })),
  orders: orderRows.map(([genre, reward], index) => ({ id: `ORDER-${String(index + 1).padStart(2, '0')}`, genre, reward })),
  curatorGoals: ['CURATOR-01','CURATOR-02','CURATOR-03','CURATOR-04'],
  dealerGoals: ['DEALER-01','DEALER-02','DEALER-03','DEALER-04'],
  reputationTokenIds: Array.from({ length: 20 }, (_, index) => `REP-${String(index + 1).padStart(3, '0')}`),
  visitorPools: { 2: { B: 10, R: 10, W: 8 }, 3: { B: 12, R: 12, W: 10 }, 4: { B: 14, R: 14, W: 12 } },
  ticketsPerColor: { 2: 10, 3: 15, 4: 20 },
  auctionEasels: { 2: 1, 3: 2, 4: 3 },
  marketBidCells: [
    ['MARKET-BID-C1-B1', 1, 1, 'TICKET-ANY'], ['MARKET-BID-C2-B1', 2, 1, 'HIRE-FREE'], ['MARKET-BID-C3-B1', 3, 1, 'TICKET-DIFF2'],
    ['MARKET-BID-C1-B3', 1, 3, 'HIRE-FREE'], ['MARKET-BID-C2-B3', 2, 3, 'INFLUENCE'], ['MARKET-BID-C3-B3', 3, 3, 'COINS'],
    ['MARKET-BID-C1-B6', 1, 6, 'VISITOR-ANY'], ['MARKET-BID-C2-B6', 2, 6, 'COINS'], ['MARKET-BID-C3-B6', 3, 6, 'INFLUENCE'],
  ].map(([id, column, bid, reward]) => ({ id: id as string, column: column as MarketColumn, bid: bid as 1 | 3 | 6, reward: reward as RewardId })),
  marketReputationCells: ['D', 'P', 'S', 'A'].flatMap(genre => [1, 2, 3].map(column => ({ id: `MARKET-REP-C${column}-${genre}`, column: column as MarketColumn, genre: genre as ArtworkGenre, playerCounts: column === 2 ? [3, 4] : [2, 3, 4] }))),
  marketReputationPlacementOrder: ['D', 'P', 'S', 'A'].flatMap(genre => [1, 2, 3].map(column => `MARKET-REP-C${column}-${genre}`)),
  hireQueue: [[1, 1, null], [2, 2, 'TICKET-B'], [3, 2, 'TICKET-R'], [4, 3, 'INFLUENCE'], [5, 3, null], [6, 4, 'TICKET-ANY'], [7, 5, null], [8, 6, 'COINS']].map(([position, cost, reward]) => ({ id: `BOARD-HIRE-${position}`, position: position as number, cost: cost as number, reward: reward as RewardId | null })),
  boardReputationCells: [
    ['BOARD-REP-R1-L', 1, 'L', 'FAME-C'], ['BOARD-REP-R1-R', 1, 'R', 'HIRE-FREE'],
    ['BOARD-REP-R2-L', 2, 'L', 'COINS'], ['BOARD-REP-R2-R', 2, 'R', 'TICKET-DIFF2'],
    ['BOARD-REP-R3-L', 3, 'L', 'INFLUENCE'], ['BOARD-REP-R3-R', 3, 'R', 'VISITOR-ANY'],
  ].map(([id, row, side, reward]) => ({ id: id as string, row: row as 1 | 2 | 3, side: side as 'L' | 'R', reward: reward as RewardId })),
  boardOrderCells: [['BOARD-ORDER-1', 1, 'TICKET-B'], ['BOARD-ORDER-2', 2, 'TICKET-R'], ['BOARD-ORDER-3', 3, 'TICKET-ANY']].map(([id, position, reward]) => ({ id: id as string, position: position as 1 | 2 | 3, reward: reward as RewardId })),
  assistantsPerPlayer: { office: 2, hireQueue: 8 },
  promotionTokens: [[1, 'TICKET-ANY'], [2, 'INFLUENCE'], [3, 'TICKET-DIFF2'], [4, 'COINS'], [5, 'VISITOR-ANY']].flatMap(([level, reward]) => Array.from({ length: 4 }, (_, index) => ({ id: `PROMOTION-${level}-${index + 1}`, level: level as 1 | 2 | 3 | 4 | 5, influenceCost: level as 1 | 2 | 3 | 4 | 5, reward: reward as RewardId }))),
  superstarTokenIds: Array.from({ length: 5 }, (_, index) => `SUPERSTAR-${index + 1}`),
})
