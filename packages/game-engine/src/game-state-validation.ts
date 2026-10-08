import { deepFreeze, setupComponentCatalog } from './component-catalog.js'
import type { GamePhase, GameState, PlayerId } from './types.js'

type UnknownRecord = Record<string, unknown>

/** Рекурсивно сравнивает JSON-подобные значения; порядок ключей объекта не важен. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, index) => deepEqual(val, b[index]));
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => keysB.includes(key) && deepEqual((a as UnknownRecord)[key], (b as UnknownRecord)[key]));
  }

  return false;
}

/** Отличает объект снимка от null, массива и примитивных значений. */
function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Завершает восстановление единообразной ошибкой невалидного снимка. */
function fail(message: string): never {
  throw new Error(`Invalid game state: ${message}`)
}

/** Требует логическое значение без приведения строк и чисел к boolean. */
function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    return fail(`${name} must be a boolean`)
  }
  return value
}

/** Требует объектное поле внешнего снимка. */
function requireRecord(value: unknown, name: string): UnknownRecord {
  if (!isRecord(value)) {
    return fail(`${name} must be an object`)
  }
  return value
}

/** Требует непустую строку во внешнем снимке. */
function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(`${name} must be a non-empty string`)
  }
  return value
}

/** Требует безопасное целое число во внешнем снимке. */
function requireSafeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value)) {
    return fail(`${name} must be a safe integer`)
  }
  return value as number
}

/** Проверяет точные неотрицательные запасы трёх цветов билетов. */
function requireTicketCounts(value: unknown, name: string): void {
  const counts = requireRecord(value, name)
  const colors = ['B', 'R', 'W'] as const
  if (
    Object.keys(counts).length !== colors.length
    || !colors.every(color => Object.hasOwn(counts, color))
  ) {
    fail(`${name} must contain exactly B, R, and W`)
  }
  colors.forEach(color => {
    const count = requireSafeInteger(counts[color], `${name}.${color}`)
    if (count < 0) fail(`${name}.${color} must be non-negative`)
  })
}

/** Проверяет, что ссылка ведёт на участника восстанавливаемой партии. */
function requirePlayerReference(
  value: unknown,
  playerIds: ReadonlySet<PlayerId>,
  name: string,
): PlayerId {
  const playerId = requireNonEmptyString(value, name)
  if (!playerIds.has(playerId)) {
    return fail(`${name} must reference a player in the game`)
  }
  return playerId
}

/** Проверяет наличие общих коллекций полного серверного снимка. */
function validateCommonCollections(state: UnknownRecord): void {
  const objectFields = [
    'orderMarket',
    'ticketOffice',
    'ticketDiscard',
    'promotionSupply',
    'artistMarket',
    'artistSetup',
    'visitorBag',
    'internationalMarket',
    'artworkMarket',
    'masterpieceAuction',
    'privateGoals',
    'setupVersions',
  ] as const
  const arrayFields = ['playerBoards', 'plazaVisitors', 'vestibuleVisitors'] as const

  objectFields.forEach(field => requireRecord(state[field], field))
  arrayFields.forEach(field => {
    if (!Array.isArray(state[field])) {
      fail(`${field} must be an array`)
    }
  })

  const setupVersions = requireRecord(state.setupVersions, 'setupVersions')
  requireNonEmptyString(setupVersions.rulesVersion, 'setupVersions.rulesVersion')
  requireNonEmptyString(setupVersions.componentsVersion, 'setupVersions.componentsVersion')
  requireNonEmptyString(
    setupVersions.setupAlgorithmVersion,
    'setupVersions.setupAlgorithmVersion',
  )

  const ticketOffice = requireRecord(state.ticketOffice, 'ticketOffice')
  requireTicketCounts(ticketOffice.ticketsByColor, 'ticketOffice.ticketsByColor')
  requireTicketCounts(state.ticketDiscard, 'ticketDiscard')

  const artistMarket = requireRecord(state.artistMarket, 'artistMarket')
  if (!Array.isArray(artistMarket.slots)) fail('artistMarket.slots must be an array')
  artistMarket.slots.forEach((value, index) => {
    const slot = requireRecord(value, `artistMarket.slots[${index}]`)
    requireNonEmptyString(slot.artistId, `artistMarket.slots[${index}].artistId`)
    requireBoolean(slot.isSuperstar, `artistMarket.slots[${index}].isSuperstar`)
  })

  // Каждый физический рекламный жетон находится либо в запасе, либо на художнике.
  const tokens = new Map(setupComponentCatalog.promotionTokens.map(token => [token.id, token]))
  const locatedTokens = new Set<string>()
  const locateToken = (value: unknown, level: number): void => {
    const id = requireNonEmptyString(value, 'promotionTokenId')
    if (tokens.get(id)?.level !== level) fail('promotion token must match its level')
    if (locatedTokens.has(id)) fail('promotionTokenId must have one location')
    locatedTokens.add(id)
  }
  const promotionSupply = requireRecord(state.promotionSupply, 'promotionSupply')
  const tokenIdsByLevel = requireRecord(promotionSupply.tokenIdsByLevel, 'promotionSupply.tokenIdsByLevel')
  if (Object.keys(tokenIdsByLevel).length !== 5) fail('promotion supply must contain exactly five levels')
  for (const level of [1, 2, 3, 4, 5]) {
    const ids = tokenIdsByLevel[level]
    if (!Array.isArray(ids)) fail('promotion token IDs must be an array')
    ids.forEach(id => locateToken(id, level))
  }
  artistMarket.slots.forEach(value => {
    const slot = requireRecord(value, 'artist slot')
    const initial = requireSafeInteger(slot.initialPromotion, 'initialPromotion')
    const level = requireSafeInteger(slot.promotionLevel, 'promotionLevel')
    if (initial < 0 || initial > 3 || level < initial || level > 5) fail('Invalid promotionLevel')
    if (slot.promotionTokenId === null) {
      if (level !== initial) fail('Promoted artist must have a promotion token')
    } else {
      if (level <= initial) fail('Initial promotion must not use a supply token')
      locateToken(slot.promotionTokenId, level)
    }
  })
  if (locatedTokens.size !== tokens.size) fail('All promotion tokens must have one location')

  const artistSetup = requireRecord(state.artistSetup, 'artistSetup')
  if (!Array.isArray(artistSetup.slots)) fail('artistSetup.slots must be an array')
  artistSetup.slots.forEach((value, index) => {
    const slot = requireRecord(value, `artistSetup.slots[${index}]`)
    if (!Array.isArray(slot.availableSignatureTokenIds)) {
      fail(`artistSetup.slots[${index}].availableSignatureTokenIds must be an array`)
    }
    slot.availableSignatureTokenIds.forEach((signatureTokenId, signatureIndex) => {
      requireNonEmptyString(
        signatureTokenId,
        `artistSetup.slots[${index}].availableSignatureTokenIds[${signatureIndex}]`,
      )
    })
  })
}

/** Проверяет планшеты, работы, контракты и уникальность расположения физических подписей. */
function validatePlayerBoards(state: UnknownRecord, playerIds: ReadonlySet<PlayerId>): void {
  if (!Array.isArray(state.playerBoards)) fail('playerBoards must be an array')
  // Одна физическая подпись не может одновременно лежать у художника, на работе и в контракте.
  const signatureLocations = new Set<string>()
  const artistSetup = requireRecord(state.artistSetup, 'artistSetup')
  for (const value of artistSetup.slots as unknown[]) {
    const slot = requireRecord(value, 'artistSetup slot')
    for (const signatureTokenId of slot.availableSignatureTokenIds as unknown[]) {
      const id = requireNonEmptyString(signatureTokenId, 'available signatureTokenId')
      if (signatureLocations.has(id)) fail('signatureTokenId must have one location')
      signatureLocations.add(id)
    }
  }

  state.playerBoards.forEach((value, index) => {
    const board = requireRecord(value, `playerBoards[${index}]`)
    const assistants = requireRecord(board.assistants, 'assistants')
    const office = requireSafeInteger(assistants.office, 'office')
    const hireQueue = requireSafeInteger(assistants.hireQueue, 'hireQueue')
    const assistantOfficeIds = assistants.assistantOfficeIds
    const assistantHireQueueIds = assistants.assistantHireQueueIds
    if (!Array.isArray(assistantOfficeIds)) fail('artistSetup.slots must be an array')
    if (!Array.isArray(assistantHireQueueIds)) fail('artistSetup.slots must be an array')
    assistantOfficeIds.forEach(el => requireNonEmptyString(el,'string'))
    assistantHireQueueIds.forEach(el => requireNonEmptyString(el,'string'))
    if(office !== assistantOfficeIds.length || hireQueue !== assistantHireQueueIds.length) fail('error length')
    if((new Set([...assistantOfficeIds,...assistantHireQueueIds])).size !== assistantHireQueueIds.length + assistantOfficeIds.length) fail('error length')
    if(assistantHireQueueIds.length < 0
      || assistantHireQueueIds.length > 8
      || assistantOfficeIds.length < 0
      || assistantOfficeIds.length > 4
    ) fail('error length')

    requirePlayerReference(board.playerId, playerIds, `playerBoards[${index}].playerId`)
    const gallery = requireRecord(board.gallery, `playerBoards[${index}].gallery`)
    if (!Array.isArray(gallery.artworkSlots) || gallery.artworkSlots.length !== 4) {
      fail(`playerBoards[${index}].gallery.artworkSlots must contain four slots`)
    }
    if (!Array.isArray(gallery.visitors)) {
      fail(`playerBoards[${index}].gallery.visitors must be an array`)
    }
    gallery.artworkSlots.forEach((artworkValue, artworkIndex) => {
      if (artworkValue === null) return
      const artwork = requireRecord(
        artworkValue,
        `playerBoards[${index}].gallery.artworkSlots[${artworkIndex}]`,
      )
      requireNonEmptyString(artwork.artworkId, 'artworkId')
      requireNonEmptyString(artwork.artistId, 'artistId')
      const signatureTokenId = requireNonEmptyString(artwork.signatureTokenId, 'signatureTokenId')
      requireSafeInteger(artwork.saleValue, 'saleValue')
      requireBoolean(artwork.isMasterpiece, 'isMasterpiece')
      if (signatureLocations.has(signatureTokenId)) fail('signatureTokenId must have one location')
      signatureLocations.add(signatureTokenId)
    })
    if (board.contract !== null) {
      const contract = requireRecord(board.contract, `playerBoards[${index}].contract`)
      requireNonEmptyString(contract.artistId, 'contract.artistId')
      const signatureTokenId = requireNonEmptyString(contract.signatureTokenId, 'contract.signatureTokenId')
      if (signatureLocations.has(signatureTokenId)) fail('signatureTokenId must have one location')
      signatureLocations.add(signatureTokenId)
    }

    const orders = requireRecord(board.boardOrders, `boardOrders`)
    let orderKeys: string[] = []
    for (const key of Object.keys(orders)) {
      orderKeys.push(key)
    }
    const setOrderKeys = new Set(orderKeys)
    if(!setOrderKeys.has('1') || !setOrderKeys.has('2') || !setOrderKeys.has('3') || setOrderKeys.size !== 3) {
      fail('Invalid order keys')
    }
    for(let el of Object.values(orders)) {
      const order = requireRecord(el, 'order')
      if((order.orderId !== null && order.orderStatus === null) || (order.orderId === null && order.orderStatus !== null)) {
        fail(`invalid orderId`)
      }
      if(order.orderId !== null) requireNonEmptyString(order.orderId, 'orderId')
      if(order.orderStatus !== null) {
        const orderStatus =requireNonEmptyString( order.orderStatus, 'typeOrder' )
        if(orderStatus !== 'completed' && orderStatus !== 'unfulfilled') fail('typeOrder')
      }
    }
  })
}

/** Проверяет игроков и возвращает множество допустимых ссылок на них. */
function validatePlayers(state: UnknownRecord): ReadonlySet<PlayerId> {
  if (!Array.isArray(state.players)) {
    return fail('players must be an array')
  }

  const playerIds = new Set<PlayerId>()
  for (const [index, value] of state.players.entries()) {
    const player = requireRecord(value, `players[${index}]`)
    const playerId = requireNonEmptyString(player.id, `players[${index}].id`)
    requireNonEmptyString(player.name, `players[${index}].name`)
    if (player.kind !== 'human' && player.kind !== 'bot') {
      fail(`players[${index}].kind must be human or bot`)
    }

    if (value.acquiredArtworkCount < 0 || !Number.isSafeInteger(value.acquiredArtworkCount)) {
      return fail('acquiredArtworkCount must be an array')
    }
    const playerStatus = requireNonEmptyString(player.status, `string`)

    if(playerStatus !== 'PENDING' && playerStatus !== 'REFRESH' && playerStatus !== 'REFUSAL' && playerStatus !== 'SUCCESS' && playerStatus !== 'WAITING') {
      return fail('Invalid status player')
    }

    const coins = requireSafeInteger(player.coins, `players[${index}].coins`)
    const influence = requireSafeInteger(player.influence, `players[${index}].influence`)
    if (coins < 0) {
      fail(`players[${index}].coins must be non-negative`)
    }
    if (influence < 0 || influence > 35) {
      fail(`players[${index}].influence must be from 0 to 35`)
    }
    requireTicketCounts(player.ticketsByColor, `players[${index}].ticketsByColor`)
    const soldArtworkCount = requireSafeInteger(player.soldArtworkCount, `players[${index}].soldArtworkCount`)
    if (soldArtworkCount < 0) fail('soldArtworkCount must be non-negative')
    if (playerIds.has(playerId)) {
      fail('players must have unique IDs')
    }
    playerIds.add(playerId)
  }

  return playerIds
}

/** Проверяет согласованность phase, status, round и активного игрока по ADR-002. */
function validatePhase(
  state: UnknownRecord,
  playerIds: ReadonlySet<PlayerId>,
): void {
  const phases: readonly GamePhase[] = [
    'setup',
    'regular_play',
    'ending_current_round',
    'final_round',
    'final_scoring',
    'finished',
  ]
  if (!phases.includes(state.phase as GamePhase)) {
    fail('phase is unknown')
  }

  const round = requireSafeInteger(state.round, 'round')
  if (state.phase === 'setup') {
    if (state.status !== 'setup' || round !== 0 || state.activePlayerId !== null) {
      fail('setup phase must have setup status, round 0, and no active player')
    }
    if (
      state.setupStage !== 'choosing_starting_locations'
      && state.setupStage !== 'complete'
    ) {
      fail('setupStage is invalid')
    }
    if (!Array.isArray(state.startingLocationSelectionOrder)) {
      fail('startingLocationSelectionOrder must be an array')
    }
    if (state.startingLocationSelectionOrder.length !== playerIds.size) {
      fail('startingLocationSelectionOrder must contain every player')
    }
    const selectionIds = new Set<unknown>(state.startingLocationSelectionOrder)
    if (selectionIds.size !== state.startingLocationSelectionOrder.length) {
      fail('startingLocationSelectionOrder must contain unique players')
    }
    state.startingLocationSelectionOrder.forEach((playerId, index) => {
      requirePlayerReference(playerId, playerIds, `startingLocationSelectionOrder[${index}]`)
    })
    if (state.currentStartingLocationPlayerId !== null) {
      requirePlayerReference(
        state.currentStartingLocationPlayerId,
        playerIds,
        'currentStartingLocationPlayerId',
      )
    }
    if (
      state.setupStage === 'choosing_starting_locations'
      && state.currentStartingLocationPlayerId === null
    ) {
      fail('choosing_starting_locations must have a current player')
    }
    if (state.setupStage === 'complete' && state.currentStartingLocationPlayerId !== null) {
      fail('complete setup must not have a current player')
    }
    if (!Array.isArray(state.availableStartingLocationIds)) {
      fail('availableStartingLocationIds must be an array')
    }
    return
  }

  if (round < 1) {
    fail('non-setup phases must have a positive round')
  }
  requirePlayerReference(state.firstPlayerId, playerIds, 'firstPlayerId')

  if (state.phase === 'finished') {
    if (state.status !== 'finished' || state.activePlayerId !== null) {
      fail('finished phase must have finished status and no active player')
    }

    requireSafeInteger(state.endTriggeredRound, 'endTriggeredRound')

    if (!Array.isArray(state.winnerIds) || state.winnerIds.length === 0) {
      fail('winnerIds must be a non-empty array')
    }

    const seenWinnerIds = new Set<PlayerId>()

    state.winnerIds.forEach((winnerId, index) => {
      const validatedWinnerId = requirePlayerReference(
        winnerId,
        playerIds,
        `winnerIds[${index}]`,
      )

      if (seenWinnerIds.has(validatedWinnerId)) {
        fail('winnerIds must contain unique players')
      }

      seenWinnerIds.add(validatedWinnerId)
    })

    return
  }
  if (state.status !== 'in_progress') {
    fail('active game phases must have in_progress status')
  }
  if (state.phase === 'final_scoring') {
    if (state.activePlayerId !== null) {
      fail('final_scoring must not have an active player')
    }
    requireSafeInteger(state.endTriggeredRound, 'endTriggeredRound')
    requireBoolean(state.finalInfluenceScored, 'finalInfluenceScored')
    return
  }
  requirePlayerReference(state.activePlayerId, playerIds, 'activePlayerId')
  if (state.phase === 'ending_current_round' || state.phase === 'final_round') {
    requireSafeInteger(state.endTriggeredRound, 'endTriggeredRound')
  }
}
function validateOrderMarket(orderMarket: unknown) {

  const orderMarketR =  requireRecord(orderMarket, 'orderMarket')
  const requiredVisibleOrders = requireRecord(orderMarketR.visibleOrders, 'visibleOrders')
  const  requiredVisibleOrdersKeys = Object.keys(requiredVisibleOrders)
  if(!requiredVisibleOrdersKeys.includes('1')
    || !requiredVisibleOrdersKeys.includes('2')
    || !requiredVisibleOrdersKeys.includes('3')
    || !requiredVisibleOrdersKeys.includes('4')
    || requiredVisibleOrdersKeys.length !== 4) {
    fail('requiredVisibleOrdersKeys')
  }
  const requiredOrderMarket = requireRecord(orderMarketR.orderMarket, 'orderMarket')
  const  requiredOrderMarketKeys = Object.keys(requiredOrderMarket)
  if(!requiredOrderMarketKeys.includes('1')
    || !requiredOrderMarketKeys.includes('2')
    || !requiredOrderMarketKeys.includes('3')
    || !requiredOrderMarketKeys.includes('4')
    || requiredOrderMarketKeys.length !== 4) {
    fail('requiredVisibleOrdersKeys')
  }
  const orderDiscard = orderMarketR.orderDiscard
  const remainingOrderIds = orderMarketR.remainingOrderIds
  if(!Array.isArray(orderDiscard)) fail('orderDiscard must be an array')
  if(!Array.isArray(remainingOrderIds)) fail('remainingOrderIds must be an array')
  orderDiscard.forEach(el => requireNonEmptyString(el,'string'))
  remainingOrderIds.forEach(el => requireNonEmptyString(el,'string'))
  for (const val of Object.values(requiredVisibleOrders)) {
    if(val !== null) requireNonEmptyString(val,'string')
  }
  for (const val of Object.values(requiredOrderMarket)) {
    if(!Array.isArray(val)) fail('requiredOrderMarket must be an array')
      val.forEach((el) => requireNonEmptyString(el,'string'))
  }

}
/** Проверяет JSON-снимок по ADR-001/ADR-002 и возвращает независимый замороженный GameState. */
export function restoreGameState(input: unknown): GameState {
  const state = requireRecord(input, 'state')
  if (state.stateSchemaVersion !== 12) {
    fail('stateSchemaVersion must equal 12')
  }
  const runtimeRng =requireRecord(state.runtimeRng,'runtimeRng')
  const runtimeRngCounters = requireRecord(runtimeRng.runtimeRngCounters,'runtimeRngCounters')
  const orderRecycle = requireSafeInteger(runtimeRngCounters['orders/recycle'], 'orders/recycle')
  if(orderRecycle< 0) fail('orderRecycle < 0')
  for (let el of Object.values(runtimeRngCounters) ){
    const num = requireSafeInteger(el,'number')
    if(num< 0) fail('runtimeRngCounters < 0')
  }
  if(runtimeRng.runtimeRngVersion !== 'runtime-rng-v1') fail('Invalid runtimeRngVersion')


  requireNonEmptyString(state.id, 'id')
  requireBoolean(state.ticketOfficeEmptyReached,'ticketOfficeEmptyReached')
  const config = requireRecord(state.config, 'config')
  if (config.playerCount !== 2 && config.playerCount !== 3 && config.playerCount !== 4) {
    fail('config.playerCount must be 2, 3, or 4')
  }
  requireSafeInteger(config.seed, 'config.seed')

  const playerIds = validatePlayers(state)
  if (playerIds.size !== config.playerCount) {
    fail('players length must match config.playerCount')
  }
  validateCommonCollections(state)
  validatePlayerBoards(state, playerIds)
  validatePhase(state, playerIds)
  if(state.intermediateScoringStatus !== 'not_triggered' && state.intermediateScoringStatus !== 'pending' && state.intermediateScoringStatus !== 'completed') {
    fail('intermediateScoringStatus invalid')
  }
  validateOrderMarket(state.orderMarket)
  return deepFreeze(structuredClone(state)) as unknown as GameState
}
