import type {
  EndingCurrentRoundGameState,
  EndingSequenceGameState,
  FinalRoundGameState,
  FinalScoringGameState,
  GameState, PlayerState,
  RegularPlayGameState,
} from './types.js'
import {
  freezeTransition, type GameEvent,
  type GameTransition,
} from './game-events.js'
import { getFirstPlayerIndex } from './turn-order.js'
import type { PlayerBoard } from "./player-boards.js";
import { applyIntermediateIncomeToPlayers, type IntermediateIncomeAwardInput } from "./intermediate-income-award.js";

/** Начинает обычную игру по TURN-001 и выбирает первого игрока по ADR-001. */

function arraysEqual  (a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((val, i) => val === b[i]);
}

function sortedPlayers (playersIds: string[]): string[] {
  return playersIds.sort( ( a, b ) => {
    if ( a > b ) return 1;
    if ( a < b ) return -1;
    return 0;
  } )
}

function prepareIntermediateIncomeEntries(
  players:  readonly PlayerState[],
  playerBoards:  readonly PlayerBoard[]
): IntermediateIncomeAwardInput[]{
  const sortPlayersIds = sortedPlayers(players.reduce((acc,player) => {
    acc.push(player.id)
    return acc;
  },[] as string[]))

  const sortPlayersIdsFromGallery = sortedPlayers(playerBoards.reduce( (acc,playerBoard) => {
    acc.push(playerBoard.playerId)
    return acc;
  },[] as string[]))

  if(!arraysEqual(sortPlayersIds, sortPlayersIdsFromGallery)){
    throw new Error( 'Invalid players ID' )
  }

  return players.reduce((accData,player) => {
    const [visitors] = playerBoards.filter(playerBoard => playerBoard.playerId === player.id)
    const visitorsInGallery = visitors!.gallery.visitors.reduce((accVisitor,galleryVisitor) =>{
      if(galleryVisitor.type === 'W') accVisitor.collectors +=1
      if(galleryVisitor.type === 'B') accVisitor.investors +=1
      if(galleryVisitor.type === 'R') accVisitor.celebrities +=1

      return accVisitor
    },{investors: 0,celebrities: 0,collectors: 0})

    const data = {
      player,
      visitors: visitorsInGallery
    }

    accData.push(data)
    return accData;

  },[] as IntermediateIncomeAwardInput[])
}

export function startGame(state: GameState): GameTransition<RegularPlayGameState> {
  if (state.phase !== 'setup') {
    throw new Error('Game can only be started from setup')
  }
  if (state.setupStage !== 'complete') {
    throw new Error('Game can only be started after setup is complete')
  }

  const firstPlayerIndex = getFirstPlayerIndex(
    state.config.seed,
    state.players.length,
  )
  const firstPlayerId = state.players[firstPlayerIndex]!.id

  const {
    setupStage: _setupStage,
    startingLocationSelectionOrder: _selectionOrder,
    currentStartingLocationPlayerId: _currentChooser,
    availableStartingLocationIds: _availableLocations,
    ...stateWithoutSetupSelection
  } = state
  void _setupStage
  void _selectionOrder
  void _currentChooser
  void _availableLocations

  const regularPlayState: RegularPlayGameState = Object.freeze({
    ...stateWithoutSetupSelection,
    status: 'in_progress',
    phase: 'regular_play',
    round: 1,
    activePlayerId: firstPlayerId,
    firstPlayerId,
  })

  return freezeTransition(regularPlayState, [
    { type: 'GameStarted', gameId: regularPlayState.id },
    { type: 'RoundStarted', round: 1 },
    { type: 'TurnStarted', playerId: firstPlayerId },
  ])
}

/** Передаёт ход по TURN-005 и меняет раунд или фазу по TURN-006 и END-003–END-005. */
export function advanceTurn(state: RegularPlayGameState): GameTransition<RegularPlayGameState>
export function advanceTurn(
  state: EndingCurrentRoundGameState,
): GameTransition<EndingCurrentRoundGameState | FinalRoundGameState>
export function advanceTurn(
  state: FinalRoundGameState,
): GameTransition<FinalRoundGameState | FinalScoringGameState>
export function advanceTurn(state: EndingSequenceGameState): GameTransition<EndingSequenceGameState>
export function advanceTurn( state: GameState): GameTransition<GameState>
export function advanceTurn(state: GameState): GameTransition<GameState> {
  if (state.status !== 'in_progress') {
    throw new Error('Turns can only be advanced while game is in progress')
  }
  if (
    state.phase !== 'final_round'
    && state.phase !== 'ending_current_round'
    && state.phase !== 'regular_play'
  ) {
    throw new Error('Turns can only be advanced while game is in progress')
  }

  const currentIndex = state.players.findIndex(player => player.id === state.activePlayerId)
  if (currentIndex === -1) {
    throw new Error('Active player must belong to the game')
  }
  let updatePlayersState:  readonly Readonly<PlayerState>[] | null = null
  let eventsIntermediateIncomeAwarded:GameEvent[] | null = null
  let intermediateScoringStatus = state.intermediateScoringStatus

  if(intermediateScoringStatus === 'pending') {
    const intermediateIncomeAwardInput = prepareIntermediateIncomeEntries(state.players,state.playerBoards)
    updatePlayersState = applyIntermediateIncomeToPlayers(intermediateIncomeAwardInput)
    eventsIntermediateIncomeAwarded = (state.players.reduce((acc,player) => {
      acc.push({
        type: 'IntermediateIncomeAwarded',
        playerId: player.id
      })
      return acc;
    },[] as GameEvent[]))

    intermediateScoringStatus = 'completed'

  }
  const addEventsIntermediateIncomeAwardInput = (intermediateScoringStatus === 'completed' && state.intermediateScoringStatus === 'pending' && eventsIntermediateIncomeAwarded !== null)
    ? [...eventsIntermediateIncomeAwarded]
    : []

  const updatePlayers = (updatePlayersState === null) ? state.players : updatePlayersState;

  const nextPlayer = state.players[(currentIndex + 1) % state.players.length]!.id
  const isNewRound = nextPlayer === state.firstPlayerId
  const nextRoundNumber = isNewRound ? state.round + 1 : state.round
  const eventTurnEnded = { type: 'TurnEnded', playerId: state.activePlayerId } satisfies GameEvent
  const eventTurnStarted = { type: 'TurnStarted', playerId: nextPlayer } satisfies GameEvent
  const eventRoundEnded =  { type: 'RoundEnded', round: state.round } satisfies GameEvent
  const eventRoundStarted =  { type: 'RoundStarted', round: nextRoundNumber } satisfies GameEvent
  const events = (isNewRound)
    ? [eventTurnEnded, ...addEventsIntermediateIncomeAwardInput,eventRoundEnded, eventRoundStarted, eventTurnStarted]
    : [eventTurnEnded, ...addEventsIntermediateIncomeAwardInput, eventTurnStarted]

  if (state.phase === 'final_round') {
    if (isNewRound) {
      return freezeTransition({
        ...state,
        players: updatePlayers,
        phase: 'final_scoring',
        activePlayerId: null,
        endTriggeredRound: state.endTriggeredRound,
        intermediateScoringStatus: intermediateScoringStatus,
        finalInfluenceScored: false
      },[ eventTurnEnded, ...addEventsIntermediateIncomeAwardInput, eventRoundEnded, { type: 'FinalScoringStarted'}
      ])
    }
    return freezeTransition({
      ...state,
      players: updatePlayers,
      round: nextRoundNumber,
      phase: 'final_round',
      activePlayerId: nextPlayer,
      endTriggeredRound: state.endTriggeredRound,
      intermediateScoringStatus: intermediateScoringStatus,
    },events)
  }

  if (state.phase === 'ending_current_round') {
    if (isNewRound) {
      return freezeTransition({
        ...state,
        players: updatePlayers,
        round: nextRoundNumber,
        phase: 'final_round',
        activePlayerId: nextPlayer,
        endTriggeredRound: state.endTriggeredRound,
        intermediateScoringStatus: intermediateScoringStatus,
      },events)
    }
    return freezeTransition({
      ...state,
      players: updatePlayers,
      round: nextRoundNumber,
      phase: 'ending_current_round',
      activePlayerId: nextPlayer,
      endTriggeredRound: state.endTriggeredRound,
      intermediateScoringStatus: intermediateScoringStatus,
    },events)
  }

  return freezeTransition({
    ...state,
    players: updatePlayers,
    round: nextRoundNumber,
    phase: 'regular_play',
    activePlayerId: nextPlayer,
    intermediateScoringStatus: intermediateScoringStatus,
  },events)
}

/** Запускает доигрывание текущего раунда по END-002. */
export function triggerGameEnd(state: GameState): GameTransition<EndingCurrentRoundGameState> {
  if (state.phase !== 'regular_play') {
    throw new Error('Only regular_play')
  }
  const updateState = {
    ...state,
    phase: 'ending_current_round',
    endTriggeredRound: state.round,
  } satisfies EndingCurrentRoundGameState

  return freezeTransition(updateState, [{ type: 'GameEndTriggered' }])

}
