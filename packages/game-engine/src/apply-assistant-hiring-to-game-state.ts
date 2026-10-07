import type { GameState,  PlayerId } from "./types.js";
import { freezeTransition, type GameEvent, type GameTransition } from "./game-events.js";
import { deepFreeze, type HireQueue, setupComponentCatalog, type SetupTicketColor } from "./component-catalog.js";
import { hireAssistants, type HireQueueEntry } from "./hiring.js";
import { applyTicketReward, type TicketRewardApplicationInput } from "./ticket-reward-to-game-state.js";
import { applyInfluenceGainToPlayer } from "./influence-gain-award.js";
import { canTriggerGameEnd, triggerGameEnd } from "./game-lifecycle.js";

export interface ApplyAssistantHiringToGameStateRequest {
  readonly playerId: PlayerId
  readonly countAssistants: number
  readonly targetInfluence?: number
  readonly requestedTicketColors?: readonly SetupTicketColor[]
  readonly replacementColorsByRequestedColor?: Readonly<Partial<Record<SetupTicketColor, SetupTicketColor>>>
}
const TOTAL_COUNT_HIRE_QUEUE = 8
export function applyAssistantHiringToGameState(
  state: GameState,
  request: ApplyAssistantHiringToGameStateRequest
): GameTransition<GameState> {


  if(state.phase !== 'regular_play' && state.phase !== 'ending_current_round' && state.phase !== 'final_round') {
    throw new Error('Invalid phase')
  }

  let stateCopy = structuredClone(state)
  const playerIndex = stateCopy.players.findIndex(el => el.id === request.playerId)
  if (playerIndex === -1) throw new Error('Invalid player')
  let player = stateCopy.players[ playerIndex ]
  if(player === undefined) throw new Error('Invalid player')
  const boardIndex = stateCopy.playerBoards.findIndex(el => el.playerId === request.playerId)
  if (boardIndex === -1) throw new Error('Invalid board')
  let boardPlayer = stateCopy.playerBoards[boardIndex]
  if(boardPlayer === undefined) throw new Error('Invalid board')
  const assistantOfficeIds = boardPlayer.assistants.assistantOfficeIds.map(el => el)
  const assistantHireQueueIds = boardPlayer.assistants.assistantHireQueueIds.map(el => el)
  const componentCatalogHireQueue =  setupComponentCatalog.hireQueue
  const visitorGallery = {...boardPlayer.gallery.visitors}
  let ticketOffice = {...stateCopy.ticketOffice}
  let ticketDiscard = {...stateCopy.ticketDiscard}
  let events: GameEvent[] = []
  let hireQueuePlayer = boardPlayer.assistants.hireQueue
  let bonusAssistant: HireQueue[] = []

  for ( let i = 0; i < assistantHireQueueIds.length; i++ ) {
    const index = TOTAL_COUNT_HIRE_QUEUE - hireQueuePlayer + i
    const hireQueue = componentCatalogHireQueue[ index ]
    if(hireQueue === undefined) throw new Error('invalid hireQueue')
    bonusAssistant.push( { ...hireQueue })
  }

  const hireQueueEntry = bonusAssistant.reduce((acc,el) =>{
    const assistant = {
      assistantId: assistantHireQueueIds.shift()!,
      cost: el.cost,
      reward: el.reward
    }
    acc.push(assistant)
    return acc
  },[] as HireQueueEntry[])

  const targetInfluence = request.targetInfluence === undefined ? null : request.targetInfluence
  const hireAssistantsInput = deepFreeze({
    player: {
      ...structuredClone(player)
    },
    officeAssistantIds: [...boardPlayer.assistants.assistantOfficeIds],
    queue: [...hireQueueEntry],
    count: request.countAssistants,
    targetInfluence: targetInfluence
  })

  const hireAssistantsResult = hireAssistants(hireAssistantsInput)

  player = {
    ...player,
    ...hireAssistantsResult.player
  }

  if(player.influence !== state.players[playerIndex]!.influence) {
    const spentInfluence = state.players[playerIndex]!.influence - player.influence
    events.push({ type: 'InfluenceSpent', playerId: player.id, spentInfluence: spentInfluence })
    events.push({ type: 'CoinsReceived', playerId: player.id, coinsReceived: player.coins - state.players[playerIndex]!.coins + hireAssistantsResult.totalCost })
  }

  boardPlayer = {
    ...boardPlayer,
    assistants: {
      office: hireAssistantsResult.officeAssistantIds.length,
      hireQueue : hireAssistantsResult.queue.length,
      assistantOfficeIds: [...hireAssistantsResult.officeAssistantIds],
      assistantHireQueueIds: [...hireAssistantsResult.queue.map(el => el.assistantId)]
    }
  }
   events.push({ type: 'AssistantsHired', countHiredAssistants: hireAssistantsResult.hired.length },  { type: 'CoinsSpent', playerId: player.id, paid: hireAssistantsResult.totalCost })
  const bonusesAfterHire =  (hireAssistantsResult.hired.filter(el => el.reward !== null)).map(el => el.reward)


  bonusesAfterHire.forEach((el) => {
    if(player === undefined) throw new Error('Invalid player')

    if(el === 'TICKET-ANY' || el === 'TICKET-B' || el === 'TICKET-R'){
      let requestedColors: SetupTicketColor[] = []
      if(el === 'TICKET-B') requestedColors.push('B')
      if(el === 'TICKET-R') requestedColors.push('R')
      if(el === 'TICKET-ANY') {
        if(request.requestedTicketColors === undefined || request.requestedTicketColors.length === 0 || request.requestedTicketColors.length > 1){
          throw new Error('invalid requestedTicketColors')
        }
        requestedColors.push(...request.requestedTicketColors)
      }
      const inputApplyTicketReward: TicketRewardApplicationInput = {
        playerId: player.id,
        requestedColors: requestedColors,
        player: player,
        ticketOffice: ticketOffice,
        ticketDiscard: ticketDiscard,
        intermediateScoringStatus: stateCopy.intermediateScoringStatus,
        ...(request.replacementColorsByRequestedColor && {
          replacementColorsByRequestedColor: request.replacementColorsByRequestedColor
        })
      };
      const  ticketRewardApplicationResult = applyTicketReward(inputApplyTicketReward)
      player = {
        ...ticketRewardApplicationResult.player
      }
      ticketOffice = {...ticketRewardApplicationResult.ticketOffice}
      ticketDiscard = {...ticketRewardApplicationResult.ticketDiscard}
      stateCopy = {
        ...stateCopy,
        intermediateScoringStatus: ticketRewardApplicationResult.intermediateScoringStatus
      }

      events.push(...ticketRewardApplicationResult.events)

    }
    if(el === 'INFLUENCE') {
      const influence = boardPlayer.gallery.visitors.reduce((acc,el) =>{
        (el.type === 'W' )
          ? acc += 1
          : (el.type === 'R')
            ? acc += 2
            : acc += 0
        return acc
      },0)
      const currentInfluence = player.influence
      const updatePlayer = applyInfluenceGainToPlayer(player,influence)

      player = {
        ...updatePlayer
      }

      if (updatePlayer.influence - currentInfluence > 0) {
        events.push({ type: 'InfluenceReceived', playerId: player.id, gainedInfluence: updatePlayer.influence - currentInfluence })
      }



    }
    if(el === 'COINS') {
      const coins = boardPlayer.gallery.visitors.reduce((acc,el) =>{
        (el.type === 'W' )
          ? acc += 1
          : (el.type === 'B')
            ? acc += 2
            : acc += 0
        return acc
      },0)

      player = {
        ...player,
        coins: player.coins + coins
      }
      if(coins > 0) {
        events.push({  type: 'CoinsReceived',  playerId: player.id,  coinsReceived: coins })
      }
    }
  })

  stateCopy = {
    ...stateCopy,
    players: stateCopy.players.map((playerItem, index) =>
      index === playerIndex
        ? { ...playerItem, ...player }
        : playerItem
    ),
    playerBoards: stateCopy.playerBoards.map((pb, index) =>
    index === boardIndex ? { ...pb,...boardPlayer } : pb
    ),
    ticketOffice: {...ticketOffice},
    ticketDiscard: {...ticketDiscard},
  }
  let stateTicketCount: number = 0
  let copyStateTicketCount: number = 0
  for(let el of Object.values(state.ticketOffice.ticketsByColor)) {
    stateTicketCount += el
  }
  for(let el of Object.values(stateCopy.ticketOffice.ticketsByColor)) {
    copyStateTicketCount += el
  }

  if(!state.ticketOfficeEmptyReached && stateTicketCount !== 0 && copyStateTicketCount === 0) {
    stateCopy = {
      ...stateCopy,
      ticketOfficeEmptyReached: true
    }
    events.push({type: 'EndConditionReached'})
  }
  if(stateCopy.phase === 'regular_play' && canTriggerGameEnd(stateCopy)) {
    const endingCurrentRoundGameState = triggerGameEnd(stateCopy)
    events.push(...endingCurrentRoundGameState.events)
    stateCopy = {
      ...stateCopy,
      phase: endingCurrentRoundGameState.state.phase,
      endTriggeredRound: endingCurrentRoundGameState.state.endTriggeredRound,
    }
  }

  return freezeTransition(stateCopy,events)

}
