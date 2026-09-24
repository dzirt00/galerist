import { expect, it } from 'vitest'
import {
  advanceTurn,
  createGame as createGameTransition,
  projectEventsForViewer,
  setupComponentCatalog,
  startGame as startGameTransition,
  triggerGameEnd,
  type FinishedGameState,
  type GameConfig,
  type GameState,
  type PlayerConfig,
  type PlayerState,
  type SetupGameState,
} from '../src/index.js'
import {
  fourPlayerConfigs,
  setupGameStateFixture,
  threePlayerConfigs,
  threePlayerStates,
  twoPlayerConfigs,
  twoPlayerGameConfig,
  twoPlayerStates,
} from './fixtures.js'
import {
  advanceAndExpectTurns,
  completeStartingLocationSelection,
  expectEndingTurns,
} from './helpers.js'

function createGame(config: GameConfig, players: readonly PlayerConfig[]) {
  return createGameTransition({
    gameId: `game-${config.seed}`,
    config,
    players,
  }).state
}

function startGameFromSetup(state: SetupGameState) {
  return startGameTransition(state).state
}

function startGame(state: GameState) {
  return startGameTransition(
    state.phase === 'setup' && state.setupStage === 'choosing_starting_locations'
      ? completeStartingLocationSelection(state)
      : state,
  ).state
}

  it( 'хранит исходные данные игры', () => {
    const state = structuredClone(setupGameStateFixture)
    expect( state.status ).toBe( 'setup' )
    expect( state.players ).toHaveLength( 2 )
  } )


it('не позволяет повторно начать игру и сохраняет исходное состояние', () =>{
  const state = createGame( twoPlayerGameConfig, twoPlayerConfigs )
  const startedGame = startGame(state)
  const startedGameSnapshot = structuredClone(startedGame)

  expect(() => startGame(startedGame)).toThrow('Game can only be started from setup')
  expect(startedGame).toEqual(startedGameSnapshot)
  expect(state.phase).toBe('setup')
  expect(state.activePlayerId).toBe(null)
  expect(state).not.toHaveProperty('endTriggeredRound');
  expect(state).not.toHaveProperty('firstPlayerId');

})

it('отклоняет запуск завершённой игры без изменения состояния', () => {
  const state: FinishedGameState = {
    ...startGame(createGame(twoPlayerGameConfig, twoPlayerConfigs)),
    id: 'game-1',
    config: twoPlayerGameConfig,
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human', coins: 10, influence: 10 },
      { id: 'player-2', name: 'Алина', kind: 'human', coins: 10, influence: 10 },
    ],
    phase: 'finished',
    status: 'finished',
    round: 0,
    activePlayerId: null,
    firstPlayerId: 'player-1',
    endTriggeredRound: 0,
    winnerIds: ['player-1'],
  }

  const stateClone = structuredClone(state)
  expect(() => startGame(state)).toThrow('Game can only be started from setup')
  expect(state).toEqual(stateClone)
})

it( 'создаёт детерминированное начальное состояние игры', () => {
  const state = createGame( twoPlayerGameConfig, twoPlayerConfigs )

  expect( state ).toMatchObject( {
    id: 'game-42',
    status: 'setup',
    round: 0,
    activePlayerId: null,
    config: { playerCount: 2, seed: 42 },
  } )
  expect( state.players ).toHaveLength( 2 )
} )

it('включает в GameState все карты заказов без потерь и дубликатов', () => {
  const catalogOrderIds = setupComponentCatalog.orders.map(order => order.id)
  const state = createGame(twoPlayerGameConfig, twoPlayerConfigs)
  const allPreparedOrderIds = [
    ...state.orderMarket.visibleOrders,
    ...state.orderMarket.remainingOrderIds,
  ]

  expect(state.orderMarket.visibleOrders).toHaveLength(4)
  expect(state.orderMarket.remainingOrderIds).toHaveLength(16)
  expect(new Set(allPreparedOrderIds).size).toBe(20)
  expect([...allPreparedOrderIds].sort()).toEqual([...catalogOrderIds].sort())
  expect(setupComponentCatalog.orders.map(order => order.id)).toEqual(catalogOrderIds)
})

it('детерминированно готовит и глубоко замораживает рынок заказов', () => {
  const config: GameConfig = { playerCount: 2, seed: -42 }
  const first = createGame(config, twoPlayerConfigs)
  const second = createGame({ ...config }, twoPlayerConfigs.map(player => ({ ...player })))

  expect(first.orderMarket).toEqual(second.orderMarket)
  expect(Object.isFrozen(first.orderMarket)).toBe(true)
  expect(Object.isFrozen(first.orderMarket.visibleOrders)).toBe(true)
  expect(Object.isFrozen(first.orderMarket.remainingOrderIds)).toBe(true)
  expect(() => {
    (first.orderMarket.visibleOrders as string[]).push('ORDER-UNKNOWN')
  }).toThrow()
})

it('сохраняет подготовленный рынок заказов при переходах lifecycle', () => {
  const setup = createGame(twoPlayerGameConfig, twoPlayerConfigs)
  const regularPlay = startGame(setup)
  const nextTurn = advanceTurn(regularPlay).state
  const endingCurrentRound = triggerGameEnd(nextTurn).state

  expect(regularPlay.orderMarket).toBe(setup.orderMarket)
  expect(nextTurn.orderMarket).toBe(setup.orderMarket)
  expect(endingCurrentRound.orderMarket).toBe(setup.orderMarket)
})

it.each([
  [2, twoPlayerConfigs, 10],
  [3, threePlayerConfigs, 15],
  [4, fourPlayerConfigs, 20],
] as const)('сохраняет в GameState точный запас билетов для %i игроков', (playerCount, players, expected) => {
  const state = createGame({ playerCount, seed: 42 }, players)

  expect(state.ticketOffice.ticketsByColor).toEqual({
    B: expected,
    R: expected,
    W: expected,
  })
  expect(Object.isFrozen(state.ticketOffice)).toBe(true)
  expect(Object.isFrozen(state.ticketOffice.ticketsByColor)).toBe(true)
})

it('сохраняет подготовленную кассу билетов при переходах lifecycle', () => {
  const setup = createGame(twoPlayerGameConfig, twoPlayerConfigs)
  const regularPlay = startGame(setup)
  const nextTurn = advanceTurn(regularPlay).state
  const endingCurrentRound = triggerGameEnd(nextTurn)

  expect(regularPlay.ticketOffice).toBe(setup.ticketOffice)
  expect(nextTurn.ticketOffice).toBe(setup.ticketOffice)
  expect(endingCurrentRound.state.ticketOffice).toBe(setup.ticketOffice)
})

it('сохраняет в GameState все 20 жетонов рекламы по четыре на каждом уровне', () => {
  const state = createGame(twoPlayerGameConfig, twoPlayerConfigs)
  const tokenIdsByLevel = state.promotionSupply.tokenIdsByLevel
  const preparedIds = Object.values(tokenIdsByLevel).flat()
  const catalogIds = setupComponentCatalog.promotionTokens.map(token => token.id)

  expect(Object.keys(tokenIdsByLevel)).toEqual(['1', '2', '3', '4', '5'])
  expect(Object.values(tokenIdsByLevel).every(tokenIds => tokenIds.length === 4)).toBe(true)
  expect(new Set(preparedIds).size).toBe(20)
  expect([...preparedIds].sort()).toEqual([...catalogIds].sort())
})

it('глубоко замораживает и сохраняет запас рекламы при переходах lifecycle', () => {
  const setup = createGame(twoPlayerGameConfig, twoPlayerConfigs)
  const regularPlay = startGame(setup)
  const nextTurn = advanceTurn(regularPlay).state
  const endingCurrentRound = triggerGameEnd(nextTurn)

  expect(Object.isFrozen(setup.promotionSupply)).toBe(true)
  expect(Object.isFrozen(setup.promotionSupply.tokenIdsByLevel)).toBe(true)
  expect(Object.values(setup.promotionSupply.tokenIdsByLevel).every(Object.isFrozen)).toBe(true)
  expect(regularPlay.promotionSupply).toBe(setup.promotionSupply)
  expect(nextTurn.promotionSupply).toBe(setup.promotionSupply)
  expect(endingCurrentRound.state.promotionSupply).toBe(setup.promotionSupply)
})

it('сохраняет в GameState восемь уникальных пар художников и открывает одного синего', () => {
  const state = createGame(twoPlayerGameConfig, twoPlayerConfigs)
  const pairIds = state.artistMarket.slots.map(slot => `${slot.genre}-${slot.category}`)
  const expectedPairIds = setupComponentCatalog.genreOrder.flatMap(genre =>
    setupComponentCatalog.categoryOrder.map(category => `${genre}-${category}`),
  )
  const openSlots = state.artistMarket.slots.filter(slot => slot.isOpen)

  expect(state.artistMarket.slots).toHaveLength(8)
  expect(state.artistMarket.unselectedArtistIds).toHaveLength(8)
  expect(new Set(state.artistMarket.slots.map(slot => slot.artistId)).size).toBe(8)
  expect(new Set(pairIds)).toEqual(new Set(expectedPairIds))
  expect(openSlots).toHaveLength(1)
  expect(openSlots[0]!.category).toBe('blue')
})

it('детерминированно готовит, замораживает и сохраняет рынок художников', () => {
  const config: GameConfig = { playerCount: 2, seed: -42 }
  const first = createGame(config, twoPlayerConfigs)
  const second = createGame({ ...config }, twoPlayerConfigs.map(player => ({ ...player })))
  const regularPlay = startGame(first)
  const endingCurrentRound = triggerGameEnd(advanceTurn(regularPlay).state)

  expect(first.artistMarket).toEqual(second.artistMarket)
  expect(Object.isFrozen(first.artistMarket)).toBe(true)
  expect(Object.isFrozen(first.artistMarket.slots)).toBe(true)
  expect(Object.isFrozen(first.artistMarket.unselectedArtistIds)).toBe(true)
  expect(first.artistMarket.slots.every(Object.isFrozen)).toBe(true)
  expect(regularPlay.artistMarket).toBe(first.artistMarket)
  expect(endingCurrentRound.state.artistMarket).toBe(first.artistMarket)
})

it('сохраняет в GameState бонусы, коллекционеров и подписи подготовленных художников', () => {
  const state = createGame(twoPlayerGameConfig, twoPlayerConfigs)
  const openSlots = state.artistSetup.slots.filter(slot => slot.isOpen)
  const closedSlots = state.artistSetup.slots.filter(slot => !slot.isOpen)
  const redSlots = state.artistSetup.slots.filter(slot => slot.category === 'red')
  const blueSlots = state.artistSetup.slots.filter(slot => slot.category === 'blue')

  expect(openSlots).toHaveLength(1)
  expect(openSlots[0]!.bonus).toBeNull()
  expect(closedSlots).toHaveLength(7)
  expect(closedSlots.every(slot => slot.bonus !== null)).toBe(true)
  expect(new Set(closedSlots.map(slot => slot.bonus!.id)).size).toBe(7)
  expect(state.artistSetup.unusedBonuses).toHaveLength(3)
  expect(redSlots).toHaveLength(4)
  expect(redSlots.every(slot => slot.collector?.type === 'W')).toBe(true)
  expect(blueSlots.every(slot => slot.collector === null)).toBe(true)
  expect(state.artistSetup.remainingVisitors).toHaveLength(
    setupComponentCatalog.visitorInstancesByPlayerCount[2].length - 4,
  )

  for (const slot of state.artistSetup.slots) {
    expect(slot.signatureIds).toEqual([
      `${slot.artistId}-SIG-1`,
      `${slot.artistId}-SIG-2`,
    ])
  }
})

it('детерминированно готовит, замораживает и сохраняет полную раскладку художников', () => {
  const config: GameConfig = { playerCount: 2, seed: -42 }
  const first = createGame(config, twoPlayerConfigs)
  const second = createGame({ ...config }, twoPlayerConfigs.map(player => ({ ...player })))
  const regularPlay = startGame(first)
  const endingCurrentRound = triggerGameEnd(advanceTurn(regularPlay).state)

  expect(first.artistSetup).toEqual(second.artistSetup)
  expect(Object.isFrozen(first.artistSetup)).toBe(true)
  expect(Object.isFrozen(first.artistSetup.slots)).toBe(true)
  expect(Object.isFrozen(first.artistSetup.remainingVisitors)).toBe(true)
  expect(Object.isFrozen(first.artistSetup.unusedBonuses)).toBe(true)
  expect(first.artistSetup.slots.every(Object.isFrozen)).toBe(true)
  expect(regularPlay.artistSetup).toBe(first.artistSetup)
  expect(endingCurrentRound.state.artistSetup).toBe(first.artistSetup)
})

it.each([
  [2, twoPlayerConfigs],
  [3, threePlayerConfigs],
  [4, fourPlayerConfigs],
] as const)('сохраняет всех посетителей между художниками, работами и мешочком для %i игроков', (playerCount, players) => {
  const state = createGame({ playerCount, seed: 42 }, players)
  const collectorIds = state.artistSetup.slots.flatMap(slot =>
    slot.collector === null ? [] : [slot.collector.id],
  )
  const artworkVisitorIds = Object.values(state.artworkMarket.openArtworksByGenre)
    .flatMap(slot => slot.visitors.map(visitor => visitor.id))
  const plazaVisitorIds = state.plazaVisitors.map(visitor => visitor.id)
  const vestibuleVisitorIds = state.vestibuleVisitors
    .map(placement => placement.vestibuleVisitor.id)
  const bagIds = state.visitorBag.visitors.map(visitor => visitor.id)
  const catalogIds = setupComponentCatalog.visitorInstancesByPlayerCount[playerCount]
    .map(visitor => visitor.id)
  const allPlacedIds = [
    ...collectorIds,
    ...artworkVisitorIds,
    ...plazaVisitorIds,
    ...vestibuleVisitorIds,
    ...bagIds,
  ]

  expect(collectorIds).toHaveLength(4)
  expect(new Set(allPlacedIds).size).toBe(catalogIds.length)
  expect(allPlacedIds.sort()).toEqual([...catalogIds].sort())
  expect(
    state.artworkMarket.remainingVisitorBag.visitors.length - state.visitorBag.visitors.length,
  ).toBe(4 + playerCount)
})

it('детерминированно готовит, замораживает и сохраняет мешочек посетителей', () => {
  const config: GameConfig = { playerCount: 2, seed: -42 }
  const first = createGame(config, twoPlayerConfigs)
  const second = createGame({ ...config }, twoPlayerConfigs.map(player => ({ ...player })))
  const regularPlay = startGame(first)
  const endingCurrentRound = triggerGameEnd(advanceTurn(regularPlay).state)

  expect(first.visitorBag).toEqual(second.visitorBag)
  expect(Object.isFrozen(first.visitorBag)).toBe(true)
  expect(Object.isFrozen(first.visitorBag.visitors)).toBe(true)
  expect(first.visitorBag.visitors.every(Object.isFrozen)).toBe(true)
  expect(regularPlay.visitorBag).toBe(first.visitorBag)
  expect(endingCurrentRound.state.visitorBag).toBe(first.visitorBag)
})

it.each([
  [2, twoPlayerConfigs],
  [3, threePlayerConfigs],
  [4, fourPlayerConfigs],
] as const)('для %i игроков размещает четырёх посетителей на площади и по одному в вестибюлях', (playerCount, players) => {
  const state = createGame({ playerCount, seed: 42 }, players)

  expect(state.plazaVisitors).toHaveLength(4)
  expect(state.vestibuleVisitors).toHaveLength(playerCount)
  expect(state.vestibuleVisitors.map(placement => placement.playerId)).toEqual(
    players.map(player => player.id),
  )
})

it('детерминированно размещает, замораживает и сохраняет начальных посетителей', () => {
  const config: GameConfig = { playerCount: 2, seed: -42 }
  const first = createGame(config, twoPlayerConfigs)
  const second = createGame({ ...config }, twoPlayerConfigs.map(player => ({ ...player })))
  const regularPlay = startGame(first)
  const endingCurrentRound = triggerGameEnd(advanceTurn(regularPlay).state)

  expect(first.plazaVisitors).toEqual(second.plazaVisitors)
  expect(first.vestibuleVisitors).toEqual(second.vestibuleVisitors)
  expect(Object.isFrozen(first.plazaVisitors)).toBe(true)
  expect(Object.isFrozen(first.vestibuleVisitors)).toBe(true)
  expect(first.plazaVisitors.every(Object.isFrozen)).toBe(true)
  expect(first.vestibuleVisitors.every(Object.isFrozen)).toBe(true)
  expect(regularPlay.plazaVisitors).toBe(first.plazaVisitors)
  expect(regularPlay.vestibuleVisitors).toBe(first.vestibuleVisitors)
  expect(endingCurrentRound.state.plazaVisitors).toBe(first.plazaVisitors)
  expect(endingCurrentRound.state.vestibuleVisitors).toBe(first.vestibuleVisitors)
})

it('сохраняет в GameState четыре стопки работ без потерь и дубликатов', () => {
  const state = createGame(twoPlayerGameConfig, twoPlayerConfigs)
  const market = state.artworkMarket
  const deferred = Object.values(market.deferredArtworksByGenre)
  const open = Object.values(market.openArtworksByGenre)
  const remaining = Object.values(market.remainingArtworksByGenre).flat()
  const allArtworkIds = [
    ...deferred.map(artwork => artwork.id),
    ...open.map(slot => slot.artwork.id),
    ...remaining.map(artwork => artwork.id),
  ]

  expect(Object.keys(market.deferredArtworksByGenre)).toEqual(setupComponentCatalog.genreOrder)
  expect(Object.keys(market.openArtworksByGenre)).toEqual(setupComponentCatalog.genreOrder)
  expect(Object.keys(market.remainingArtworksByGenre)).toEqual(setupComponentCatalog.genreOrder)
  expect(new Set(allArtworkIds).size).toBe(setupComponentCatalog.artworks.length)
  expect([...allArtworkIds].sort()).toEqual(
    setupComponentCatalog.artworks.map(artwork => artwork.id).sort(),
  )
  for (const slot of open) {
    expect(slot.visitors).toHaveLength(slot.artwork.visitorCount)
  }
})

it('детерминированно готовит, замораживает и сохраняет рынок работ', () => {
  const config: GameConfig = { playerCount: 2, seed: -42 }
  const first = createGame(config, twoPlayerConfigs)
  const second = createGame({ ...config }, twoPlayerConfigs.map(player => ({ ...player })))
  const regularPlay = startGame(first)
  const endingCurrentRound = triggerGameEnd(advanceTurn(regularPlay).state)

  expect(first.artworkMarket).toEqual(second.artworkMarket)
  expect(Object.isFrozen(first.artworkMarket)).toBe(true)
  expect(Object.isFrozen(first.artworkMarket.deferredArtworksByGenre)).toBe(true)
  expect(Object.isFrozen(first.artworkMarket.openArtworksByGenre)).toBe(true)
  expect(Object.isFrozen(first.artworkMarket.remainingArtworksByGenre)).toBe(true)
  expect(regularPlay.artworkMarket).toBe(first.artworkMarket)
  expect(endingCurrentRound.state.artworkMarket).toBe(first.artworkMarket)
})

it('сохраняет в GameState точные версии правил, компонентов и алгоритма подготовки', () => {
  const state = createGame(twoPlayerGameConfig, twoPlayerConfigs)

  expect(state.setupVersions).toEqual({
    rulesVersion: 'galerist-rules-2026-09-15-v1',
    componentsVersion: setupComponentCatalog.componentsVersion,
    setupAlgorithmVersion: 'setup-rng-v1',
  })
  expect(Object.keys(state.setupVersions).sort()).toEqual([
    'componentsVersion',
    'rulesVersion',
    'setupAlgorithmVersion',
  ])
  expect(state.setupVersions).not.toHaveProperty('seed')
  expect(state.setupVersions).not.toHaveProperty('playerIds')
  expect(Object.isFrozen(state.setupVersions)).toBe(true)
})

it('сохраняет тот же замороженный объект версий при переходах lifecycle', () => {
  const setup = createGame(twoPlayerGameConfig, twoPlayerConfigs)
  const regularPlay = startGame(setup)
  const nextTurn = advanceTurn(regularPlay).state
  const endingCurrentRound = triggerGameEnd(nextTurn)

  expect(regularPlay.setupVersions).toBe(setup.setupVersions)
  expect(nextTurn.setupVersions).toBe(setup.setupVersions)
  expect(endingCurrentRound.state.setupVersions).toBe(setup.setupVersions)
})

it.each([
  [2, twoPlayerConfigs, 2],
  [3, threePlayerConfigs, 1],
  [4, fourPlayerConfigs, 0],
] as const)('для %i игроков раздаёт по одной приватной цели каждого типа', (playerCount, players, expectedRemainingCount) => {
  const state = createGame({ playerCount, seed: 42 }, players)
  const goalsByPlayer = state.privateGoals.goalsByPlayer
  const dealt = Object.values(goalsByPlayer)
  const allCuratorIds = [
    ...dealt.map(goals => goals.curatorGoal.id),
    ...state.privateGoals.remainingCuratorGoals.map(goal => goal.id),
  ]
  const allDealerIds = [
    ...dealt.map(goals => goals.dealerGoal.id),
    ...state.privateGoals.remainingDealerGoals.map(goal => goal.id),
  ]

  expect(Object.keys(goalsByPlayer)).toEqual(players.map(player => player.id))
  expect(dealt).toHaveLength(playerCount)
  expect(dealt.every(goals => goals.curatorGoal.type === 'curator')).toBe(true)
  expect(dealt.every(goals => goals.dealerGoal.type === 'dealer')).toBe(true)
  expect(state.privateGoals.remainingCuratorGoals).toHaveLength(expectedRemainingCount)
  expect(state.privateGoals.remainingDealerGoals).toHaveLength(expectedRemainingCount)
  expect(new Set(allCuratorIds).size).toBe(4)
  expect(new Set(allDealerIds).size).toBe(4)
  expect([...allCuratorIds].sort()).toEqual([...setupComponentCatalog.curatorGoals].sort())
  expect([...allDealerIds].sort()).toEqual([...setupComponentCatalog.dealerGoals].sort())
})

it('детерминированно раздаёт, глубоко замораживает и сохраняет приватные цели', () => {
  const config: GameConfig = { playerCount: 2, seed: -42 }
  const first = createGame(config, twoPlayerConfigs)
  const second = createGame({ ...config }, twoPlayerConfigs.map(player => ({ ...player })))
  const regularPlay = startGame(first)
  const endingCurrentRound = triggerGameEnd(advanceTurn(regularPlay).state)

  expect(first.privateGoals).toEqual(second.privateGoals)
  expect(Object.isFrozen(first.privateGoals)).toBe(true)
  expect(Object.isFrozen(first.privateGoals.goalsByPlayer)).toBe(true)
  expect(Object.isFrozen(first.privateGoals.remainingCuratorGoals)).toBe(true)
  expect(Object.isFrozen(first.privateGoals.remainingDealerGoals)).toBe(true)
  expect(Object.values(first.privateGoals.goalsByPlayer).every(Object.isFrozen)).toBe(true)
  expect(regularPlay.privateGoals).toBe(first.privateGoals)
  expect(endingCurrentRound.state.privateGoals).toBe(first.privateGoals)
})

it.each([
  [2, twoPlayerConfigs],
  [3, threePlayerConfigs],
  [4, fourPlayerConfigs],
] as const)('для %i игроков сохраняет подготовленные планшеты в порядке мест', (playerCount, players) => {
  const state = createGame({ playerCount, seed: 42 }, players)

  expect(state.playerBoards).toHaveLength(playerCount)
  expect(state.playerBoards.map(board => board.playerId)).toEqual(
    players.map(player => player.id),
  )
  expect(state.playerBoards.every(board => (
    board.assistants.office === setupComponentCatalog.assistantsPerPlayer.office
    && board.assistants.hireQueue === setupComponentCatalog.assistantsPerPlayer.hireQueue
    && board.startingLocationId === null
    && board.thirdPartitionReputationTokenId === null
  ))).toBe(true)
})

it('глубоко замораживает и сохраняет планшеты при переходах lifecycle', () => {
  const setup = createGame(twoPlayerGameConfig, twoPlayerConfigs)
  const completedSetup = completeStartingLocationSelection(setup)
  const regularPlay = startGameFromSetup(completedSetup)
  const nextTurn = advanceTurn(regularPlay).state
  const endingCurrentRound = triggerGameEnd(nextTurn)

  expect(Object.isFrozen(setup.playerBoards)).toBe(true)
  expect(setup.playerBoards.every(Object.isFrozen)).toBe(true)
  expect(setup.playerBoards.every(board => Object.isFrozen(board.assistants))).toBe(true)
  expect(regularPlay.playerBoards).toBe(completedSetup.playerBoards)
  expect(nextTurn.playerBoards).toBe(completedSetup.playerBoards)
  expect(endingCurrentRound.state.playerBoards).toBe(completedSetup.playerBoards)
})

it.each([
  [2, 42, twoPlayerConfigs, ['player-2', 'player-1']],
  [3, -1, threePlayerConfigs, ['player-2', 'player-1', 'player-3']],
  [4, 1, fourPlayerConfigs, ['player-1', 'player-4', 'player-3', 'player-2']],
] as const)('для %i игроков строит обратный порядок выбора стартовых локаций', (playerCount, seed, players, expectedOrder) => {
  const state = createGame({ playerCount, seed }, players)

  expect(state.setupStage).toBe('choosing_starting_locations')
  expect(state.startingLocationSelectionOrder).toEqual(expectedOrder)
  expect(state.currentStartingLocationPlayerId).toBe(expectedOrder[0])
  expect(state.availableStartingLocationIds).toEqual(
    setupComponentCatalog.startingLocationOrder,
  )
  expect(state).not.toHaveProperty('firstPlayerId')
  expect(Object.isFrozen(state.startingLocationSelectionOrder)).toBe(true)
  expect(Object.isFrozen(state.availableStartingLocationIds)).toBe(true)
})

it('удаляет временные поля выбора локаций при переходе в regular_play', () => {
  const setup = createGame(twoPlayerGameConfig, twoPlayerConfigs)
  const setupSnapshot = structuredClone(setup)
  const regularPlay = startGame(setup)

  expect(regularPlay).not.toHaveProperty('setupStage')
  expect(regularPlay).not.toHaveProperty('startingLocationSelectionOrder')
  expect(regularPlay).not.toHaveProperty('currentStartingLocationPlayerId')
  expect(regularPlay).not.toHaveProperty('availableStartingLocationIds')
  expect(setup).toEqual(setupSnapshot)
})

it.each([
  [2, twoPlayerConfigs, 1],
  [3, threePlayerConfigs, 2],
  [4, fourPlayerConfigs, 3],
] as const)('для %i игроков сохраняет в GameState нужное число выдающихся работ', (playerCount, players, expectedArtworkCount) => {
  const state = createGame({ playerCount, seed: 42 }, players)
  const deferredIds = new Set(
    Object.values(state.artworkMarket.deferredArtworksByGenre).map(artwork => artwork.id),
  )
  const auctionIds = state.masterpieceAuction.artworks.map(artwork => artwork.id)

  expect(state.masterpieceAuction.artworks).toHaveLength(expectedArtworkCount)
  expect(new Set(auctionIds).size).toBe(expectedArtworkCount)
  expect(auctionIds.every(id => deferredIds.has(id))).toBe(true)
})

it('детерминированно готовит, замораживает и сохраняет аукцион выдающихся работ', () => {
  const config: GameConfig = { playerCount: 2, seed: -42 }
  const first = createGame(config, twoPlayerConfigs)
  const second = createGame({ ...config }, twoPlayerConfigs.map(player => ({ ...player })))
  const regularPlay = startGame(first)
  const endingCurrentRound = triggerGameEnd(advanceTurn(regularPlay).state)

  expect(first.masterpieceAuction).toEqual(second.masterpieceAuction)
  expect(Object.isFrozen(first.masterpieceAuction)).toBe(true)
  expect(Object.isFrozen(first.masterpieceAuction.artworks)).toBe(true)
  expect(first.masterpieceAuction.artworks.every(Object.isFrozen)).toBe(true)
  expect(regularPlay.masterpieceAuction).toBe(first.masterpieceAuction)
  expect(endingCurrentRound.state.masterpieceAuction).toBe(first.masterpieceAuction)
})

it.each([
  [2, twoPlayerConfigs, 8, 8],
  [3, threePlayerConfigs, 12, 4],
  [4, fourPlayerConfigs, 12, 4],
] as const)('сохраняет в GameState полную раскладку международного рынка для %i игроков', (playerCount, players, expectedTableCount, expectedRemainingCount) => {
  const state = createGame({ playerCount, seed: 42 }, players)
  const market = state.internationalMarket
  const placedIds = [
    ...market.marketReputationCells.map(cell => cell.tokenId),
    ...market.locationReputationTokens.map(location => location.tokenId),
  ]
  const allIds = [...placedIds, ...market.remainingReputationTokenIds]

  expect(market.marketReputationCells).toHaveLength(expectedTableCount)
  expect(market.locationReputationTokens).toHaveLength(4)
  expect(market.remainingReputationTokenIds).toHaveLength(expectedRemainingCount)
  expect(new Set(allIds).size).toBe(20)
  expect([...allIds].sort()).toEqual([...setupComponentCatalog.reputationTokenIds].sort())
  if (playerCount === 2) {
    expect(market.marketReputationCells.every(cell => cell.column !== 2)).toBe(true)
  }
})

it('детерминированно готовит, замораживает и сохраняет международный рынок', () => {
  const config: GameConfig = { playerCount: 2, seed: -42 }
  const first = createGame(config, twoPlayerConfigs)
  const second = createGame({ ...config }, twoPlayerConfigs.map(player => ({ ...player })))
  const completedSetup = completeStartingLocationSelection(first)
  const regularPlay = startGameFromSetup(completedSetup)
  const endingCurrentRound = triggerGameEnd(advanceTurn(regularPlay).state)

  expect(first.internationalMarket).toEqual(second.internationalMarket)
  expect(Object.isFrozen(first.internationalMarket)).toBe(true)
  expect(Object.isFrozen(first.internationalMarket.marketReputationCells)).toBe(true)
  expect(Object.isFrozen(first.internationalMarket.locationReputationTokens)).toBe(true)
  expect(Object.isFrozen(first.internationalMarket.remainingReputationTokenIds)).toBe(true)
  expect(first.internationalMarket.marketReputationCells.every(Object.isFrozen)).toBe(true)
  expect(first.internationalMarket.locationReputationTokens.every(Object.isFrozen)).toBe(true)
  expect(regularPlay.internationalMarket).toBe(completedSetup.internationalMarket)
  expect(endingCurrentRound.state.internationalMarket).toBe(completedSetup.internationalMarket)
})

it( 'отклоняет число игроков, не совпадающее с конфигурацией', () => {
  expect( () =>
    createGame(
      twoPlayerGameConfig,
      [ { id: 'player-1', name: 'Алина', kind: 'human' } ],
    ),
  ).toThrow( 'Player count must match config.playerCount' )
} )

it('хранит собственную копию списка игроков', () => {
  const playersLocal: PlayerConfig[] = [
    { id: 'player-1', name: 'Алина', kind: 'human' },
    { id: 'player-2', name: 'Алина', kind: 'human' }
  ]
  const playerLocal: PlayerConfig = { id: 'player-3', name: 'Алина', kind: 'human' }

  const state = createGame( { playerCount: 2, seed: 42 }, playersLocal )
  playersLocal.push( playerLocal )
  expect(state.players).toHaveLength(2)
  expect(state.players.some(val => val.id === 'player-3')).toBe(false)
})

it( 'запрещает изменение списка игроков в состоянии', () => {
  const player: PlayerState = {
    id: 'player-3',
    name: 'Алина',
    kind: 'human',
    coins: 10,
    influence: 10
  }
  const state = createGame( { playerCount: 2, seed: 42 }, twoPlayerConfigs )

  expect( () => ( state.players as PlayerState[] ).push( player ) ).toThrow()
  expect( state.players ).toHaveLength( 2 )
})

it( 'хранит собственную копию конфигурации игры', () => {
  const conf: GameConfig = { playerCount: 2, seed: 42 }
  const state = createGame( conf, twoPlayerConfigs )
  Object.assign(conf, { playerCount: 4, seed: 421 })
  expect(state.config).toEqual({ playerCount: 2, seed: 42 })
})

it( 'запрещает изменение конфигурации в состоянии', () => {

  const conf: GameConfig = { playerCount: 2, seed: 42 }
  const confEdit: GameConfig = { playerCount: 3, seed: 55 }

  const state = createGame( conf, twoPlayerConfigs )

  expect( () => Object.assign( state.config as GameConfig, confEdit)).toThrow()
  expect(state.config).toEqual({ playerCount: 2, seed: 42 })
})

it( 'сохраняет имена игроков после изменения исходных данных', () => {
  type Mutable<T> = { -readonly [K in keyof T]: T[K] }
  const conf: GameConfig = { playerCount: 2, seed: 42 }
  const players: Mutable<PlayerConfig>[] = [
    { id: 'player-1', name: 'Алина1', kind: 'human' },
    { id: 'player-2', name: 'Алина2', kind: 'human' },
  ]

  const state = createGame(conf, players)
  players[0]!.name = 'world'
  expect(state.players[0]!.name).toBe('Алина1')
})

it( 'отклоняет игроков с повторяющимися ID', () => {
  const players: PlayerConfig[] = [
    { id: 'player-1', name: 'Алина1', kind: 'human' },
    { id: 'player-1', name: 'Алина2', kind: 'human' },
  ]
  const conf: GameConfig = { playerCount: 2, seed: 42 }

  expect(() => createGame(conf, players)).toThrow('Players must have unique IDs')
})


it('запрещает изменение объектов игроков в состоянии', () => {
  const players: PlayerConfig[] = [
    { id: 'player-1', name: 'Алина1', kind: 'human' },
    { id: 'player-2', name: 'Алина2', kind: 'human' },
  ]

  const conf: GameConfig = { playerCount: 2, seed: 42 }

  const game = createGame(conf, players)

  expect( () => {
    ( game.players[ 0 ] as any ).name = 'Алина3'
  } ).toThrow( Error )
  expect(game.players[0]!.name).toBe('Алина1')
})

it('запрещает изменение номера раунда извне', () => {
  const conf: GameConfig = { playerCount: 2, seed: 42 }

  const game = createGame( conf, twoPlayerConfigs )

  expect( () => {
    ( game.round as any ) = 1
  } ).toThrow( Error )
  expect(game.round).toBe(0)
})

it('начинает игру без изменения исходного состояния', () => {

  const conf: GameConfig = { playerCount: 2, seed: 42 }
  const game = createGame( conf, twoPlayerConfigs )
  const startedGame = startGame(game)

  expect(game.status).toBe('setup')
  expect(game.round).toBe(0)
  expect(game.activePlayerId).toBe(null)

  expect(startedGame).not.toBe(game)

  expect(startedGame.status).toBe('in_progress')
  expect(startedGame.round).toBe(1)
  expect(startedGame.activePlayerId).toBe('player-1')

  expect(() => {
    (startedGame as any).round = 2
  }).toThrow()

  expect(startedGame.round).toBe(1)
})

it('передаёт ход следующему игроку без изменения номера раунда', () => {

  const conf: GameConfig = { playerCount: 2, seed: 42 }
  const game = createGame( conf, twoPlayerConfigs )
  const startedGame = startGame(game)

  const transition = advanceTurn(startedGame)
  const nextStep = transition.state

  expect(nextStep.activePlayerId).toBe('player-2')
  expect(nextStep.round).toBe(1)
  expect(transition.events).toEqual([
    { type: 'TurnEnded', playerId: 'player-1' },
    { type: 'TurnStarted', playerId: 'player-2' },
  ])
  expect(projectEventsForViewer(transition.events, nextStep, null)).toEqual(
    transition.events,
  )
  expect(Object.isFrozen(transition)).toBe(true)
  expect(Object.isFrozen(transition.state)).toBe(true)
  expect(Object.isFrozen(transition.events)).toBe(true)
  expect(startedGame).not.toBe(nextStep)
  expect(startedGame.activePlayerId).toBe('player-1')
  expect(startedGame.round).toBe(1)
})

it('завершает прежний и начинает новый ход при входе в финальный раунд', () => {
  const startedGame = startGame(createGame(twoPlayerGameConfig, twoPlayerConfigs))
  const endingCurrentRound = triggerGameEnd(startedGame).state
  const lastEndingTurn = advanceTurn(endingCurrentRound).state
  const transition = advanceTurn(lastEndingTurn)

  expect(transition.state.phase).toBe('final_round')
  expect(transition.state.activePlayerId).toBe('player-1')
  expect(transition.events).toEqual([
    { type: 'TurnEnded', playerId: 'player-2' },
    { type: 'RoundEnded', round: 1 },
    { type: 'RoundStarted', round: 2 },
    { type: 'TurnStarted', playerId: 'player-1' },
  ])
  expect(projectEventsForViewer(transition.events, transition.state, null)).toEqual(
    transition.events,
  )
  expect(Object.isFrozen(transition.events)).toBe(true)
  expect(transition.events.every(Object.isFrozen)).toBe(true)
})

it('начинает новый раунд с первого игрока', () => {

  const conf: GameConfig = { playerCount: 2, seed: 42 }
  const game = createGame( conf, twoPlayerConfigs )
  const startedGame = startGame(game)

  const nextStep1 = advanceTurn(startedGame).state
  const transition = advanceTurn(nextStep1)
  const nextStep2 = transition.state

  expect(nextStep1.activePlayerId).toBe('player-2');
  expect(nextStep2.activePlayerId).toBe('player-1');
  expect(nextStep1.round).toBe(1);
  expect(nextStep2.round).toBe(2);
  expect(nextStep1).not.toBe(nextStep2);
  expect(transition.events).toEqual([
    { type: 'TurnEnded', playerId: 'player-2' },
    { type: 'RoundEnded', round: 1 },
    { type: 'RoundStarted', round: 2 },
    { type: 'TurnStarted', playerId: 'player-1' },
  ])
  expect(projectEventsForViewer(transition.events, nextStep2, 'player-1')).toEqual(
    transition.events,
  )
  expect(transition.events.every(Object.isFrozen)).toBe(true)
  expect( () => {
    ( nextStep2 as any ).round = 3;
  } ).toThrow();

  expect(nextStep2.round).toBe(2);
})

it('начинает новый раунд с первого игрока при трёх участниках', () => {

  const conf: GameConfig = { playerCount: 3, seed: 42 }
  const game = createGame( conf, threePlayerConfigs )
  const startedGame = startGame(game)

  advanceAndExpectTurns(startedGame, [
    { activePlayerId: 'player-2', round: 1 },
    { activePlayerId: 'player-3', round: 1 },
    { activePlayerId: 'player-1', round: 2 },
    { activePlayerId: 'player-2', round: 2 },
    { activePlayerId: 'player-3', round: 2 },
    { activePlayerId: 'player-1', round: 3 },
  ])
})

it('начинает новый раунд с первого игрока при четырёх участниках', () => {

  const conf: GameConfig = { playerCount: 4, seed: 4 }
  const game = createGame( conf, fourPlayerConfigs )
  const startedGame = startGame(game)

  advanceAndExpectTurns(startedGame, [
    { activePlayerId: 'player-2', round: 1 },
    { activePlayerId: 'player-3', round: 1 },
    { activePlayerId: 'player-4', round: 1 },
    { activePlayerId: 'player-1', round: 2 },
    { activePlayerId: 'player-2', round: 2 },
    { activePlayerId: 'player-3', round: 2 },
    { activePlayerId: 'player-4', round: 2 },
    { activePlayerId: 'player-1', round: 3 },
  ])
})

it('запрещает передавать ход на этапе подготовки', () => {
  const state = createGame(
    { playerCount: 2, seed: 42 },
    twoPlayerConfigs,
  )
  const stateCLone = structuredClone(state)
  expect(() => advanceTurn(state).state).toThrow('Turns can only be advanced while game is in progress')
  expect(state).toEqual(stateCLone)
})

it('запрещает передавать ход после завершения игры', () => {

  const state: GameState = {
    ...startGame(createGame(twoPlayerGameConfig, twoPlayerConfigs)),
    id: 'game-1',
    phase: 'finished',
    status: 'finished',
    round: 0,
    activePlayerId: null,
    firstPlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: twoPlayerStates,
    endTriggeredRound: 0,
    winnerIds: ['player-1'],
  }
  const stateCLone = structuredClone(state)
  expect(() => advanceTurn(state).state).toThrow('Turns can only be advanced while game is in progress')
  expect(state).toEqual(stateCLone)
})

it('запускает завершение с новым замороженным состоянием без изменения входа', () => {
  const state: GameState = {
    ...startGame(createGame(twoPlayerGameConfig, twoPlayerConfigs)),
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 10,
    activePlayerId: 'player-1',
    config: { playerCount: 2, seed: 42 },
    players: twoPlayerStates,
    firstPlayerId: 'player-2',
  }
  const stateBefore = structuredClone(state)

  const trigger = triggerGameEnd(state)

  expect(trigger).not.toBe(state)
  expect(Object.isFrozen(trigger)).toBe(true)
  expect(Object.isFrozen(trigger.state)).toBe(true)
  expect(Object.isFrozen(trigger.events)).toBe(true)
  expect(trigger.events).toEqual([{ type: 'GameEndTriggered' }])
  expect(Object.isFrozen(trigger.events[0])).toBe(true)
  expect(state).toEqual(stateBefore)

  expect(trigger.state.id).toBe(state.id)
  expect(trigger.state.phase).toBe('ending_current_round')
  expect(trigger.state.status).toBe('in_progress')
  expect(trigger.state.round).toBe(10)
  expect(trigger.state.endTriggeredRound).toBe(10)
  expect(trigger.state.activePlayerId).toBe('player-1')
  expect(trigger.state.firstPlayerId).toBe('player-2')
  expect(trigger.state.config).toBe(state.config)
  expect(trigger.state.players).toBe(state.players)
})

it('отклоняет передачу хода при пустом ID активного игрока', () => {
  const state = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 0,
    activePlayerId: null,
    config: { playerCount: 2, seed: 42 },
    players: twoPlayerStates,
    firstPlayerId: 'player-1',
  }
  const stateBefore = structuredClone(state)

  expect(() => advanceTurn(state as unknown as GameState).state).toThrow(
    'Active player must belong to the game',
  )
  expect(state).toEqual(stateBefore)
})


it('возвращает новое замороженное состояние и сохраняет исходное', () => {
  const initialState: GameState = {
    ...startGame(createGame(twoPlayerGameConfig, twoPlayerConfigs)),
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 1,
    activePlayerId: 'player-1',
    config: { playerCount: 2, seed: 42 },
    players: twoPlayerStates,
    firstPlayerId: 'player-1',
  };

  const originalStateSnapshot = structuredClone(initialState);
  const nextState = advanceTurn(initialState).state;

  expect(initialState).toEqual(originalStateSnapshot);
  expect(nextState).not.toBe(initialState);
  expect(Object.isFrozen(nextState)).toBe(true);

});


it('отклоняет передачу хода неизвестного игрока', () => {
  const state: GameState = {
    ...startGame(createGame(twoPlayerGameConfig, twoPlayerConfigs)),
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 0,
    activePlayerId: 'random',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: twoPlayerStates,
    firstPlayerId: 'player-1',
  }

  const stateCLone = structuredClone(state)
  expect(() => advanceTurn(state).state).toThrow('Active player must belong to the game')
  expect(state).toEqual(stateCLone)
})

it('отклоняет передачу хода в фазе подготовки', () => {
  const state = {
    id: 'game-1',
    status: 'in_progress',
    phase: 'setup',
    round: 0,
    activePlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: twoPlayerStates,
    firstPlayerId: 'player-1',
  }

  const stateCLone = structuredClone(state)
  expect(() => advanceTurn(state as unknown as GameState).state).toThrow('Turns can only be advanced while game is in progress')
  expect(state).toEqual(stateCLone)
})

it('передаёт ход в фазе обычной игры', () => {
  const state: GameState = {
    ...startGame(createGame(twoPlayerGameConfig, twoPlayerConfigs)),
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 0,
    activePlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: twoPlayerStates,
    firstPlayerId: 'player-1'
  }

  const stateCLone = structuredClone(state)
  const advancedState = advanceTurn(state).state
  expect(advancedState.activePlayerId).toBe('player-2')
  expect(advancedState.firstPlayerId).toBe('player-1')
  expect(advancedState.phase).toBe('regular_play')
  expect(state).toEqual(stateCLone)
})

it('переводит игру в фазу обычной игры при запуске', () => {
  const state = createGame( twoPlayerGameConfig, twoPlayerConfigs )
  const startedGame = startGame(state)

  expect(startedGame.status).toBe('in_progress')
  expect(startedGame.phase).toBe('regular_play')
  expect(startedGame.activePlayerId).toBe('player-1')
  expect(startedGame.firstPlayerId).toBe('player-1')

})

it('переводит игру в фазу завершения текущего раунда', () => {
  const state: GameState = {
    ...triggerGameEnd(startGame(createGame(twoPlayerGameConfig, twoPlayerConfigs))).state,
    id: 'game-1',
    status: 'in_progress',
    phase: 'ending_current_round',
    round: 0,
    activePlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: twoPlayerStates,
    firstPlayerId: 'player-1',
    endTriggeredRound: 1
  }
  const et = advanceTurn(state).state

  expect(et.status).toBe('in_progress')
  expect(et.phase).toBe('ending_current_round')
  expect(et.endTriggeredRound).toBe(1)

})

it('отклоняет передачу хода в фазе итогового подсчёта', () => {
  const state: GameState = {
    ...triggerGameEnd(startGame(createGame(twoPlayerGameConfig, twoPlayerConfigs))).state,
    id: 'game-1',
    status: 'in_progress',
    phase: 'final_scoring',
    round: 0,
    activePlayerId: null,
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: twoPlayerStates,
    firstPlayerId: 'player-1',
    endTriggeredRound: 1,
    finalInfluenceScored: false,
  }

  expect(() => advanceTurn(state)).toThrow('Turns can only be advanced while game is in progress')

})

it('сохраняет активного и первого игроков при переходах', () => {
  const state: GameState = {
    ...startGame(createGame(twoPlayerGameConfig, twoPlayerConfigs)),
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 1,
    activePlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: [
      { id: 'player-1', name: 'Алина', kind: 'human', coins: 10, influence: 10 },
      { id: 'player-2', name: 'Бот', kind: 'bot', coins: 10, influence: 10 },
    ],
    firstPlayerId: 'player-2',
  }
  const stateAfterFirstAdvance = advanceTurn(state).state
  const stateAfterSecondAdvance = advanceTurn(stateAfterFirstAdvance).state
  expect(stateAfterSecondAdvance.round).toBe(2)
  expect(stateAfterFirstAdvance.round).toBe(2)
  expect(stateAfterFirstAdvance.activePlayerId).toBe('player-2')
  expect(stateAfterFirstAdvance.firstPlayerId).toBe('player-2')
  expect(stateAfterSecondAdvance.activePlayerId).toBe('player-1')
  expect(stateAfterSecondAdvance.firstPlayerId).toBe('player-2')

})

it('передаёт ход в финальном раунде', () => {
  const state: GameState = {
    ...triggerGameEnd(startGame(createGame(twoPlayerGameConfig, twoPlayerConfigs))).state,
    id: 'game-1',
    status: 'in_progress',
    phase: 'final_round',
    round: 10,
    activePlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: twoPlayerStates,
    firstPlayerId: 'player-2',
    endTriggeredRound: 2
  }
  const stateBefore = structuredClone(state)
  const transition = advanceTurn(state)
  const at = transition.state

  expect(at.phase).toBe('final_scoring')
  expect(at.firstPlayerId).toBe('player-2')
  expect(at.endTriggeredRound).toBe(2)
  expect(transition.events).toEqual([
    { type: 'TurnEnded', playerId: 'player-1' },
    { type: 'RoundEnded', round: 10 },
    { type: 'FinalScoringStarted' },
  ])
  expect(projectEventsForViewer(transition.events, at, null)).toEqual(transition.events)
  expect(projectEventsForViewer(transition.events, at, 'player-1')).toEqual(transition.events)
  expect(Object.isFrozen(transition)).toBe(true)
  expect(Object.isFrozen(transition.state)).toBe(true)
  expect(Object.isFrozen(transition.events)).toBe(true)
  expect(Object.isFrozen(transition.events[0])).toBe(true)
  expect(state).toEqual(stateBefore)
})

it('запускает завершение только из фазы обычной игры', () => {
  const state: GameState = {
    ...startGame(createGame(twoPlayerGameConfig, twoPlayerConfigs)),
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 10,
    activePlayerId: 'player-1',
    config: {
      playerCount: 2,
      seed: 42,
    },
    players: twoPlayerStates,
    firstPlayerId: 'player-2',
  }

  const trigger = triggerGameEnd(state)
  const triggerClone = structuredClone(trigger)

  expect(trigger.state.phase).toBe('ending_current_round')
  expect(trigger.state.endTriggeredRound).toBe(10)
  expect(trigger.state.players).toEqual(state.players)
  expect(trigger.state.config).toEqual(state.config)
  expect(trigger.state.firstPlayerId).toBe(state.firstPlayerId)
  expect(trigger.state.round).toBe(state.round)
  expect(trigger.state.status).toBe(state.status)
  expect(trigger.state.activePlayerId).toBe(state.activePlayerId)
  expect(trigger).toEqual(triggerClone)
})

it('отклоняет повторный запуск завершения', () => {
  const regularState = startGame( createGame( twoPlayerGameConfig, twoPlayerConfigs ) )
  const endingState = triggerGameEnd(regularState)
  const endingStateBefore = structuredClone(endingState)

  expect(() => triggerGameEnd(endingState.state)).toThrow('Only regular_play')
  expect(endingState).toEqual(endingStateBefore)
})

it('переходит к итоговому подсчёту после всех завершающих раундов', () => {
  const state: GameState = {
    ...startGame(createGame({ playerCount: 3, seed: 42 }, threePlayerConfigs)),
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 10,
    activePlayerId: 'player-1',
    config: {
      playerCount: 3,
      seed: 42,
    },
    players: threePlayerStates,
    firstPlayerId: 'player-1',
  }

  const trigger = triggerGameEnd(state)
  const stateAfterFirstAdvance = advanceTurn(trigger.state).state
  const stateAfterSecondAdvance = advanceTurn(stateAfterFirstAdvance).state
  const stateAfterThirdAdvance = advanceTurn(stateAfterSecondAdvance).state
  const stateAfterFourthAdvance = advanceTurn(stateAfterThirdAdvance).state
  const stateAfterFifthAdvance = advanceTurn(stateAfterFourthAdvance).state
  const stateAfterSixthAdvance = advanceTurn(stateAfterFifthAdvance).state


  expectEndingTurns([stateAfterFirstAdvance, stateAfterSecondAdvance, stateAfterThirdAdvance, stateAfterFourthAdvance, stateAfterFifthAdvance, stateAfterSixthAdvance], state, [
    ['ending_current_round', 10, 'player-1', 'player-2'],
    ['ending_current_round', 10, 'player-1', 'player-3'],
    ['final_round', 11, 'player-1', 'player-1'],
    ['final_round', 11, 'player-1', 'player-2'],
    ['final_round', 11, 'player-1', 'player-3'],
    ['final_scoring', 11, 'player-1', null],
  ])
})

it('завершает раунды при втором первом игроке и первом активном', () => {
  const state: GameState = {
    ...startGame(createGame({ playerCount: 3, seed: 42 }, threePlayerConfigs)),
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 10,
    activePlayerId: 'player-1',
    config: {
      playerCount: 3,
      seed: 42,
    },
    players: threePlayerStates,
    firstPlayerId: 'player-2',
  }

  const trigger = triggerGameEnd(state)
  const stateAfterFirstAdvance = advanceTurn(trigger.state).state
  const stateAfterSecondAdvance = advanceTurn(stateAfterFirstAdvance).state
  const stateAfterThirdAdvance = advanceTurn(stateAfterSecondAdvance).state
  const stateAfterFourthAdvance = advanceTurn(stateAfterThirdAdvance).state

  expectEndingTurns([stateAfterFirstAdvance, stateAfterSecondAdvance, stateAfterThirdAdvance, stateAfterFourthAdvance], state, [
    ['final_round', 11, 'player-2', 'player-2'],
    ['final_round', 11, 'player-2', 'player-3'],
    ['final_round', 11, 'player-2', 'player-1'],
    ['final_scoring', 11, 'player-2', null],
  ])

})

it('завершает раунды при втором первом игроке и третьем активном', () => {
  const state: GameState = {
    ...startGame(createGame({ playerCount: 3, seed: 42 }, threePlayerConfigs)),
    id: 'game-1',
    status: 'in_progress',
    phase: 'regular_play',
    round: 10,
    activePlayerId: 'player-1',
    config: {
      playerCount: 3,
      seed: 42,
    },
    players: threePlayerStates,
    firstPlayerId: 'player-3',
  }

  const trigger = triggerGameEnd(state)
  const stateAfterFirstAdvance = advanceTurn(trigger.state).state
  const stateAfterSecondAdvance = advanceTurn(stateAfterFirstAdvance).state
  const stateAfterThirdAdvance = advanceTurn(stateAfterSecondAdvance).state
  const stateAfterFourthAdvance = advanceTurn(stateAfterThirdAdvance).state
  const stateAfterFifthAdvance = advanceTurn(stateAfterFourthAdvance).state

  expectEndingTurns([stateAfterFirstAdvance, stateAfterSecondAdvance, stateAfterThirdAdvance, stateAfterFourthAdvance, stateAfterFifthAdvance], state, [
    ['ending_current_round', 10, 'player-3', 'player-2'],
    ['final_round', 11, 'player-3', 'player-3'],
    ['final_round', 11, 'player-3', 'player-1'],
    ['final_round', 11, 'player-3', 'player-2'],
    ['final_scoring', 11, 'player-3', null],
  ])

})

it('переходит к итоговому подсчёту после хода третьего игрока', () => {
  const state: SetupGameState = createGame( twoPlayerGameConfig, twoPlayerConfigs )
  expect(() => triggerGameEnd(state)).toThrow('Only regular_play')
})

it.each([
  { seed: 0, expectedPlayer: 'player-1' },
  { seed: 1, expectedPlayer: 'player-2' },
  { seed: 2, expectedPlayer: 'player-3' },
  { seed: 3, expectedPlayer: 'player-1' },
])('выбирает $expectedPlayer при seed: $seed', ({ seed, expectedPlayer }) => {
  const createdGame = createGame(
    { playerCount: 3, seed },
    threePlayerConfigs
  )
  const startedGame = startGame(createdGame)

  expect(startedGame.firstPlayerId).toBe(expectedPlayer)
  expect(startedGame.activePlayerId).toBe(expectedPlayer)
})

it('выбирает одного и того же игрока при одинаковом seed', () => {


  const cg1 = createGame( { playerCount: 3, seed: 42 }, threePlayerConfigs )
  const sg1 = startGame(cg1)

  const cg2 = createGame( { playerCount: 3, seed: 42 }, threePlayerConfigs )
  const sg2 = startGame(cg2)

  expect(sg1.firstPlayerId).toBe(sg2.firstPlayerId)
})

it('проверка невалидных значений в seed', () => {

  const createdGame = createGame( { playerCount: 3, seed: -1 }, threePlayerConfigs )
  const startedGame = startGame(createdGame)
  expect(startedGame.firstPlayerId).toBe('player-3')
  expect( () => createGame( { playerCount: 3, seed: NaN }, threePlayerConfigs ) ).toThrow( 'Seed must be a safe integer' )
  expect( () => createGame( { playerCount: 3, seed: Infinity }, threePlayerConfigs ) ).toThrow( 'Seed must be a safe integer' )
  expect( () => createGame( { playerCount: 3, seed: 9007199254740992 }, threePlayerConfigs ) ).toThrow( 'Seed must be a safe integer' )
  expect( () => createGame( { playerCount: 3, seed: 42.32 }, threePlayerConfigs ) ).toThrow( 'Seed must be a safe integer' )
})

it('каждый ID игрока достижим подходящим seed', () => {

  const firstPlayersSelected: Set<string> = new Set()

  for (let seed = 0; seed < 10; seed++) {
    const createdGame = createGame( { playerCount: 3, seed }, threePlayerConfigs )
    const startedGame = startGame(createdGame)

    firstPlayersSelected.add(startedGame.firstPlayerId)
  }

  expect( firstPlayersSelected.size ).toBe( threePlayerConfigs.length )

  expect(firstPlayersSelected.has('player-1')).toBe(true)
  expect(firstPlayersSelected.has('player-2')).toBe(true)
  expect(firstPlayersSelected.has('player-3')).toBe(true)
})

it('переходы хода и увеличение раунда при первом игроке, отличном от players[0]', () => {

  const conf: GameConfig = { playerCount: 3, seed: 1 }
  const createdGame = createGame( conf, threePlayerConfigs )
    const startedGame = startGame(createdGame)
    const stateAfterFirstAdvance = advanceTurn(startedGame).state
    const stateAfterSecondAdvance = advanceTurn(stateAfterFirstAdvance).state
    const stateAfterThirdAdvance = advanceTurn(stateAfterSecondAdvance).state

    expect(startedGame.round).toBe(1)
    expect(startedGame.firstPlayerId).toBe('player-2')
    expect(startedGame.activePlayerId).toBe('player-2')
    expect(stateAfterFirstAdvance.round).toBe(1)
    expect(stateAfterFirstAdvance.firstPlayerId).toBe('player-2')
    expect(stateAfterFirstAdvance.activePlayerId).toBe('player-3')
    expect(stateAfterSecondAdvance.round).toBe(1)
    expect(stateAfterSecondAdvance.firstPlayerId).toBe('player-2')
    expect(stateAfterSecondAdvance.activePlayerId).toBe('player-1')
    expect(stateAfterThirdAdvance.round).toBe(2)
    expect(stateAfterThirdAdvance.firstPlayerId).toBe('player-2')
    expect(stateAfterThirdAdvance.activePlayerId).toBe('player-2')
})

type PlayerConfigWithResources = PlayerConfig & {
  readonly coins: number
  readonly influence: number
}

interface InitialResourceInitializationCase {
  readonly config: GameConfig
  readonly playerConfigs: readonly PlayerConfig[]
}

const playerConfigsWithPreexistingResources: readonly PlayerConfigWithResources[] = [
  { id: 'player-1', name: 'Алина', kind: 'human', coins: 110, influence: 1230 },
  { id: 'player-2', name: 'Бот', kind: 'bot', coins: 11440, influence: 130 },
  { id: 'player-3', name: 'Бот', kind: 'bot', coins: 1510, influence: 104 },
  { id: 'player-4', name: 'Бот', kind: 'bot', coins: 1140, influence: 110 },
]

const initialResourceInitializationCases: readonly InitialResourceInitializationCase[] = [
  { config: { playerCount: 2, seed: 1 }, playerConfigs: twoPlayerConfigs },
  { config: { playerCount: 3, seed: -5 }, playerConfigs: threePlayerConfigs },
  { config: { playerCount: 4, seed: 1233 }, playerConfigs: fourPlayerConfigs },
  {
    config: { playerCount: 4, seed: 1232313 },
    playerConfigs: playerConfigsWithPreexistingResources,
  },
]

it.each(initialResourceInitializationCases)(
  'выбирает количество игроков, сохраняет их данные, порядок, проверяет ресурсы и неизменность входа',
  ({ config, playerConfigs }) => {
    const configSnapshot = structuredClone(config)
    const numPlayersSnapshot = structuredClone(playerConfigs)

    const createdGame = createGame(config, playerConfigs)
    const startedGame = startGame(createdGame)
    const stateAfterFirstAdvance = advanceTurn(startedGame).state

    expect(Object.isFrozen(createdGame.config)).toBe(true)
    expect(Object.isFrozen(createdGame.players)).toBe(true)
    expect(Object.isFrozen(createdGame)).toBe(true)

    createdGame.players.forEach(player => {
      expect(Object.isFrozen(player)).toBe(true)
    })
    expect(createdGame.players).toHaveLength(playerConfigs.length)

    const states = [createdGame, startedGame, stateAfterFirstAdvance]
    const expectedMeta = playerConfigs.map(({ id, name, kind }) => ({ id, name, kind }))

    states.forEach(gameState => {
      const actualMeta = gameState.players.map(({ id, name, kind }) => ({ id, name, kind }))
      expect(actualMeta).toEqual(expectedMeta)
      gameState.players.forEach(player => {
        expect(player.coins).toBe(10)
        expect(player.influence).toBe(10)
      })
    })

    expect(config).toEqual(configSnapshot)
    expect(playerConfigs).toEqual(numPlayersSnapshot)
  },
)

it('влияние и монеты не изменяются с раундами', () => {
  const initialSetup = createGame(
    { playerCount: 4, seed: 2543 },
    fourPlayerConfigs,
  )
  const customCreatedGame: SetupGameState = Object.freeze({
    ...initialSetup,
    players: Object.freeze([
      {
        id: 'player-1',
        name: 'Алина1',
        kind: 'human' as const,
        coins: 18,
        influence: 15
      },
      {
        id: 'player-2',
        name: 'Алина2',
        kind: 'human' as const,
        coins: 51,
        influence: 9
      },
      {
        id: 'player-3',
        name: 'Алина1',
        kind: 'human' as const,
        coins: 61,
        influence: 23
      },
      {
        id: 'player-4',
        name: 'Алина',
        kind: 'human' as const,
        coins: 31,
        influence: 22
      },
    ]),
  })
  const snapshot = structuredClone(customCreatedGame)
  const startedGame = startGame(customCreatedGame)
  const stateAfterFirstAdvance = advanceTurn(startedGame).state
  const endTriggeredState = triggerGameEnd(stateAfterFirstAdvance)
  const stateAfterSecondAdvance = advanceTurn(endTriggeredState.state).state
  const stateAfterThirdAdvance = advanceTurn(stateAfterSecondAdvance).state
  const stateAfterFourthAdvance = advanceTurn(stateAfterThirdAdvance).state
  const stateAfterFifthAdvance = advanceTurn(stateAfterFourthAdvance).state
  const stateAfterSixthAdvance = advanceTurn(stateAfterFifthAdvance).state
  const stateAfterSeventhAdvance = advanceTurn(stateAfterSixthAdvance).state
  const stateAfterEighthAdvance = advanceTurn(stateAfterSeventhAdvance).state

  const states = [startedGame, stateAfterFirstAdvance, endTriggeredState.state, stateAfterSecondAdvance, stateAfterThirdAdvance, stateAfterFourthAdvance, stateAfterFifthAdvance, stateAfterSixthAdvance, stateAfterSeventhAdvance, stateAfterEighthAdvance]
  states.forEach(state => {
    expect(state.players).toEqual(snapshot.players)
    expect(state.players).toBe(customCreatedGame.players)
  })
  expect(customCreatedGame).toEqual(snapshot)
  expect(stateAfterEighthAdvance.phase).toBe('final_scoring')
})

it.each([1, 5])('отклоняет согласованную конфигурацию на $playerCount игроков', playerCount => {
  const config = { playerCount, seed: 42 } as unknown as GameConfig
  const matchingPlayers = Array.from(
    { length: playerCount },
    (_, index): PlayerConfig => ({
      id: `player-${index + 1}`,
      name: `Игрок ${index + 1}`,
      kind: 'human',
    }),
  )

  expect(() => createGame(config, matchingPlayers)).toThrow('Player count must be 2, 3, or 4')
})

it.each([
  [2, twoPlayerConfigs],
  [3, threePlayerConfigs],
  [4, fourPlayerConfigs],
] as const)('принимает допустимую конфигурацию на %i игроков', (playerCount, matchingPlayers) => {
  const game = createGame({ playerCount, seed: 42 }, matchingPlayers)

  expect(game.config.playerCount).toBe(playerCount)
  expect(game.players).toHaveLength(playerCount)
})
