import { setupComponentCatalog, type SetupTicketColor } from './component-catalog.js'
import { freezeTransition, type GameEvent, type GameTransition } from './game-events.js'
import { canTriggerGameEnd, triggerGameEnd } from './game-lifecycle.js'
import { applyInfluenceGainToPlayer } from './influence-gain-award.js'
import { applyAdditionalFameSpend } from './influence-fame-spending-award.js'
import { applyTicketReward } from './ticket-reward-to-game-state.js'
import { calculateArtworkSaleValue } from './artwork-sale-value.js'
import type { Gallery } from './player-boards.js'
import type { GameState, PlayerId } from './types.js'

export interface AdvertisingArtistRequest {
  readonly playerId: PlayerId
  readonly artistId: string
  readonly visitorId?: string
  readonly targetInfluence?: number
  readonly requestedTicketColors?: readonly SetupTicketColor[]
  readonly replacementColorsByRequestedColor?: Readonly<Partial<Record<SetupTicketColor, SetupTicketColor>>>
}

/** Атомарная реклама открытого художника по PROMO-001/PROMO-002. */
export function advertisingArtist(
  state: Readonly<GameState>,
  request: Readonly<AdvertisingArtistRequest>,
): GameTransition<GameState> {
  if (request === null || typeof request !== 'object') throw new Error('Invalid promotion request')
  if (!['regular_play', 'ending_current_round', 'final_round'].includes(state.phase)) {
    throw new Error('Promotion requires a playing phase')
  }
  const playerIndex = state.players.findIndex(player => player.id === request.playerId)
  const boardIndex = state.playerBoards.findIndex(board => board.playerId === request.playerId)
  let player = state.players[playerIndex]
  const board = state.playerBoards[boardIndex]
  const artist = state.artistMarket.slots.find(slot => slot.artistId === request.artistId)
  if (!player || !board) throw new Error('Invalid promotion player or playerBoard')
  if (!artist || !artist.isOpen || artist.fame === null) throw new Error('Promotion requires an open artist')
  if (!Number.isSafeInteger(artist.promotionLevel) || artist.promotionLevel < 0 || artist.promotionLevel >= 5) {
    throw new Error('No next promotion level')
  }
  if (!Number.isSafeInteger(player.soldArtworkCount) || player.soldArtworkCount < 0) {
    throw new Error('Invalid soldArtworkCount')
  }

  const nextLevel = (artist.promotionLevel + 1) as 1 | 2 | 3 | 4 | 5
  const tokenIdsByLevel = { ...state.promotionSupply.tokenIdsByLevel }
  const selectedTokenId = tokenIdsByLevel[nextLevel][0]
  const token = setupComponentCatalog.promotionTokens.find(token => token.id === selectedTokenId)
  if (!token || token.level !== nextLevel) throw new Error('Next promotion token is unavailable')
  const promotionTokenId = token.id
  if (player.influence < token.influenceCost) throw new Error('Insufficient influence for promotion')
  tokenIdsByLevel[nextLevel] = tokenIdsByLevel[nextLevel].slice(1)
  if (artist.promotionTokenId !== null) {
    const oldToken = setupComponentCatalog.promotionTokens.find(token => token.id === artist.promotionTokenId)
    if (!oldToken || oldToken.level !== artist.promotionLevel) throw new Error('Invalid installed promotion token')
    if (Object.values(tokenIdsByLevel).some(ids => ids.includes(oldToken.id))) {
      throw new Error('Installed promotion token is also in supply')
    }
    tokenIdsByLevel[oldToken.level] = [...tokenIdsByLevel[oldToken.level], oldToken.id]
  }
  player = { ...player, influence: player.influence - token.influenceCost }
  const events: GameEvent[] = [
    { type: 'InfluenceSpent', playerId: player.id, spentInfluence: token.influenceCost },
    { type: 'ArtistPromoted', playerId: player.id, artistId: artist.artistId,
      previousPromotionLevel: artist.promotionLevel, promotionLevel: nextLevel, promotionTokenId },
  ]
  let ticketOffice = state.ticketOffice
  let ticketDiscard = state.ticketDiscard
  let intermediateScoringStatus = state.intermediateScoringStatus
  let plazaVisitors = state.plazaVisitors
  let visitorBag = state.visitorBag
  let gallery = board.gallery
  if (token.reward === 'TICKET-ANY' || token.reward === 'TICKET-DIFF2') {
    const requiredCount = token.reward === 'TICKET-ANY' ? 1 : 2
    if (!Array.isArray(request.requestedTicketColors) || request.requestedTicketColors.length !== requiredCount) {
      throw new Error(`Promotion requires ${requiredCount} ticket colors`)
    }
    const reward = applyTicketReward({
      playerId: player.id, player, ticketOffice, ticketDiscard, intermediateScoringStatus,
      requestedColors: request.requestedTicketColors,
      ...(request.replacementColorsByRequestedColor === undefined ? {} : {
        replacementColorsByRequestedColor: request.replacementColorsByRequestedColor,
      }),
    })
    player = reward.player
    ticketOffice = reward.ticketOffice
    ticketDiscard = reward.ticketDiscard
    intermediateScoringStatus = reward.intermediateScoringStatus
    events.push(...reward.events)
  } else if (token.reward === 'INFLUENCE') {
    const gainedInfluence = gallery.visitors.reduce((sum, visitor) =>
      sum + (visitor.type === 'R' ? 2 : visitor.type === 'W' ? 1 : 0), 0)
    const previousInfluence = player.influence
    player = applyInfluenceGainToPlayer(player, gainedInfluence)
    const actualGain = player.influence - previousInfluence
    if (actualGain > 0) events.push({ type: 'InfluenceReceived', playerId: player.id, gainedInfluence: actualGain })
  } else if (token.reward === 'COINS') {
    const coinsReceived = gallery.visitors.reduce((sum, visitor) =>
      sum + (visitor.type === 'B' ? 2 : visitor.type === 'W' ? 1 : 0), 0)
    player = { ...player, coins: player.coins + coinsReceived }
    if (coinsReceived > 0) events.push({ type: 'CoinsReceived', playerId: player.id, coinsReceived })
  } else if (token.reward === 'VISITOR-ANY') {
    const from = plazaVisitors.length > 0 ? 'plaza' : 'visitorBag'
    const source = from === 'plaza' ? plazaVisitors : visitorBag.visitors
    const visitor = source.find(visitor => visitor.id === request.visitorId)
    if (!visitor) throw new Error('Selected visitor is unavailable in the permitted source')
    if (visitor.type === 'W' && gallery.visitors.filter(visitor => visitor.type === 'W').length >= 1 + player.soldArtworkCount) {
      throw new Error('Collector capacity exceeded')
    }
    if (from === 'plaza') plazaVisitors = plazaVisitors.filter(item => item.id !== visitor.id)
    else visitorBag = { ...visitorBag, visitors: visitorBag.visitors.filter(item => item.id !== visitor.id) }
    gallery = { ...gallery, visitors: [...gallery.visitors, visitor] }
    events.push({ type: 'VisitorMoved', visitorId: visitor.id, from, to: 'gallery', playerId: player.id })
  }
  const baseFameGain = 1 + gallery.visitors.filter(visitor => visitor.type === 'W').length
  const baseFame = Math.min(19, artist.fame + baseFameGain)
  let fame = baseFame
  if (baseFame !== artist.fame) events.push({ type: 'ArtistFameIncreased', artistId: artist.artistId, previousFame: artist.fame, fame: baseFame })
  if (request.targetInfluence !== undefined) {
    if (baseFame >= 19) throw new Error('Additional fame is unavailable at maximum fame')
    const previousInfluence = player.influence
    const result = applyAdditionalFameSpend({
      player, artist: { artistId: artist.artistId, fame: baseFame }, targetInfluence: request.targetInfluence,
      fameIncrease: { kind: 'eligible', source: 'promotion', baseFameGain },
    })
    player = result.player
    fame = Math.min(19, result.artist.fame)
    events.push({ type: 'InfluenceSpent', playerId: player.id, spentInfluence: previousInfluence - player.influence },
      { type: 'ArtistFameIncreased', artistId: artist.artistId, previousFame: baseFame, fame })
  }
  const saleValue = calculateArtworkSaleValue(artist.artistId, fame)
  const becameSuperstar = !artist.isSuperstar && fame === 19
  const masterpieceEvents: GameEvent[] = []
  let saleValuesChanged = false
  const playerBoards = state.playerBoards.map((playerBoard, index) => {
    const nextGallery = index === boardIndex ? gallery : playerBoard.gallery
    const updateArtwork = (artwork: Gallery['artworkSlots'][number]): Gallery['artworkSlots'][number] => {
      if (!artwork || artwork.artistId !== artist.artistId) return artwork
      if (artwork.saleValue !== saleValue) saleValuesChanged = true
      if (becameSuperstar && !artwork.isMasterpiece) {
        masterpieceEvents.push({ type: 'ArtworkBecameMasterpiece', playerId: playerBoard.playerId, artworkId: artwork.artworkId })
      }
      return { ...artwork, saleValue, isMasterpiece: artwork.isMasterpiece || becameSuperstar }
    }
    const artworkSlots: Gallery['artworkSlots'] = [
      updateArtwork(nextGallery.artworkSlots[0]), updateArtwork(nextGallery.artworkSlots[1]),
      updateArtwork(nextGallery.artworkSlots[2]), updateArtwork(nextGallery.artworkSlots[3]),
    ]
    return { ...playerBoard, gallery: { ...nextGallery, artworkSlots } }
  })
  if (saleValuesChanged) events.push({ type: 'ArtworkSaleValuesChanged', artistId: artist.artistId, saleValue })
  if (becameSuperstar) {
    player = { ...player, coins: player.coins + 5 }
    events.push({ type: 'ArtistBecameSuperstar', artistId: artist.artistId },
      { type: 'CoinsReceived', playerId: player.id, coinsReceived: 5 })
  }
  events.push(...masterpieceEvents)
  const players = [...state.players]
  players[playerIndex] = player
  let nextState: GameState = {
    ...state, players, playerBoards, ticketOffice, ticketDiscard, intermediateScoringStatus,
    plazaVisitors, visitorBag,
    artworkMarket: visitorBag === state.visitorBag
      ? state.artworkMarket
      : { ...state.artworkMarket, remainingVisitorBag: visitorBag },
    promotionSupply: { tokenIdsByLevel },
    artistMarket: { ...state.artistMarket, slots: state.artistMarket.slots.map(slot => slot.artistId === artist.artistId
      ? { ...slot, promotionLevel: nextLevel, promotionTokenId, fame, isSuperstar: slot.isSuperstar || becameSuperstar } : slot) },
  }
  if (nextState.phase === 'regular_play' && canTriggerGameEnd(nextState)) {
    const end = triggerGameEnd(nextState)
    nextState = end.state
    events.push(...end.events)
  }
  return freezeTransition(nextState, events)
}
