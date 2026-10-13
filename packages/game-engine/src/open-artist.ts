import { setupComponentCatalog, type SetupTicketColor } from './component-catalog.js'
import { applyArtistFameEffects } from './artist-fame-effects.js'
import { freezeTransition, type GameEvent, type GameTransition } from './game-events.js'
import { canTriggerGameEnd, triggerGameEnd } from './game-lifecycle.js'
import { calculateIntermediateIncome } from './intermediate-income.js'
import { applyInfluenceGainToPlayer } from './influence-gain-award.js'
import { applyTicketRewardToGameState } from './ticket-reward-to-game-state.js'
import type { GameState, PlayerId } from './types.js'

export interface OpenArtistRequest {
  readonly playerId: PlayerId
  readonly artistId: string
  readonly visitorId?: string
  readonly fameArtistId?: string
  readonly requestedTicketColors?: readonly SetupTicketColor[]
  readonly replacementColorsByRequestedColor?: Readonly<Partial<Record<SetupTicketColor, SetupTicketColor>>>
}

/** ARTIST-001/002: открытие → бонус → коллекционер → контракт, атомарно. */
export function openArtist(state: Readonly<GameState>, request: Readonly<OpenArtistRequest>): GameTransition<GameState> {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid opening request')
  const playerIndex = state.players.findIndex(player => player.id === request.playerId)
  const boardIndex = state.playerBoards.findIndex(board => board.playerId === request.playerId)
  if (playerIndex < 0 || boardIndex < 0) throw new Error('Invalid opening player or playerBoard')
  if (!['regular_play', 'ending_current_round', 'final_round'].includes(state.phase)) {
    throw new Error('Opening requires a playing phase')
  }
  const artist = state.artistMarket.slots.find(slot => slot.artistId === request.artistId)
  const prepared = state.artistSetup.slots.find(slot => slot.artistId === request.artistId)
  if (!artist || !prepared || artist.isOpen || prepared.isOpen) throw new Error('Opening requires a closed artist')
  if (state.playerBoards[boardIndex]!.contract !== null) throw new Error('Player already has an active contract')
  const bonus = prepared.bonus
  if (!bonus || !setupComponentCatalog.artistBonuses.some(item => item.id === bonus.id && item.reward === bonus.reward)) {
    throw new Error('Closed artist must have a prepared bonus')
  }
  const signatureTokenId = prepared.availableSignatureTokenIds[0]
  if (!signatureTokenId || !signatureTokenId.startsWith(`${artist.artistId}-SIG-`)) throw new Error('Artist signature unavailable')
  if (artist.category === 'red' && prepared.collector?.type !== 'W') throw new Error('Red artist collector unavailable')

  // Отдельное дерево не меняет даже заморозку объектов входного снимка при позднем отказе.
  let next: GameState = structuredClone(state)
  next = {
    ...next,
    artistMarket: { ...next.artistMarket, slots: next.artistMarket.slots.map(slot => slot.artistId === artist.artistId
      ? { ...slot, isOpen: true, fame: slot.initialFame } : slot) },
    artistSetup: { ...next.artistSetup, slots: next.artistSetup.slots.map(slot => slot.artistId === artist.artistId
      ? { ...slot, isOpen: true, fame: slot.initialFame } : slot) },
  }
  const events: GameEvent[] = [{ type: 'ArtistOpened', artistId: artist.artistId }]
  const gallery = next.playerBoards[boardIndex]!.gallery
  let player = next.players[playerIndex]!
  const counts = {
    investors: gallery.visitors.filter(visitor => visitor.type === 'B').length,
    celebrities: gallery.visitors.filter(visitor => visitor.type === 'R').length,
    collectors: gallery.visitors.filter(visitor => visitor.type === 'W').length,
  }
  if (bonus.reward === 'COINS' || bonus.reward === 'INFLUENCE') {
    const income = calculateIntermediateIncome(counts)
    if (bonus.reward === 'COINS') {
      player = { ...player, coins: player.coins + income.coins }
      if (income.coins > 0) events.push({ type: 'CoinsReceived', playerId: player.id, coinsReceived: income.coins })
    } else {
      const previousInfluence = player.influence
      player = applyInfluenceGainToPlayer(player, income.influence)
      if (player.influence > previousInfluence) events.push({ type: 'InfluenceReceived', playerId: player.id,
        gainedInfluence: player.influence - previousInfluence })
    }
    next = { ...next, players: next.players.map((item, index) => index === playerIndex ? player : item) }
  } else if (bonus.reward === 'TICKET-DIFF2') {
    if (!Array.isArray(request.requestedTicketColors) || request.requestedTicketColors.length !== 2) {
      throw new Error('Artist bonus requires two different ticket colors')
    }
    const reward = applyTicketRewardToGameState(next, {
      playerId: player.id, requestedColors: request.requestedTicketColors,
      ...(request.replacementColorsByRequestedColor === undefined ? {} : {
        replacementColorsByRequestedColor: request.replacementColorsByRequestedColor,
      }),
    })
    next = reward.state
    events.push(...reward.events)
  } else if (bonus.reward === 'VISITOR-ANY') {
    const from = next.plazaVisitors.length > 0 ? 'plaza' : 'visitorBag'
    const source = from === 'plaza' ? next.plazaVisitors : next.visitorBag.visitors
    // Исчерпанный запас пропускается, но некорректный выбор в непустом источнике отклоняется.
    if (source.length > 0) {
      const visitor = source.find(item => item.id === request.visitorId)
      if (!visitor) throw new Error('Selected visitor unavailable in permitted source')
      if (visitor.type === 'W' && counts.collectors >= 1 + player.soldArtworkCount) {
        throw new Error('Collector capacity exceeded')
      }
      const visitorBag = from === 'visitorBag'
        ? { visitors: next.visitorBag.visitors.filter(item => item.id !== visitor.id) } : next.visitorBag
      next = {
        ...next, visitorBag,
        artworkMarket: { ...next.artworkMarket, remainingVisitorBag: visitorBag },
        plazaVisitors: from === 'plaza' ? next.plazaVisitors.filter(item => item.id !== visitor.id) : next.plazaVisitors,
        playerBoards: next.playerBoards.map((board, index) => index === boardIndex
          ? { ...board, gallery: { ...board.gallery, visitors: [...board.gallery.visitors, visitor] } } : board),
      }
      events.push({ type: 'VisitorMoved', visitorId: visitor.id, from, to: 'gallery', playerId: player.id })
    }
  } else if (bonus.reward === 'FAME-C') {
    const target = next.artistMarket.slots.find(slot => slot.artistId === request.fameArtistId)
    if (!target?.isOpen || target.fame === null) throw new Error('Fame bonus requires a selected open artist')
    const reward = applyArtistFameEffects(next, player.id, target.artistId, target.fame + counts.collectors)
    const fame = reward.state.artistMarket.slots.find(slot => slot.artistId === target.artistId)!.fame!
    if (fame !== target.fame) events.push({ type: 'ArtistFameIncreased', artistId: target.artistId,
      previousFame: target.fame, fame })
    next = reward.state
    events.push(...reward.events)
  } else {
    throw new Error('Unsupported prepared artist bonus')
  }
  next = { ...next, artistSetup: { ...next.artistSetup, slots: next.artistSetup.slots.map(slot =>
    slot.artistId === artist.artistId ? { ...slot, bonus: null } : slot) } }
  events.push({ type: 'ArtistBonusClaimed', playerId: player.id, artistId: artist.artistId, bonusId: bonus.id })
  if (artist.category === 'red') {
    const collector = next.artistSetup.slots.find(slot => slot.artistId === artist.artistId)!.collector!
    next = {
      ...next, plazaVisitors: [...next.plazaVisitors, collector],
      artistSetup: { ...next.artistSetup, slots: next.artistSetup.slots.map(slot =>
        slot.artistId === artist.artistId ? { ...slot, collector: null } : slot) },
    }
    events.push({ type: 'VisitorMoved', visitorId: collector.id, from: 'artist', to: 'plaza', artistId: artist.artistId })
  }
  next = {
    ...next,
    artistSetup: { ...next.artistSetup, slots: next.artistSetup.slots.map(slot => slot.artistId === artist.artistId
      ? { ...slot, availableSignatureTokenIds: slot.availableSignatureTokenIds.slice(1) } : slot) },
    playerBoards: next.playerBoards.map((board, index) => index === boardIndex
      ? { ...board, contract: { artistId: artist.artistId, signatureTokenId } } : board),
  }
  events.push({ type: 'ContractSigned', playerId: player.id, artistId: artist.artistId, signatureTokenId })
  if (next.phase === 'regular_play' && canTriggerGameEnd(next)) {
    const end = triggerGameEnd(next)
    next = end.state
    events.push(...end.events)
  }
  return freezeTransition(next, events)
}
