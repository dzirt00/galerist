import { evaluateEndConditions } from './end-conditions.js'
import type { RewardId, SetupTicketColor } from './component-catalog.js'
import { type GameEvent, type GameTransition } from './game-events.js'
import { calculateIntermediateIncome } from './intermediate-income.js'
import { applyInfluenceGainToPlayer } from './influence-gain-award.js'
import { applyArtistFameEffects } from './artist-fame-effects.js'
import { applyTicketRewardToGameState } from './ticket-reward-to-game-state.js'
import { hireAssistants } from './hiring.js'
import { receiveOrder } from './receive-order.js'
import type { GameState, PlayerId } from './types.js'

export interface OrderRewardAction {
  readonly typeAction: 'REFRESH' | 'DECLINE' | 'ACCEPT_ORDER'
  readonly orderId?: string
  readonly orderSlot?: 1 | 2 | 3
  readonly requestedColor?: SetupTicketColor
  readonly replacementColorsByRequestedColor?: Readonly<Partial<Record<SetupTicketColor, SetupTicketColor>>>
}

export interface OrderRewardChoices {
  readonly visitorId?: string
  readonly fameArtistId?: string
  readonly requestedTicketColors?: readonly SetupTicketColor[]
  readonly replacementColorsByRequestedColor?: Readonly<Partial<Record<SetupTicketColor, SetupTicketColor>>>
  readonly orderActions?: readonly OrderRewardAction[]
}

/** Применяет один каталожный эффект; публичная команда владеет назначением помощника. */
export function applyOrderRewardEffect(
  state: Readonly<GameState>, playerId: PlayerId, reward: RewardId, choices: Readonly<OrderRewardChoices>,
): GameTransition<GameState> {
  if (!choices || typeof choices !== 'object' || Array.isArray(choices)) throw new Error('Invalid order reward choices')
  let next: GameState = structuredClone(state)
  const playerIndex = next.players.findIndex(player => player.id === playerId)
  const boardIndex = next.playerBoards.findIndex(board => board.playerId === playerId)
  if (playerIndex < 0 || boardIndex < 0) throw new Error('Invalid order reward player or playerBoard')
  const player = next.players[playerIndex]!
  const board = next.playerBoards[boardIndex]!
  const counts = {
    investors: board.gallery.visitors.filter(visitor => visitor.type === 'B').length,
    celebrities: board.gallery.visitors.filter(visitor => visitor.type === 'R').length,
    collectors: board.gallery.visitors.filter(visitor => visitor.type === 'W').length,
  }
  const events: GameEvent[] = []
  switch (reward) {
    case 'COINS': {
      const coinsReceived = calculateIntermediateIncome(counts).coins
      next = { ...next, players: next.players.map((item, index) => index === playerIndex
        ? { ...item, coins: item.coins + coinsReceived } : item) }
      events.push({ type: 'CoinsReceived', playerId, coinsReceived })
      break
    }
    case 'INFLUENCE': {
      const updated = applyInfluenceGainToPlayer(player, calculateIntermediateIncome(counts).influence)
      next = { ...next, players: next.players.map((item, index) => index === playerIndex ? { ...updated } : item) }
      events.push({ type: 'InfluenceReceived', playerId, gainedInfluence: updated.influence - player.influence })
      break
    }
    case 'FAME-C': {
      const artist = next.artistMarket.slots.find(item => item.artistId === choices.fameArtistId)
      if (!artist?.isOpen || artist.fame === null) throw new Error('Fame reward requires a selected open artist')
      const result = applyArtistFameEffects(next, playerId, artist.artistId, artist.fame + counts.collectors)
      const fame = result.state.artistMarket.slots.find(item => item.artistId === artist.artistId)!.fame!
      if (fame !== artist.fame) events.push({ type: 'ArtistFameIncreased', artistId: artist.artistId, previousFame: artist.fame, fame })
      next = result.state
      events.push(...result.events)
      break
    }
    case 'VISITOR-ANY':
    case 'VISITOR-BR':
    case 'VISITOR-BAG': {
      /** Для VISITOR-BR допускает только инвесторов и знаменитостей, для остальных наград — любой тип. */
      const eligible = (visitor: GameState['visitorBag']['visitors'][number]) =>
        reward !== 'VISITOR-BR' || visitor.type === 'B' || visitor.type === 'R'
      const plaza = next.plazaVisitors.filter(eligible)
      const from = reward !== 'VISITOR-BAG' && plaza.length > 0 ? 'plaza' : 'visitorBag'
      const source = from === 'plaza' ? plaza : next.visitorBag.visitors.filter(eligible)
      if (source.length === 0) break
      const visitor = source.find(item => item.id === choices.visitorId)
      if (!visitor) throw new Error('Selected visitor unavailable in permitted source')
      if (visitor.type === 'W' && counts.collectors >= 1 + player.soldArtworkCount) throw new Error('Collector capacity exceeded')
      const visitorBag = from === 'visitorBag'
        ? { visitors: next.visitorBag.visitors.filter(item => item.id !== visitor.id) } : next.visitorBag
      next = { ...next, visitorBag, artworkMarket: { ...next.artworkMarket, remainingVisitorBag: visitorBag },
        plazaVisitors: from === 'plaza' ? next.plazaVisitors.filter(item => item.id !== visitor.id) : next.plazaVisitors,
        playerBoards: next.playerBoards.map((item, index) => index === boardIndex
          ? { ...item, gallery: { ...item.gallery, visitors: [...item.gallery.visitors, visitor] } } : item) }
      events.push({ type: 'VisitorMoved', visitorId: visitor.id, from, to: 'gallery', playerId })
      break
    }
    case 'HIRE-FREE': {
      if (board.assistants.assistantOfficeIds.length >= 4 || board.assistants.assistantHireQueueIds.length === 0) break
      const result = hireAssistants({ player, officeAssistantIds: board.assistants.assistantOfficeIds,
        queue: board.assistants.assistantHireQueueIds.map(assistantId => ({ assistantId, cost: 0, reward: null })),
        count: 1, targetInfluence: null })
      next = { ...next, playerBoards: next.playerBoards.map((item, index) => index === boardIndex ? {
        ...item, assistants: { office: result.officeAssistantIds.length, assistantOfficeIds: result.officeAssistantIds,
          hireQueue: result.queue.length, assistantHireQueueIds: result.queue.map(entry => entry.assistantId) },
      } : item) }
      events.push({ type: 'AssistantsHired', countHiredAssistants: 1 })
      break
    }
    case 'ORDER-ACTION': {
      if (!Array.isArray(choices.orderActions) || choices.orderActions.length === 0 || choices.orderActions.length > 2) {
        throw new Error('Order reward requires a complete order action')
      }
      for (const action of choices.orderActions) {
        if (!action || typeof action !== 'object') throw new Error('Invalid order reward action')
        if (action.orderSlot !== undefined && action.orderSlot !== 1 && action.orderSlot !== 2 && action.orderSlot !== 3) {
          throw new Error('Invalid order reward action slot')
        }
        const result = receiveOrder(next, playerId, action.typeAction, action.orderId ?? null,
          action.orderSlot === undefined ? null : String(action.orderSlot), action.requestedColor ?? null,
          action.replacementColorsByRequestedColor)
        next = result.state
        events.push(...result.events)
      }
      const status = next.players[playerIndex]!.status
      if (status !== 'SUCCESS' && status !== 'REFUSAL') throw new Error('Order reward action must finish with acceptance or decline')
      break
    }
    case 'TICKET-ANY':
    case 'TICKET-DIFF2':
    case 'TICKET-B':
    case 'TICKET-R': {
      const colors = reward === 'TICKET-B' ? ['B'] as const : reward === 'TICKET-R' ? ['R'] as const : choices.requestedTicketColors
      if (!Array.isArray(colors) || colors.length !== (reward === 'TICKET-DIFF2' ? 2 : 1)) {
        throw new Error('Invalid requested ticket colors for order reward')
      }
      const result = applyTicketRewardToGameState(next, { playerId, requestedColors: colors,
        ...(choices.replacementColorsByRequestedColor === undefined ? {} : {
          replacementColorsByRequestedColor: choices.replacementColorsByRequestedColor,
        }) })
      next = result.state
      events.push(...result.events)
      break
    }
    default: throw new Error('Unsupported order reward')
  }
  return evaluateEndConditions(state, next, events)
}
