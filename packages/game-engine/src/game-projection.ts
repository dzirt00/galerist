import { deepFreeze, setupComponentCatalog } from './component-catalog.js'
import type { GameState, PlayerId } from './types.js'

/** Создаёт проекцию для viewer без seed и скрытых порядков по ADR-001. */
export function projectGameForViewer(
  state: GameState,
  viewerId: PlayerId | null,
) {
  if (viewerId !== null && !state.players.some(player => player.id === viewerId)) {
    throw new Error('Viewer must be a player or null')
  }

  const revealAllGoals = state.phase === 'final_scoring' || state.phase === 'finished'
  const visibleGoals = revealAllGoals
    ? state.privateGoals.goalsByPlayer
    : viewerId === null
      ? {}
      : { [viewerId]: state.privateGoals.goalsByPlayer[viewerId]! }

  const phaseFields = state.phase === 'setup'
    ? {
        setupStage: state.setupStage,
        currentStartingLocationPlayerId: state.currentStartingLocationPlayerId,
        availableStartingLocationIds: state.availableStartingLocationIds,
      }
    : {
        firstPlayerId: state.firstPlayerId,
        ...('endTriggeredRound' in state
          ? { endTriggeredRound: state.endTriggeredRound }
          : {}),
      }

  const projection = {
    config: { playerCount: state.config.playerCount },
    players: state.players,
    phase: state.phase,
    status: state.status,
    round: state.round,
    activePlayerId: state.activePlayerId,
    ...phaseFields,
    orderMarket: {
      visibleOrders: state.orderMarket.visibleOrders,
      remainingOrderCount: state.orderMarket.remainingOrderIds.length,
    },
    ticketOffice: state.ticketOffice,
    promotionSupply: state.promotionSupply,
    artistMarket: {
      slots: state.artistMarket.slots,
      unselectedArtistCount: state.artistMarket.unselectedArtistIds.length,
    },
    artistSetup: {
      slots: state.artistSetup.slots,
      unusedBonusCount: state.artistSetup.unusedBonuses.length,
    },
    visitorBag: { visitorCount: state.visitorBag.visitors.length },
    internationalMarket: {
      marketReputationCells: state.internationalMarket.marketReputationCells,
      locationReputationTokens: state.internationalMarket.locationReputationTokens,
      remainingReputationTokenCount: state.internationalMarket.remainingReputationTokenIds.length,
    },
    artworkMarket: {
      openArtworksByGenre: state.artworkMarket.openArtworksByGenre,
      deferredArtworkCount: setupComponentCatalog.genreOrder.length,
      remainingArtworkCountsByGenre: Object.fromEntries(
        setupComponentCatalog.genreOrder.map(genre => [
          genre,
          state.artworkMarket.remainingArtworksByGenre[genre].length,
        ]),
      ),
    },
    masterpieceAuction: state.masterpieceAuction,
    privateGoals: {
      goalsByPlayer: visibleGoals,
      remainingCuratorGoalCount: state.privateGoals.remainingCuratorGoals.length,
      remainingDealerGoalCount: state.privateGoals.remainingDealerGoals.length,
    },
    playerBoards: state.playerBoards,
    plazaVisitors: state.plazaVisitors,
    vestibuleVisitors: state.vestibuleVisitors,
  }

  return deepFreeze(structuredClone(projection))
}

export type ProjectedGameState = ReturnType<typeof projectGameForViewer>
