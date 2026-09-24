import { deepFreeze, setupComponentCatalog } from './component-catalog.js'
import {
  freezeTransition,
  type GameEvent,
  type GameTransition,
} from './game-events.js'
import { prepareArtworkMarket } from './setup-artworks.js'
import { prepareArtistMarket, prepareArtistSetup } from './setup-artists.js'
import { preparePrivateGoals } from './setup-goals.js'
import { prepareInternationalMarket } from './setup-international-market.js'
import { prepareMasterpieceAuction } from './setup-masterpieces.js'
import { prepareOrderMarket } from './setup-orders.js'
import { preparePromotionSupply } from './setup-promotion.js'
import { createSetupRng, type SetupRngConfig } from './setup-rng.js'
import { prepareTicketOffice } from './setup-tickets.js'
import { placeInitialVisitors, prepareVisitorBag } from './setup-visitors.js'
import { curatorGoals, dealerGoals } from './goal-card-catalog.js'
import { preparePlayerBoards } from './player-boards.js'
import { getFirstPlayerIndex } from './turn-order.js'
import type {
  CreateGameInput,
  PlayerState,
  SetupGameState,
} from './types.js'

/** Проверяет внешние параметры партии до расходования потоков setup RNG. */
function assertCreateGameInput(input: CreateGameInput): void {
  const { config, gameId, players } = input

  if (gameId.trim().length === 0) {
    throw new Error('Game ID must be a non-empty string')
  }
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
  if (players.some(player => player.id.trim().length === 0)) {
    throw new Error('Player IDs must be non-empty strings')
  }
}

/** Собирает полное детерминированное setup-состояние по ADR-001 и SETUP-001–SETUP-012. */
export function createGame(
  input: CreateGameInput,
): GameTransition<SetupGameState> {
  assertCreateGameInput(input)

  const { config, gameId, players } = input
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
  const setupRng = createSetupRng(setupRngConfig)
  const orderMarket = prepareOrderMarket(
    setupComponentCatalog.orders.map(order => order.id),
    setupRng,
  )
  const ticketOffice = prepareTicketOffice(config.playerCount)
  const promotionSupply = preparePromotionSupply(setupComponentCatalog.promotionTokens)
  const artistMarket = prepareArtistMarket(setupComponentCatalog.artists, setupRng)
  const artistSetup = prepareArtistSetup(
    artistMarket,
    setupComponentCatalog.visitorInstancesByPlayerCount[config.playerCount],
    setupComponentCatalog.artistBonuses,
    setupRng,
  )
  const visitorBag = prepareVisitorBag(artistSetup.remainingVisitors, setupRng)
  const internationalMarket = prepareInternationalMarket(
    setupComponentCatalog.reputationTokenIds,
    config.playerCount,
    setupRng,
  )
  const artworkMarket = prepareArtworkMarket(
    setupComponentCatalog.artworks,
    visitorBag,
    setupRng,
  )
  const masterpieceAuction = prepareMasterpieceAuction(
    Object.values(artworkMarket.deferredArtworksByGenre),
    config.playerCount,
    setupRng,
  )
  const initialVisitors = placeInitialVisitors(artworkMarket.remainingVisitorBag, playerIds)
  const firstPlayerIndex = getFirstPlayerIndex(config.seed, players.length)
  const privateGoals = preparePrivateGoals(playerIds, curatorGoals, dealerGoals, setupRng)
  const playerBoards = preparePlayerBoards(playerIds, setupComponentCatalog.assistantsPerPlayer)
  const preparedPlayers: readonly PlayerState[] = players.map(player => Object.freeze({
    id: player.id,
    name: player.name,
    kind: player.kind,
    coins: 10,
    influence: 10,
  }))
  const regularTurnOrder = [
    ...playerIds.slice(firstPlayerIndex),
    ...playerIds.slice(0, firstPlayerIndex),
  ]
  // Стартовые локации выбираются против обычного порядка хода по SETUP-012.
  const startingLocationSelectionOrder = Object.freeze([...regularTurnOrder].reverse())

  const state: SetupGameState = {
    stateSchemaVersion: 3,
    id: gameId,
    status: 'setup',
    round: 0,
    activePlayerId: null,
    config: Object.freeze({ ...config }),
    players: Object.freeze([...preparedPlayers]),
    phase: 'setup',
    orderMarket,
    ticketOffice,
    promotionSupply,
    artistMarket,
    artistSetup,
    internationalMarket,
    artworkMarket,
    setupVersions,
    masterpieceAuction,
    plazaVisitors: initialVisitors.plazaVisitors,
    vestibuleVisitors: initialVisitors.vestibuleVisitors,
    visitorBag: Object.freeze({ visitors: initialVisitors.remainingVisitors }),
    privateGoals,
    playerBoards,
    setupStage: 'choosing_starting_locations',
    startingLocationSelectionOrder,
    currentStartingLocationPlayerId: startingLocationSelectionOrder[0]!,
    availableStartingLocationIds: Object.freeze([
      ...setupComponentCatalog.startingLocationOrder,
    ]),
  }
  const frozenState: SetupGameState = deepFreeze(state)

  const openedArtistId = artistMarket.slots.find(slot => slot.isOpen)!.artistId
  const events: readonly GameEvent[] = [
    { type: 'OrderMarketPrepared' },
    { type: 'TicketOfficePrepared' },
    { type: 'PromotionSupplyPrepared' },
    { type: 'ArtistsPrepared' },
    { type: 'ArtistOpened', artistId: openedArtistId },
    { type: 'VisitorBagPrepared' },
    { type: 'ArtworkMarketPrepared' },
    { type: 'InternationalMarketPrepared' },
    { type: 'LocationReputationPrepared' },
    { type: 'MasterpieceAuctionPrepared' },
    { type: 'InitialVisitorsPlaced' },
    { type: 'FirstPlayerSelected', playerId: playerIds[firstPlayerIndex]! },
    ...playerIds.map(playerId => ({
      type: 'PrivateGoalsDealt' as const,
      playerId,
    })),
    ...playerIds.map(playerId => ({
      type: 'PlayerBoardPrepared' as const,
      playerId,
    })),
    { type: 'GameCreated', gameId: frozenState.id },
  ]

  return freezeTransition<SetupGameState>(frozenState, events)
}
