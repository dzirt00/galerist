import { describe, expect, it } from 'vitest'
import {
  chooseStartingLocation,
  createGame,
  setupComponentCatalog,
  startGame,
  type PlayerConfig,
  type SetupGameState,
  type StartingLocationId,
} from '../src/index.js'
import {
  fourPlayerConfigs,
  threePlayerConfigs,
  twoPlayerConfigs,
} from './fixtures.js'

const cases: readonly [
  playerCount: 2 | 3 | 4,
  players: readonly PlayerConfig[],
][] = [
  [2, twoPlayerConfigs],
  [3, threePlayerConfigs],
  [4, fourPlayerConfigs],
]

function chooseAllStartingLocations(initialState: SetupGameState): SetupGameState {
  let state = initialState

  while (state.setupStage === 'choosing_starting_locations') {
    state = chooseStartingLocation(
      state,
      state.currentStartingLocationPlayerId!,
      state.availableStartingLocationIds[0]!,
    )
  }

  return state
}

describe('chooseStartingLocation', () => {
  it.each(cases)(
    'выбирает локации в обратном порядке и завершает setup для %i игроков',
    (playerCount, players) => {
      const initialState = createGame({ playerCount, seed: 42 }, players)
      const initialSnapshot = structuredClone(initialState)
      const initialTokens = new Map(
        initialState.internationalMarket.locationTokens.map(token => [
          token.locationId,
          token.tokenId,
        ]),
      )
      let state = initialState

      initialState.startingLocationSelectionOrder.forEach((playerId, index) => {
        const previousState = state
        const previousSnapshot = structuredClone(previousState)
        const locationId = previousState.availableStartingLocationIds[0]!
        state = chooseStartingLocation(previousState, playerId, locationId)

        const playerBoard = state.playerBoards.find(board => board.playerId === playerId)
        expect(playerBoard).toMatchObject({
          startingLocationId: locationId,
          thirdPartitionReputationTokenId: initialTokens.get(locationId),
        })
        expect(state.availableStartingLocationIds).not.toContain(locationId)
        expect(previousState).toEqual(previousSnapshot)
        expect(Object.isFrozen(state)).toBe(true)
        expect(Object.isFrozen(state.playerBoards)).toBe(true)
        expect(state.playerBoards.every(Object.isFrozen)).toBe(true)
        expect(Object.isFrozen(state.internationalMarket)).toBe(true)
        expect(Object.isFrozen(state.internationalMarket.locationTokens)).toBe(true)

        const expectedNextPlayer =
          initialState.startingLocationSelectionOrder[index + 1] ?? null
        expect(state.currentStartingLocationPlayerId).toBe(expectedNextPlayer)
      })

      expect(initialState).toEqual(initialSnapshot)
      expect(state.setupStage).toBe('complete')
      expect(state.currentStartingLocationPlayerId).toBe(null)
      expect(state.internationalMarket.locationTokens).toEqual([])
      expect(state.availableStartingLocationIds).toEqual(
        setupComponentCatalog.startingLocationOrder.slice(playerCount),
      )
      expect(state.internationalMarket.tableIds).toBe(initialState.internationalMarket.tableIds)
      expect(state.internationalMarket.remainingTokenIds).toBe(
        initialState.internationalMarket.remainingTokenIds,
      )
    },
  )

  it('отклоняет не текущего игрока и занятую локацию без изменения состояния', () => {
    const initialState = createGame({ playerCount: 2, seed: 42 }, twoPlayerConfigs)
    const initialSnapshot = structuredClone(initialState)
    const currentPlayerId = initialState.currentStartingLocationPlayerId!
    const otherPlayerId = initialState.players.find(player => player.id !== currentPlayerId)!.id
    const locationId = initialState.availableStartingLocationIds[0]!

    expect(() => chooseStartingLocation(initialState, otherPlayerId, locationId)).toThrow(
      'Only the current player can choose a starting location',
    )
    expect(initialState).toEqual(initialSnapshot)

    const afterFirstChoice = chooseStartingLocation(initialState, currentPlayerId, locationId)
    expect(() => chooseStartingLocation(
      afterFirstChoice,
      afterFirstChoice.currentStartingLocationPlayerId!,
      locationId,
    )).toThrow('Starting location must be available')
    expect(initialState).toEqual(initialSnapshot)
  })

  it('отклоняет выбор после завершения setup', () => {
    const completeState = chooseAllStartingLocations(
      createGame({ playerCount: 2, seed: 42 }, twoPlayerConfigs),
    )
    const snapshot = structuredClone(completeState)

    expect(() => chooseStartingLocation(
      completeState,
      completeState.startingLocationSelectionOrder[0]!,
      completeState.availableStartingLocationIds[0] as StartingLocationId,
    )).toThrow('Starting locations can only be chosen during setup')
    expect(completeState).toEqual(snapshot)
  })

  it('разрешает startGame только после завершения выбора', () => {
    const initialState = createGame({ playerCount: 2, seed: 42 }, twoPlayerConfigs)

    expect(() => startGame(initialState)).toThrow(
      'Game can only be started after setup is complete',
    )

    const completeState = chooseAllStartingLocations(initialState)
    const regularPlay = startGame(completeState)

    expect(regularPlay.phase).toBe('regular_play')
    expect(regularPlay).not.toHaveProperty('setupStage')
    expect(regularPlay).not.toHaveProperty('currentStartingLocationPlayerId')
    expect(regularPlay).not.toHaveProperty('availableStartingLocationIds')
  })
})
