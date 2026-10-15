import { setupComponentCatalog, type ArtworkGenre } from './component-catalog.js'
import { freezeTransition, type GameEvent, type GameTransition } from './game-events.js'
import type { AuctionAward, FinalScoringGameState, GameState, PlayerId } from './types.js'
import type { GoalCardDefinition } from './goal-card-catalog.js'
import { applyInfluenceGainToPlayer } from './influence-gain-award.js'
import { calculateArtworkSaleValue } from './artwork-sale-value.js'
import { applyFinalInfluenceScoringToGameState } from './final-influence-scoring-state.js'
import { completeFinalScoring } from './final-scoring-completion.js'

/**
 * Считает помощников игрока в игре для REP-009 и разрешения ничьей по SCORE-007.
 * Учитывает офис, заказы, локации, рынок и выдворенную фишку;
 * безработные и удалённые помощники в результат не входят.
 */
export function countAssistantsInPlay(state: GameState, playerId: PlayerId): number {
  const board = state.playerBoards.find(item => item.playerId === playerId)
  if (!board) throw new Error('Missing player board')
  return board.assistants.office + board.locationAssistants.length
    + Object.values(board.boardOrders).filter(order => order.assistant !== null).length
    + state.internationalMarket.marketAssistants.filter(item => item.playerId === playerId).length
    + (board.ejectedAssistant === null ? 0 : 1)
}

/** Возвращает колонку каталожной ячейки любой части международного рынка. */
function columnOf(cellId: string): number {
  const cell = [...setupComponentCatalog.marketBidCells, ...setupComponentCatalog.marketReputationCells].find(item => item.id === cellId)
  if (!cell) throw new Error('Unknown market cell')
  return cell.column
}

/**
 * Определяет порядок выбора аукционных работ по SCORE-004.
 * Сначала сравнивает общую ставку, затем ставки колонок 3, 2, 1;
 * полную ничью разрешает обычной очередностью от firstPlayerId.
 * Игроки с нулевой ставкой в аукционе не участвуют.
 */
export function determineAuctionOrder(state: GameState): readonly PlayerId[] {
  if (!('firstPlayerId' in state)) throw new Error('Auction requires first player')
  const first = state.players.findIndex(player => player.id === state.firstPlayerId)
  if (first < 0) throw new Error('Invalid first player')
  /** Собирает суммы только аукционных ставок в порядке приоритета колонок. */
  const totals = (playerId: string) => [3, 2, 1].map(column => state.internationalMarket.marketAssistants
    .filter(item => item.playerId === playerId && item.bid !== null && columnOf(item.cellId) === column)
    .reduce((sum, item) => sum + item.bid!, 0))
  // Циклический сдвиг делает firstPlayerId началом очереди даже внутри массива players.
  return state.players.map((player, index) => ({ id: player.id, columns: totals(player.id), order: (index - first + state.players.length) % state.players.length }))
    .filter(item => item.columns.some(value => value > 0))
    .sort((left, right) => right.columns.reduce((a, b) => a + b, 0) - left.columns.reduce((a, b) => a + b, 0)
      || right.columns[0]! - left.columns[0]! || right.columns[1]! - left.columns[1]! || right.columns[2]! - left.columns[2]! || left.order - right.order)
    .map(item => item.id)
}

/**
 * Находит максимальную выплату карты целей по доступным жанрам работ (SCORE-005).
 * Работы расходуются между целями без повторного использования.
 * Строка куратора оплачивается один раз, строка дилера — за каждый полный набор.
 */
export function calculateGoalCardCoins(card: GoalCardDefinition, genres: readonly ArtworkGenre[]): number {
  const order = setupComponentCatalog.genreOrder
  // Для этих целей важны только жанры: одинаковые по жанру работы взаимозаменяемы.
  const initial = order.map(genre => genres.filter(item => item === genre).length)
  const memo = new Map<string, number>()
  /** Выбирает лучшую выплату оставшихся строк при текущем остатке работ каждого жанра. */
  const solve = (tier: number, counts: readonly number[]): number => {
    if (tier === card.rewardTiers.length) return 0
    // Одинаковые остатки на одной строке дают одну подзадачу независимо от пути к ней.
    const key = `${tier}:${counts.join(',')}`
    if (memo.has(key)) return memo.get(key)!
    const target = card.rewardTiers[tier]!
    const required = order.map(genre => target.requiredGenres.filter(item => item === genre).length)
    if (!required.some(Boolean)) throw new Error('Empty goal target')
    // Число наборов ограничивает самый дефицитный из требуемых жанров.
    const possible = Math.min(...required.flatMap((count, index) => count ? [Math.floor(counts[index]! / count)] : []))
    const limit = card.type === 'curator' ? Math.min(1, possible) : possible
    let best = 0
    // Включаем отказ от этой строки: её работы могут дать больше монет в другой цели.
    for (let sets = 0; sets <= limit; sets++) {
      best = Math.max(best, sets * target.coins + solve(tier + 1, counts.map((count, index) => count - sets * required[index]!)))
    }
    memo.set(key, best)
    return best
  }
  return solve(0, initial)
}

/** Находит жанр по устойчивому ID работы; неизвестный ID отклоняет с ошибкой. */
function genreOf(artworkId: string): ArtworkGenre {
  const artwork = setupComponentCatalog.artworks.find(item => item.id === artworkId)
  if (!artwork) throw new Error('Unknown scored artwork')
  return artwork.genre
}

/**
 * Рассчитывает монеты и влияние одного жетона по формулам REP-001–020 раздела 17.1.
 * Возвращает награду без изменения состояния; ограничение влияния применяется при начислении.
 */
function reputationReward(state: GameState, playerId: string, tokenId: string): { coins: number; influence: number } {
  const board = state.playerBoards.find(item => item.playerId === playerId)!
  const player = state.players.find(item => item.id === playerId)!
  const exhibited = board.gallery.artworkSlots.flatMap(item => item ? [item] : [])
  // Репутация считается раньше аукциона: приобретения здесь состоят из выставленных и проданных работ.
  const acquired = [...exhibited.map(item => item.artworkId), ...board.soldArtworkIds]
  const collectors = board.gallery.visitors.filter(item => item.type === 'W').length
  const celebrities = board.gallery.visitors.filter(item => item.type === 'R').length
  const investors = board.gallery.visitors.filter(item => item.type === 'B').length
  let count = 0, coins = 0, influence = 0
  switch (tokenId) {
    case 'REP-001': return { coins: Math.floor(player.influence / 3), influence: 0 }
    case 'REP-002': count = collectors; coins = 3; influence = 1; break
    case 'REP-003': count = celebrities; coins = 2; influence = 1; break
    case 'REP-004': count = investors; coins = 2; influence = 1; break
    case 'REP-005': count = board.gallery.visitors.length; coins = 1; break
    case 'REP-006': count = Math.min(collectors, celebrities, investors); coins = 4; break
    case 'REP-007': count = Object.keys(board.boardReputationTokens).length; coins = 2; influence = 1; break
    case 'REP-008': count = state.internationalMarket.marketAssistants.filter(item => item.playerId === playerId && item.bid !== null).length; coins = 3; influence = 1; break
    case 'REP-009': count = countAssistantsInPlay(state, playerId); coins = 1; influence = 1; break
    case 'REP-010': count = state.artistMarket.slots.filter(item => item.promotionLevel >= 4).length; coins = 2; break
    case 'REP-011': count = acquired.length; coins = 2; break
    case 'REP-012': count = board.soldArtworkIds.length; coins = 3; influence = 1; break
    case 'REP-013': count = exhibited.length; coins = 3; influence = 1; break
    case 'REP-014': count = new Set(acquired.map(genreOf)).size; coins = 2; influence = 1; break
    case 'REP-015': case 'REP-016': case 'REP-017': case 'REP-018': {
      const genre: ArtworkGenre = ({ 'REP-015': 'P', 'REP-016': 'A', 'REP-017': 'D', 'REP-018': 'S' } as const)[tokenId]
      count = acquired.filter(id => genreOf(id) === genre).length; coins = 3; influence = 1; break
    }
    case 'REP-019': count = state.artistMarket.slots.filter(item => item.isOpen && item.fame !== null && item.fame >= 15).length; coins = 2; influence = 1; break
    case 'REP-020': count = exhibited.filter(item => item.isMasterpiece).length; coins = 4; influence = 2; break
    default: throw new Error('Unknown reputation token')
  }
  return { coins: coins * count, influence: influence * count }
}

/**
 * Атомарно выполняет следующий сохраняемый этап финального подсчёта SCORE-001–007.
 * На этапе аукциона принимает один выбор очередного игрока; остальные этапы не требуют choice.
 * Возвращает новое замороженное состояние и события, а последний этап завершает партию.
 * Стадия и список выдач сохраняются в снимке, поэтому восстановление продолжает текущий этап.
 */
export function advanceFinalScoring(state: GameState, choice?: Readonly<AuctionAward>): GameTransition<GameState> {
  if (state.phase !== 'final_scoring' || state.status !== 'in_progress') throw new Error('Final scoring requires final_scoring phase')
  if (state.playerBoards.length !== state.players.length || state.players.some(player => state.playerBoards.filter(board => board.playerId === player.id).length !== 1)) {
    throw new Error('Invalid scoring player boards')
  }
  if (choice !== undefined && state.finalScoringStage !== 'auction') throw new Error('Auction choice outside auction')
  const events: GameEvent[] = []
  let next: FinalScoringGameState = structuredClone(state)
  /** Начисляет награду в рабочую копию с пределом влияния и защитой суммы монет от переполнения. */
  const award = (playerId: string, coins: number, influence = 0) => {
    if (!Number.isSafeInteger(coins) || coins < 0) throw new Error('Invalid scoring coins')
    next = { ...next, players: next.players.map(player => {
      if (player.id !== playerId) return player
      const updated = applyInfluenceGainToPlayer(player, influence)
      if (!Number.isSafeInteger(updated.coins + coins)) throw new Error('Scoring coins overflow')
      return { ...updated, coins: updated.coins + coins }
    }) }
  }
  switch (state.finalScoringStage) {
    case 'market_leadership': {
      const prizes = { 1: [6, 3, 1], 2: [10, 6, 3], 3: [15, 10, 6] } as const
      for (const column of [1, 2, 3] as const) {
        if (column === 2 && state.config.playerCount === 2) continue
        const ranked = state.players.map(player => ({ id: player.id, count: state.internationalMarket.marketAssistants
          .filter(item => item.playerId === player.id && columnOf(item.cellId) === column).length }))
          .filter(item => item.count > 0).sort((left, right) => right.count - left.count)
        for (let place = 0; place < ranked.length;) {
          const tied = ranked.filter(item => item.count === ranked[place]!.count)
          // Связанные игроки делят суммы всех занимаемых мест; за четвёртое место выплата равна нулю.
          const coins = Math.floor(tied.reduce((sum, _, index) => sum + (prizes[column][place + index] ?? 0), 0) / tied.length)
          for (const item of tied) { award(item.id, coins); events.push({ type: 'MarketLeadershipScored', column, playerId: item.id, coinsAwarded: coins }) }
          // После группы пропускаем сразу все спорные места, а не только одно.
          place += tied.length
        }
      }
      next = { ...next, finalScoringStage: 'reputation' }; break
    }
    case 'reputation': {
      for (const board of state.playerBoards) {
        const tokens = Object.values(board.boardReputationTokens)
        if (tokens.length > 1) throw new Error('Only one reputation token per player')
        if (!tokens.length) continue
        const reward = reputationReward(state, board.playerId, tokens[0]!)
        const previous = next.players.find(item => item.id === board.playerId)!.influence
        award(board.playerId, reward.coins, reward.influence)
        events.push({ type: 'ReputationTokensScored', playerId: board.playerId, coinsAwarded: reward.coins,
          // В событие попадает фактическое изменение после ограничения шкалы значением 35.
          influenceAwarded: next.players.find(item => item.id === board.playerId)!.influence - previous })
      }
      next = { ...next, finalScoringStage: 'exhibition' }; break
    }
    case 'exhibition': {
      for (const board of state.playerBoards) {
        const coins = board.gallery.artworkSlots.reduce((sum, item) => sum + (item?.saleValue ?? 0), 0)
        award(board.playerId, coins); events.push({ type: 'ExhibitionScored', playerId: board.playerId, coinsAwarded: coins })
      }
      next = { ...next, finalScoringStage: 'auction' }; break
    }
    case 'auction': {
      // Работ меньше, чем игроков: право выбора получают только первые участники очереди.
      const order = determineAuctionOrder(state).slice(0, state.masterpieceAuction.artworks.length)
      // Каждая сохранённая выдача соответствует одному уже сделанному выбору.
      const playerId = order[state.auctionAwards.length]
      if (playerId !== undefined) {
        if (!choice || choice.playerId !== playerId || (choice.goalType !== 'curator' && choice.goalType !== 'dealer')) throw new Error('Expected next auction player and goal choice')
        const artwork = state.masterpieceAuction.artworks.find(item => item.id === choice.artworkId)
        if (!artwork || state.auctionAwards.some(item => item.artworkId === artwork.id)) throw new Error('Auction artwork unavailable')
        const artists = state.artistMarket.slots.filter(item => item.isOpen && item.genre === artwork.genre && item.fame !== null)
        const highestFame = Math.max(-1, ...artists.map(item => item.fame!))
        const prices = artists.filter(item => item.fame === highestFame).map(item => calculateArtworkSaleValue(item.artistId, item.fame!))
        // При отсутствии открытого художника жанра массив пуст и цена остаётся нулевой.
        const coins = Math.max(0, ...prices)
        award(playerId, coins)
        // Копируем только доменные поля: лишние свойства внешнего choice не должны попасть в событие.
        const awarded: AuctionAward = { playerId, artworkId: artwork.id, goalType: choice.goalType }
        next = { ...next, auctionAwards: [...state.auctionAwards, awarded], players: next.players.map(player => {
          if (player.id !== playerId) return player
          if (!Number.isSafeInteger(player.acquiredArtworkCount + 1)) throw new Error('Acquired artwork count overflow')
          return { ...player, acquiredArtworkCount: player.acquiredArtworkCount + 1 }
        }) }
        events.push({ type: 'ExceptionalArtworkAwarded', ...awarded }, { type: 'CoinsReceived', playerId, coinsReceived: coins })
      } else if (choice !== undefined) throw new Error('Auction already resolved')
      if (next.auctionAwards.length === order.length) {
        next = { ...next, finalScoringStage: 'curator' }
        events.push({ type: 'AuctionResolved', playerIds: order })
      }
      break
    }
    case 'curator': case 'dealer': {
      for (const player of state.players) {
        const board = state.playerBoards.find(item => item.playerId === player.id)!
        const goal = state.privateGoals.goalsByPlayer[player.id]
        if (!goal) throw new Error('Missing private goals')
        const ids = state.finalScoringStage === 'curator' ? board.gallery.artworkSlots.flatMap(item => item ? [item.artworkId] : []) : [...board.soldArtworkIds]
        const won = state.auctionAwards.find(item => item.playerId === player.id && item.goalType === state.finalScoringStage)
        // Приложенная работа помогает ровно одной карте и не добавляется к проданным работам.
        if (won) ids.push(won.artworkId)
        const coins = calculateGoalCardCoins(state.finalScoringStage === 'curator' ? goal.curatorGoal : goal.dealerGoal, ids.map(genreOf))
        award(player.id, coins)
        events.push({ type: state.finalScoringStage === 'curator' ? 'CuratorCardScored' : 'DealerCardScored', playerId: player.id, coinsAwarded: coins })
      }
      next = { ...next, finalScoringStage: state.finalScoringStage === 'curator' ? 'dealer' : 'influence' }; break
    }
    case 'influence': return applyFinalInfluenceScoringToGameState(state)
    case 'complete': return completeFinalScoring(state)
    default: throw new Error('Invalid final scoring stage')
  }
  return freezeTransition(next, events)
}
