import type {
  EndingCurrentRoundGameState,
  EndingSequenceGameState,
  FinalRoundGameState,
  FinalScoringGameState,
  GameConfig,
  GameState,
  PlayerConfig,
  PlayerState,
  RegularPlayGameState,
  SetupGameState,
} from './types.js'
import { createSetupRng, type SetupRng, type SetupRngConfig } from "./setup-rng.js";
import { setupComponentCatalog } from "./component-catalog.js";
import { prepareOrderMarket } from "./setup-orders.js";
import { type PreparedTicketOffice, prepareTicketOffice } from "./setup-tickets.js";
import { type PreparedPromotionSupply, preparePromotionSupply } from "./setup-promotion.js";
import { prepareArtistMarket, prepareArtistSetup } from "./setup-artists.js";
import { placeInitialVisitors, type PreparedVisitorBag, prepareVisitorBag } from "./setup-visitors.js";
import { prepareInternationalMarket } from "./setup-international-market.js";
import { prepareArtworkMarket, type PreparedArtworkMarket } from "./setup-artworks.js";
import { type PreparedMasterpieceAuction, prepareMasterpieceAuction } from "./setup-masterpieces.js";
import { curator, dealer } from './setupComponentCatalog.js'
import { preparePrivateGoals } from './setup-goals.js'
import { preparePlayerBoards } from "./player-boards.js";

function getFirstPlayerIndex(seed: number, playerCount: number): number {
  return ((seed % playerCount) + playerCount) % playerCount
}

/** Создаёт замороженное начальное состояние игры после проверки конфигурации и игроков. */
export function createGame(
  config: GameConfig,
  players: readonly PlayerConfig[],
): SetupGameState {
  if (config.playerCount !== 2 && config.playerCount !== 3 && config.playerCount !== 4) {
    throw new Error('Player count must be 2, 3, or 4')
  }
  if (players.length !== config.playerCount) {
    throw new Error('Player count must match config.playerCount')
  }
  if (!Number.isSafeInteger(config.seed)) {
    throw new Error('Seed must be a safe integer')
  }
  if (new Set(players.map(player => player.id)).size !== players.length) {
    throw new Error('Players must have unique IDs')
  }

  const playerIds = players.map(player => player.id)
  const setupVersions = Object.freeze({
    rulesVersion: 'galerist-rules-2026-09-15-v1' as const,
    componentsVersion: setupComponentCatalog.componentsVersion,
    setupAlgorithmVersion: 'setup-rng-v1' as const,
  })

  const setupRngConfig: SetupRngConfig = {
    rulesVersion: setupVersions.rulesVersion,
    componentsVersion: setupVersions.componentsVersion,
    seed: config.seed,
    playerIds,
  }
  const setupRng: SetupRng = createSetupRng(setupRngConfig)
  const orderRowsId = setupComponentCatalog.orders.map(order => order.id)
  const orderMarket = Object.freeze(prepareOrderMarket(orderRowsId,setupRng))

  const ticketOffice: PreparedTicketOffice = prepareTicketOffice(config.playerCount)
  const promotionSupply: PreparedPromotionSupply = preparePromotionSupply(setupComponentCatalog.promotionTokens)
  const artistMarket = prepareArtistMarket(setupComponentCatalog.artists, setupRng)
  const artistSetup = prepareArtistSetup(artistMarket, setupComponentCatalog.visitorInstancesByPlayerCount[config.playerCount], setupComponentCatalog.artistBonuses, setupRng)
  const visitorBag: PreparedVisitorBag =  prepareVisitorBag(artistSetup.remainingVisitors, setupRng)
  const internationalMarket = prepareInternationalMarket(setupComponentCatalog.reputationTokenIds, config.playerCount, setupRng)
  const artworkMarket: PreparedArtworkMarket = prepareArtworkMarket( setupComponentCatalog.artworks, visitorBag, setupRng)
  const masterpieceAuction: PreparedMasterpieceAuction = prepareMasterpieceAuction(Object.values(artworkMarket.deferredArtworksByGenre),config.playerCount,setupRng)
  const initialVisitors = placeInitialVisitors( artworkMarket.remainingVisitorBag, playerIds)
  const privateGoals = preparePrivateGoals(playerIds,curator,dealer,setupRng)
  const playerBoards = preparePlayerBoards( playerIds, setupComponentCatalog.assistantsPerPlayer, )
  const newPlayers: PlayerState[] = players.map(player => Object.freeze({
    id: player.id,
    name: player.name,
    kind: player.kind,
    coins: 10,
    influence: 10,
  }))

  const firstPlayerIndex = getFirstPlayerIndex(config.seed, players.length)

  const regularTurnOrder = [
    ...playerIds.slice(firstPlayerIndex),
    ...playerIds.slice(0, firstPlayerIndex),
  ]

  const startingLocationSelectionOrder =
    Object.freeze([...regularTurnOrder].reverse())



  return Object.freeze({
    id: `game-${config.seed}`,
    status: 'setup',
    round: 0,
    activePlayerId: null,
    config: Object.freeze({ ...config }),
    players: Object.freeze([...newPlayers]),
    phase: 'setup',
    orderMarket: orderMarket,
    ticketOffice: ticketOffice,
    promotionSupply: promotionSupply,
    artistMarket: artistMarket,
    artistSetup: artistSetup,
    internationalMarket: internationalMarket,
    artworkMarket: artworkMarket,
    setupVersions,
    masterpieceAuction: masterpieceAuction,
    plazaVisitors: initialVisitors.plazaVisitors,
    vestibuleVisitors: initialVisitors.visitorPlayers,
    visitorBag: Object.freeze({ visitors: initialVisitors.remainingVisitors }),
    privateGoals,
    playerBoards: playerBoards,
    setupStage: 'choosing_starting_locations',
    startingLocationSelectionOrder,
    currentStartingLocationPlayerId:
      startingLocationSelectionOrder[0]!,
    availableStartingLocationIds:
      Object.freeze([...setupComponentCatalog.startingLocationOrder]),
  })
}

/** Начинает игру и детерминированно выбирает первого игрока по seed. */
export function startGame(state: GameState): RegularPlayGameState {
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

  return Object.freeze({
    ...stateWithoutSetupSelection,
    status: 'in_progress',
    phase: 'regular_play',
    round: 1,
    activePlayerId: firstPlayerId,
    firstPlayerId,
  })
}

/** Передаёт ход следующему игроку и переключает раунд или фазу завершения при необходимости. */
export function advanceTurn(state: RegularPlayGameState): RegularPlayGameState
export function advanceTurn(
  state: EndingCurrentRoundGameState,
): EndingCurrentRoundGameState | FinalRoundGameState
export function advanceTurn(
  state: FinalRoundGameState,
): FinalRoundGameState | FinalScoringGameState
export function advanceTurn(state: EndingSequenceGameState): EndingSequenceGameState
export function advanceTurn(state: GameState): GameState
export function advanceTurn(state: GameState): GameState {
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

  const nextPlayer = state.players[(currentIndex + 1) % state.players.length]!.id
  const isNewRound = nextPlayer === state.firstPlayerId
  const nextRoundNumber = isNewRound ? state.round + 1 : state.round

  if (state.phase === 'final_round') {
    if (isNewRound) {
      return Object.freeze({
        ...state,
        phase: 'final_scoring',
        activePlayerId: null,
        endTriggeredRound: state.endTriggeredRound,
      })
    }
    return Object.freeze({
      ...state,
      round: nextRoundNumber,
      phase: 'final_round',
      activePlayerId: nextPlayer,
      endTriggeredRound: state.endTriggeredRound,
    })
  }

  if (state.phase === 'ending_current_round') {
    if (isNewRound) {
      return Object.freeze({
        ...state,
        round: nextRoundNumber,
        phase: 'final_round',
        activePlayerId: nextPlayer,
        endTriggeredRound: state.endTriggeredRound,
      })
    }
    return Object.freeze({
      ...state,
      round: nextRoundNumber,
      phase: 'ending_current_round',
      activePlayerId: nextPlayer,
      endTriggeredRound: state.endTriggeredRound,
    })
  }

  return Object.freeze({
    ...state,
    round: nextRoundNumber,
    phase: 'regular_play',
    activePlayerId: nextPlayer,
  })
}

/** Запускает последовательность завершения после текущего раунда обычной игры. */
export function triggerGameEnd(state: GameState): EndingCurrentRoundGameState {
  if (state.phase !== 'regular_play') {
    throw new Error('Only regular_play')
  }
  return Object.freeze({
    ...state,
    phase: 'ending_current_round',
    endTriggeredRound: state.round,
  })
}
