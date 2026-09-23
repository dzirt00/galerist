import { deepFreeze, type StartingLocationId } from './component-catalog.js'
import { freezeTransition, type GameTransition } from './game-events.js'
import type { PlayerId, SetupGameState } from './types.js'

/** Записывает выбор стартовой локации по SETUP-012 и продолжает setup. */
export function chooseStartingLocation(
  state: SetupGameState,
  playerId: PlayerId,
  locationId: StartingLocationId,
): GameTransition<SetupGameState> {
  if (state.setupStage !== 'choosing_starting_locations') {
    throw new Error('Starting locations can only be chosen during setup')
  }
  if (state.currentStartingLocationPlayerId !== playerId) {
    throw new Error('Only the current player can choose a starting location')
  }
  if (!state.availableStartingLocationIds.includes(locationId)) {
    throw new Error('Starting location must be available')
  }

  const selectedLocationToken = state.internationalMarket.locationReputationTokens.find(
    locationToken => locationToken.locationId === locationId,
  )
  if (selectedLocationToken === undefined) {
    throw new Error('Starting location must have a reputation token')
  }

  const playerBoardIndex = state.playerBoards.findIndex(
    playerBoard => playerBoard.playerId === playerId,
  )
  if (playerBoardIndex === -1) {
    throw new Error('Current player must have a player board')
  }

  const selectionIndex = state.startingLocationSelectionOrder.indexOf(playerId)
  if (selectionIndex === -1) {
    throw new Error('Current player must belong to the selection order')
  }

  const nextPlayerId = state.startingLocationSelectionOrder[selectionIndex + 1] ?? null
  const setupComplete = nextPlayerId === null
  const availableStartingLocationIds = state.availableStartingLocationIds.filter(
    availableLocationId => availableLocationId !== locationId,
  )
  const remainingLocationReputationTokens = setupComplete
    // После последнего выбора неиспользованный жетон удаляется из партии по SETUP-012.
    ? []
    : state.internationalMarket.locationReputationTokens.filter(
      locationToken => locationToken.locationId !== locationId,
    )
  const playerBoards = state.playerBoards.map((playerBoard, index) => (
    index === playerBoardIndex
      ? {
          ...playerBoard,
          startingLocationId: locationId,
          thirdPartitionReputationTokenId: selectedLocationToken.tokenId,
        }
      : playerBoard
  ))

  const nextState: SetupGameState = deepFreeze({
    ...state,
    playerBoards,
    internationalMarket: {
      ...state.internationalMarket,
      locationReputationTokens: remainingLocationReputationTokens,
    },
    setupStage: setupComplete ? 'complete' : 'choosing_starting_locations',
    currentStartingLocationPlayerId: nextPlayerId,
    availableStartingLocationIds,
  })

  return freezeTransition(nextState, [{
    type: 'StartingLocationChosen',
    playerId,
    locationId,
  }])
}
