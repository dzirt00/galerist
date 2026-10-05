import type { GameState, PlayerId } from "./types.js";
import { applyArtworkPurchaseCostAndMoveVisitors, type ApplyArtworkPurchaseInput, type ArtworkPurchaseType } from "./artwork-purchase-payment.js";
import { freezeTransition, type GameEvent, type GameTransition } from "./game-events.js";
import type { OpenArtworkSlot } from "./setup-artworks.js";
import type { SetupTicketColor } from './component-catalog.js'
import { calculateArtworkPurchaseFameGain } from './artwork-purchase-fame.js'
import { applyAdditionalFameSpend } from './influence-fame-spending-award.js'
import { applyTicketReward } from './ticket-reward-to-game-state.js'
import { calculateArtworkSaleValue } from './artwork-sale-value.js'
import { refillArtworkMarket } from './artwork-market-refill.js'
import type { ExhibitedArtwork, PlayerBoard } from './player-boards.js'

export interface ArtworkPurchasePaymentRequest {
  readonly playerId: PlayerId
  readonly artistId: string
  readonly purchaseType: ArtworkPurchaseType
  readonly targetInfluence?: number
}

export interface ArtworkPurchaseRequest extends ArtworkPurchasePaymentRequest {
  readonly fameTargetInfluence?: number
  readonly requestedTicketColors?: readonly SetupTicketColor[]
  readonly replacementColorsByRequestedColor?: Readonly<
    Partial<Record<SetupTicketColor, SetupTicketColor>>
  >
}

/** Проверяет наличие работы и списка посетителей в открытой позиции рынка. */
function isOpenArtworkSlot(object: unknown): object is OpenArtworkSlot {
  return (
    object != null &&
    typeof object === 'object' &&
    'artwork' in object &&
    'visitors' in object &&
    Array.isArray(object.visitors)
  );
}

/** Проверяет покупку и возвращает источник подписи, позиции и данные для её применения. */
export function validateArtworkPurchaseAvailability(
  state: Readonly<GameState>,
  request: Readonly<ArtworkPurchasePaymentRequest>
) {

  const {
    playerId,
    artistId,
    purchaseType,
  } = request

  const [ getPlayer ] = state.players.filter( player => player.id === playerId );

  // проверка на существования игрока
  if ( getPlayer === undefined ) {
    throw new Error( `Invalid player id ${ playerId }` );
  }
  const getBoardPlayer = state.playerBoards.find(board => board.playerId === getPlayer.id)
  const getBoardPlayerIndex = state.playerBoards.findIndex(board => board.playerId === getPlayer.id)
  // проверка на существования игровой доски игрока
  if(getBoardPlayer === undefined ) {
    throw new Error( `Invalid board player id ${ playerId }` );
  }

  const getSlotArtist = state.artistMarket.slots.find(slot => slot.artistId === artistId)
  // проверка на существования художника
  if(getSlotArtist === undefined ) {
    throw new Error( `Invalid artist ${ artistId }` );
  }

  if(!getSlotArtist.isOpen || !Number.isSafeInteger(getSlotArtist.fame) ) {
    throw new Error( `Invalid artist ${ artistId }` );
  }

  if(purchaseType === 'regular' && getSlotArtist.isSuperstar) {
    throw new Error( `isSuperstar ${ artistId }` );
  }

  const openSlot = state.artworkMarket.openArtworksByGenre[getSlotArtist.genre]

  if(!isOpenArtworkSlot(openSlot) || openSlot.artwork.genre !== getSlotArtist.genre) {
    throw new Error('Invalid ArtworkSlot');
  }

  const getDuplicateArtworkArtist = getBoardPlayer.gallery.artworkSlots.find(slot => slot?.artistId === artistId)

  if(getDuplicateArtworkArtist !== undefined) {
    throw new Error(`player has artwork this artist ${ artistId }`);
  }
  const slots = getBoardPlayer.gallery.artworkSlots;
  const emptySlotsCount = slots.filter(el => el === null).length;
  const hasMasterpiece = slots.some(el => el?.isMasterpiece);

  if (emptySlotsCount === 0) {
    throw new Error("Gallery is completely full");
  }

  if (emptySlotsCount === 1 && !hasMasterpiece && !(getBoardPlayer.contract?.artistId === getSlotArtist.artistId && getSlotArtist.isSuperstar)) {
    throw new Error("Last slot can only be filled by a masterpiece");
  }

  const getIndexArtist = state.artistSetup.slots.findIndex(el => el.artistId === artistId);
  if(getIndexArtist === -1 ) {
    throw new Error( `Invalid artist ${ artistId }`);
  }

  const artistSetupSlot = state.artistSetup.slots[getIndexArtist]!

  if (purchaseType === 'regular') {
    if (getBoardPlayer.contract !== null) {
      throw new Error('Regular purchase is unavailable while contract is active')
    }

    if (artistSetupSlot.availableSignatureTokenIds.length === 0) {
      throw new Error('Artist has no available signature')
    }
  }

  if (purchaseType === 'contract') {
    if (getBoardPlayer.contract === null) {
      throw new Error('Contract purchase requires an active contract')
    }

    if (getBoardPlayer.contract.artistId !== artistId) {
      throw new Error('Contract belongs to another artist')
    }
  }

  const placementFacts = slots.reduce((acc,el,index) => {
    if(el === null) {
      acc.emptyArtworkSlotIndexes.push(index)

    } else {
      acc.occupiedArtworkSlotCount +=1
    }
    return acc;
  },{
    emptyArtworkSlotIndexes: [] as number[],
    occupiedArtworkSlotCount: 0
  })
  let signatureTokenId: string | null = null
  if (purchaseType === 'regular' && state.artistSetup.slots[getIndexArtist]!.availableSignatureTokenIds.length > 0) {
    signatureTokenId = state.artistSetup.slots[getIndexArtist]!.availableSignatureTokenIds[0]!
  }
  if ((purchaseType === 'contract' && getBoardPlayer.contract !== null && getBoardPlayer.contract.signatureTokenId)) {
    signatureTokenId = getBoardPlayer.contract.signatureTokenId
  }

  if(signatureTokenId === null) {
    throw new Error('Invalid signature token')
  }

  return {
    player: getPlayer,
    playerIndex: state.players.findIndex(player => player.id === playerId),
    artist: getSlotArtist,
    artistSetupSlot,
    playerBoard: getBoardPlayer,
    playerBoardIndex: getBoardPlayerIndex,
    openArtwork: openSlot,
    signatureTokenId: signatureTokenId,
    sourceSignature: purchaseType === "regular" ? 'artist' : 'contract',
    emptyArtworkSlotIndexes: placementFacts.emptyArtworkSlotIndexes,
    occupiedArtworkSlotCount: placementFacts.occupiedArtworkSlotCount,
  }
}

/** Проверяет выбор цветов по награде работы; однозначные награды выбирает автоматически. */
function resolveArtworkTicketColors(
  ticketReward: string,
  requestedColors: readonly SetupTicketColor[] | undefined,
): readonly SetupTicketColor[] {
  const colors = requestedColors ?? (
    ticketReward === 'B' || ticketReward === 'R' || ticketReward === 'W'
      ? [ticketReward]
      : ticketReward === 'B+R+W'
        ? ['B', 'R', 'W']
        : ticketReward === '—'
          ? []
          : undefined
  )
  if (colors === undefined) throw new Error('Artwork ticket colors must be selected')
  if (new Set(colors).size !== colors.length) throw new Error('Artwork ticket colors must be unique')
  // Порядок цветов не важен; количество и состав должны совпадать.
  const hasExact = (...expected: SetupTicketColor[]) => (
    colors.length === expected.length && expected.every(color => colors.includes(color))
  )
  const valid = ticketReward === '—' ? colors.length === 0
    : ticketReward === 'ANY' ? colors.length === 1
      : ticketReward === 'DIFF2' ? colors.length === 2
        : ticketReward === 'R+(B/W)' ? colors.length === 2 && colors.includes('R') && (colors.includes('B') || colors.includes('W'))
          : ticketReward === 'B+(R/W)' ? colors.length === 2 && colors.includes('B') && (colors.includes('R') || colors.includes('W'))
            : ticketReward === 'B+R+W' ? hasExact('B', 'R', 'W')
              : ticketReward === 'B' ? hasExact('B')
                : ticketReward === 'R' ? hasExact('R')
                  : ticketReward === 'W' ? hasExact('W')
                    : false
  if (!valid) throw new Error('Selected ticket colors do not match artwork reward')
  return colors
}

/** Копирует четырёхпозиционный список, чтобы размещение не изменяло входной планшет. */
function copyArtworkSlots(board: PlayerBoard): [
  ExhibitedArtwork | null,
  ExhibitedArtwork | null,
  ExhibitedArtwork | null,
  ExhibitedArtwork | null,
] {
  return [
    board.gallery.artworkSlots[0],
    board.gallery.artworkSlots[1],
    board.gallery.artworkSlots[2],
    board.gallery.artworkSlots[3],
  ]
}

/** Атомарно применяет покупку, награды, известность, размещение и пополнение рынка. */
export function applyArtworkPurchaseToGameState(
  state: Readonly<GameState>,
  request: Readonly<ArtworkPurchaseRequest>
): GameTransition<Readonly<GameState>> {
  const availability = validateArtworkPurchaseAvailability(state, request)
  const requestedTicketColors = resolveArtworkTicketColors(
    availability.openArtwork.artwork.ticketReward,
    request.requestedTicketColors,
  )
  const targetInfluence = request.targetInfluence
  const inputData: ApplyArtworkPurchaseInput = {
    player: { ...availability.player },
    openArtwork: {...availability.openArtwork },
    artistInitialFame: availability.artist.initialFame,
    artistCurrentFame: availability.artist.fame!,
    purchaseType: request.purchaseType,
    plazaVisitors: state.plazaVisitors,
    ...(targetInfluence !== undefined && { targetInfluence })
  }

  const artworkPurchasePaymentResult = applyArtworkPurchaseCostAndMoveVisitors(inputData)

  const paymentEvents: GameEvent[] = [
    {
      type: 'ArtworkSelected',
      playerId: availability.player.id,
      artistId: availability.artist.artistId,
      artworkId: availability.openArtwork.artwork.id,
    },
    ...(artworkPurchasePaymentResult.spentInfluence > 0 ? [
      { type: 'InfluenceSpent', playerId: availability.player.id, spentInfluence: artworkPurchasePaymentResult.spentInfluence } as const,
      { type: 'CoinsReceived', playerId: availability.player.id, coinsReceived: artworkPurchasePaymentResult.coinsReceived } as const,
    ] : []),
    { type: 'CoinsSpent', playerId: availability.player.id, paid: artworkPurchasePaymentResult.paid },
    ...availability.openArtwork.visitors.map(visitor => ({
      type: 'VisitorMoved' as const,
      visitorId: visitor.id,
      from: 'artwork' as const,
      to: 'plaza' as const,
    })),
  ]

  // Работа без билетной награды не вызывает расчёт, требующий хотя бы один цвет.
  const ticketResult = requestedTicketColors.length === 0
    ? {
        player: artworkPurchasePaymentResult.player,
        ticketOffice: state.ticketOffice,
        ticketDiscard: state.ticketDiscard,
        events: [] as readonly GameEvent[],
        intermediateScoringStatus: state.intermediateScoringStatus
      }
    : applyTicketReward({
        playerId: availability.player.id,
        requestedColors: requestedTicketColors,
        ...(request.replacementColorsByRequestedColor === undefined ? {} : {
          replacementColorsByRequestedColor: request.replacementColorsByRequestedColor,
        }),
        player: artworkPurchasePaymentResult.player,
        ticketOffice: state.ticketOffice,
        ticketDiscard: state.ticketDiscard,
        intermediateScoringStatus: state.intermediateScoringStatus
      })

  const oldFame = availability.artist.fame!
  const collectorCount = availability.playerBoard.gallery.visitors.filter(visitor => visitor.type === 'W').length
  const baseFameGain = calculateArtworkPurchaseFameGain(
    availability.openArtwork.artwork.fameGain,
    collectorCount,
  )
  const baseFame = Math.min(19, oldFame + baseFameGain)
  let nextPlayer = ticketResult.player
  let nextFame = baseFame
  let additionalFame = 0
  // Дополнительное влияние расходуется после оплаты и базового прироста известности.
  if (request.fameTargetInfluence !== undefined) {
    if (baseFameGain === 0) throw new Error('Artwork X blocks additional fame spending')
    if (baseFame >= 19) throw new Error('Additional fame is unavailable at maximum fame')
    const fameSpend = applyAdditionalFameSpend({
      player: nextPlayer,
      artist: { artistId: availability.artist.artistId, fame: baseFame },
      targetInfluence: request.fameTargetInfluence,
      fameIncrease: { kind: 'eligible', source: 'artwork_purchase', baseFameGain },
    })
    nextPlayer = fameSpend.player
    nextFame = Math.min(19, fameSpend.artist.fame)
    additionalFame = nextFame - baseFame
  }

  const fameEvents: GameEvent[] = []
  if (baseFame !== oldFame) {
    fameEvents.push({ type: 'ArtistFameIncreased', artistId: availability.artist.artistId, previousFame: oldFame, fame: baseFame })
  }
  if (additionalFame > 0) {
    fameEvents.push({ type: 'InfluenceSpent', playerId: availability.player.id, spentInfluence: ticketResult.player.influence - nextPlayer.influence })
    fameEvents.push({ type: 'ArtistFameIncreased', artistId: availability.artist.artistId, previousFame: baseFame, fame: nextFame })
  }

  const previousSaleValue = calculateArtworkSaleValue(availability.artist.artistId, oldFame)
  const saleValue = calculateArtworkSaleValue(availability.artist.artistId, nextFame)
  // Награда выдаётся только при первом достижении статуса, а не при каждой покупке.
  const becameSuperstar = !availability.artist.isSuperstar && nextFame === 19
  if (becameSuperstar) nextPlayer = { ...nextPlayer, coins: nextPlayer.coins + 5 }

  const saleValueEvents: GameEvent[] = []
  const masterpieceEvents: GameEvent[] = []
  // Рост известности меняет работы этого художника в галереях всех игроков.
  let playerBoards: readonly PlayerBoard[] = state.playerBoards.map(board => {
    const artworkSlots = copyArtworkSlots(board)
    let changed = false
    for (let index = 0; index < artworkSlots.length; index += 1) {
      const artwork = artworkSlots[index]
      if (artwork?.artistId !== availability.artist.artistId) continue
      const nextArtwork: ExhibitedArtwork = {
        ...artwork,
        saleValue,
        isMasterpiece: artwork.isMasterpiece || becameSuperstar,
      }
      if (previousSaleValue !== saleValue) changed = true
      if (!artwork.isMasterpiece && nextArtwork.isMasterpiece) {
        masterpieceEvents.push({ type: 'ArtworkBecameMasterpiece', playerId: board.playerId, artworkId: artwork.artworkId })
      }
      artworkSlots[index] = nextArtwork
    }
    if (changed && !saleValueEvents.some(event => event.type === 'ArtworkSaleValuesChanged')) {
      saleValueEvents.push({ type: 'ArtworkSaleValuesChanged', artistId: availability.artist.artistId, saleValue })
    }
    return { ...board, gallery: { ...board.gallery, artworkSlots } }
  })

  const isMasterpiece = availability.artist.isSuperstar || becameSuperstar
  // Третье произведение-шедевр занимает четвёртую позицию по ARTWORK-005.
  const artworkSlotIndex = availability.occupiedArtworkSlotCount === 2
    && isMasterpiece
    && availability.emptyArtworkSlotIndexes.includes(3)
      ? 3
      : availability.emptyArtworkSlotIndexes[0]!
  const exhibitedArtwork: ExhibitedArtwork = {
    artworkId: availability.openArtwork.artwork.id,
    artistId: availability.artist.artistId,
    signatureTokenId: availability.signatureTokenId,
    saleValue,
    isMasterpiece,
  }
  playerBoards = playerBoards.map((board, index) => {
    if (index !== availability.playerBoardIndex) return board
    const artworkSlots = copyArtworkSlots(board)
    artworkSlots[artworkSlotIndex] = exhibitedArtwork
    let updateBoard: PlayerBoard | null = null
    // Считаются работы, а не индекс покупки: шедевр тоже активирует стартовый жетон.
    // Здесь жетон остаётся на работе; получение на клетку в конце хода — отдельный этап.
    if(artworkSlots.filter(slot => slot !== null).length === 3 && board.thirdPartitionReputationTokenId !== null) {

      updateBoard = {
        ...board,
        reputationTokenArtworkIds: ({
          [board.thirdPartitionReputationTokenId]: exhibitedArtwork.artworkId
        }),
        thirdPartitionReputationTokenId: null,
      }
    }

    updateBoard = (updateBoard === null) ? board : updateBoard

    return {
      ...updateBoard,
      gallery: { ...board.gallery, artworkSlots },
      contract: availability.sourceSignature === 'contract' ? null : board.contract,
    }
  })
  const artistSetupSlots = state.artistSetup.slots.map(slot => slot.artistId === availability.artist.artistId
    ? {
        ...slot,
        availableSignatureTokenIds: availability.sourceSignature === 'artist'
          ? slot.availableSignatureTokenIds.filter(id => id !== availability.signatureTokenId)
          : slot.availableSignatureTokenIds,
      }
    : slot)

  // Пополнение не определяет получение стартового жетона: последняя работа тоже его активирует.
  const refill = refillArtworkMarket(
    state.artworkMarket.remainingArtworksByGenre[availability.artist.genre],
    state.visitorBag,
  )
  const artistSlots = state.artistMarket.slots.map(slot => slot.artistId === availability.artist.artistId
    ? { ...slot, fame: nextFame, isSuperstar: slot.isSuperstar || becameSuperstar }
    : slot)
  let players = [...state.players]
  players[availability.playerIndex] = nextPlayer

  if (players[availability.playerIndex]) {
    players = players.map((player, index) =>
      index === availability.playerIndex
        ? { ...player, acquiredArtworkCount: player.acquiredArtworkCount + 1 }
        : player
    );
  }

  const capacityChanged = !availability.playerBoard.gallery.artworkSlots.some(artwork => artwork?.isMasterpiece)
    && isMasterpiece
  // События следуют порядку эффектов: оплата, билеты, известность, размещение, рынок.
  const events: GameEvent[] = [
    ...paymentEvents,
    ...ticketResult.events,
    ...fameEvents,
    ...saleValueEvents,
    ...(becameSuperstar ? [
      { type: 'ArtistBecameSuperstar', artistId: availability.artist.artistId } as const,
      { type: 'CoinsReceived', playerId: availability.player.id, coinsReceived: 5 } as const,
    ] : []),
    ...masterpieceEvents,
    { type: 'ArtworkExhibited', playerId: availability.player.id, artistId: availability.artist.artistId, artworkId: exhibitedArtwork.artworkId, artworkSlotIndex },
    { type: 'SignaturePriceSet', signatureTokenId: availability.signatureTokenId, saleValue },
    ...(capacityChanged ? [{ type: 'ExhibitionCapacityChanged', playerId: availability.player.id, capacity: 4 } as const] : []),
    ...(refill.openArtwork === null ? [] : [{ type: 'ArtworkMarketRefilled', genre: availability.artist.genre, artworkId: refill.openArtwork.artwork.id } as const]),
  ]

  return freezeTransition({
    ...state,
    players,
    playerBoards,
    artistMarket: { ...state.artistMarket, slots: artistSlots },
    artistSetup: { ...state.artistSetup, slots: artistSetupSlots },
    ticketOffice: ticketResult.ticketOffice,
    ticketDiscard: ticketResult.ticketDiscard,
    plazaVisitors: artworkPurchasePaymentResult.plazaVisitors,
    visitorBag: refill.remainingVisitorBag,
    artworkMarket: {
      ...state.artworkMarket,
      openArtworksByGenre: {
        ...state.artworkMarket.openArtworksByGenre,
        [availability.artist.genre]: refill.openArtwork,
      },
      remainingArtworksByGenre: {
        ...state.artworkMarket.remainingArtworksByGenre,
        [availability.artist.genre]: refill.remainingArtworks,
      },
      remainingVisitorBag: refill.remainingVisitorBag,
    },
    intermediateScoringStatus: ticketResult.intermediateScoringStatus
  }, events)
}

/** Применяет только оплату и перенос посетителей уже разрешённой покупки, без размещения работы. */
export function applyArtworkPurchasePaymentToGameState(
  state: Readonly<GameState>,
  request: Readonly<ArtworkPurchasePaymentRequest>
): GameTransition<Readonly<GameState>> {

  const {
    playerId,
    artistId,
    purchaseType,
    targetInfluence,
  } = request

  const [ getPlayer ] = state.players.filter( player => player.id === playerId );
  const getIndexPlayer = state.players.findIndex(player => player.id === playerId);

  if ( getPlayer === undefined ) {
    throw new Error( `Invalid player id ${ playerId }` );
  }
  const [ getArtist ] = state.artistMarket.slots.filter( artist => {
    return artist.artistId === artistId
    && artist.isOpen
    && artist.fame !== null
  })

  if ( getArtist === undefined ) {
    throw new Error( `Invalid artist id ${ artistId }` );
  }

  const getArtwork = state.artworkMarket.openArtworksByGenre[getArtist.genre]

  if(getArtwork === null || getArtwork.artwork.genre !== getArtist.genre) {
    throw new Error('Artwork genre must match artist genre')
  }

  const inputData: ApplyArtworkPurchaseInput = {
    player: { ...getPlayer },
    openArtwork: {...getArtwork},
    artistInitialFame: getArtist.initialFame,
    artistCurrentFame: getArtist.fame!,
    purchaseType: purchaseType,
    plazaVisitors: state.plazaVisitors,
    ...(targetInfluence !== undefined && { targetInfluence })
  }
  const artworkPurchasePaymentResult = applyArtworkPurchaseCostAndMoveVisitors(inputData)

  const visitorMovedEvents = getArtwork.visitors.reduce((acc,visitor) =>{
    const event = Object.freeze({
      type: 'VisitorMoved',
      visitorId: visitor.id,
      from: 'artwork',
      to: 'plaza'})

    acc.push(event)
    return acc;

  },[] as GameEvent[])
  const updatedPlayers = [...state.players.map(item => ({...item}))]
  updatedPlayers[getIndexPlayer] = artworkPurchasePaymentResult.player

  const events: GameEvent[] = [
    { type: 'ArtworkSelected',
      playerId: playerId,
      artistId: artistId,
      artworkId: artworkPurchasePaymentResult.openArtwork.artwork.id
    },
    ...(artworkPurchasePaymentResult.spentInfluence > 0
      ? [
          { type: 'InfluenceSpent', playerId, spentInfluence: artworkPurchasePaymentResult.spentInfluence } as const,
          { type: 'CoinsReceived', playerId, coinsReceived: artworkPurchasePaymentResult.coinsReceived } as const,
        ]
      : []),
    { type: 'CoinsSpent', playerId: playerId, paid: artworkPurchasePaymentResult.paid},
    ...visitorMovedEvents
  ]

  const updatedState = structuredClone({
    ...state,
    players: updatedPlayers,
    artworkMarket: {
      ...state.artworkMarket,
      openArtworksByGenre: {
        ...state.artworkMarket.openArtworksByGenre,
        [getArtist.genre]: artworkPurchasePaymentResult.openArtwork,
      },
    },
    plazaVisitors: artworkPurchasePaymentResult.plazaVisitors,
  })

  return freezeTransition(updatedState, events)

}
