import { describe, expect, it } from 'vitest'
import {
  chooseStartingLocation,
  createGame,
  startGame,
  type GameEvent,
  type PlayerConfig,
  type SetupGameState,
} from '../src/index.js'
import {
  fourPlayerConfigs,
  threePlayerConfigs,
  twoPlayerConfigs,
} from './fixtures.js'

function completeSetup(state: SetupGameState): SetupGameState {
  let current = state
  while (current.setupStage === 'choosing_starting_locations') {
    current = chooseStartingLocation(
      current,
      current.currentStartingLocationPlayerId!,
      current.availableStartingLocationIds[0]!,
    ).state
  }
  return current
}

describe('полный setup-пайплайн', () => {
  it('возвращает замороженное состояние и упорядоченные события подготовки', () => {
    const transition = createGame(
      { playerCount: 2, seed: 42 },
      twoPlayerConfigs,
    )

    expect(transition.events.map(event => event.type)).toEqual([
      'OrderMarketPrepared',
      'TicketOfficePrepared',
      'PromotionSupplyPrepared',
      'ArtistsPrepared',
      'ArtistOpened',
      'VisitorBagPrepared',
      'ArtworkMarketPrepared',
      'InternationalMarketPrepared',
      'LocationReputationPrepared',
      'MasterpieceAuctionPrepared',
      'InitialVisitorsPlaced',
      'FirstPlayerSelected',
      'PrivateGoalsDealt',
      'PrivateGoalsDealt',
      'PlayerBoardPrepared',
      'PlayerBoardPrepared',
      'GameCreated',
    ])
    expect(transition.events).toContainEqual({
      type: 'FirstPlayerSelected',
      playerId: 'player-1',
    })
    expect(Object.isFrozen(transition)).toBe(true)
    expect(Object.isFrozen(transition.events)).toBe(true)
    expect(transition.events.every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(transition.state)).toBe(true)
  })

  it('возвращает события выбора локации и начала игры', () => {
    const initial = createGame(
      { playerCount: 2, seed: 42 },
      twoPlayerConfigs,
    ).state
    const playerId = initial.currentStartingLocationPlayerId!
    const locationId = initial.availableStartingLocationIds[0]!
    const choice = chooseStartingLocation(initial, playerId, locationId)

    expect(choice.events).toEqual([{
      type: 'StartingLocationChosen',
      playerId,
      locationId,
    } satisfies GameEvent])

    const completed = completeSetup(choice.state)
    const started = startGame(completed)
    expect(started.events).toEqual([
      { type: 'GameStarted', gameId: completed.id },
      { type: 'RoundStarted', round: 1 },
      { type: 'TurnStarted', playerId: 'player-1' },
    ])
    expect(Object.isFrozen(choice)).toBe(true)
    expect(Object.isFrozen(started)).toBe(true)
  })

  it('хранит начальную известность только у открытого художника', () => {
    const state = createGame(
      { playerCount: 2, seed: 42 },
      twoPlayerConfigs,
    ).state
    const openSlot = state.artistSetup.slots.find(slot => slot.isOpen)!
    const closedSlots = state.artistSetup.slots.filter(slot => !slot.isOpen)

    expect(openSlot.fame).toBe(openSlot.initialFame)
    expect(closedSlots.every(slot => slot.fame === null)).toBe(true)
    expect(state.artistMarket.slots).toEqual(
      state.artistSetup.slots.map(({ bonus: _bonus, collector: _collector, signatureIds: _signatures, ...slot }) => slot),
    )
  })

  it.each([
    [2, twoPlayerConfigs, 1],
    [3, threePlayerConfigs, 2],
    [4, fourPlayerConfigs, 3],
  ] as const)('явно размещает работы на %i игроках по мольбертам', (playerCount, players, count) => {
    const auction = createGame({ playerCount, seed: 42 }, players).state.masterpieceAuction

    expect(auction.easels.map(easel => easel.easelId)).toEqual(
      Array.from({ length: count }, (_, index) => `AUCTION-EASEL-${index + 1}`),
    )
    expect(auction.easels.map(easel => easel.artwork)).toEqual(auction.artworks)
    expect(Object.isFrozen(auction.easels)).toBe(true)
    expect(auction.easels.every(Object.isFrozen)).toBe(true)
  })

  const goldenCases: readonly [
    playerCount: 2 | 3 | 4,
    players: readonly PlayerConfig[],
    expected: object,
  ][] = [
    [2, twoPlayerConfigs, {
      orders: ['ORDER-20', 'ORDER-16', 'ORDER-19', 'ORDER-08'],
      artists: ['ART-D-BLUE-1', 'ART-D-RED-5', 'ART-P-BLUE-4', 'ART-P-RED-8', 'ART-S-BLUE-3', 'ART-S-RED-7', 'ART-A-BLUE-5', 'ART-A-RED-10'],
      plaza: ['VIS-R-08', 'VIS-R-05', 'VIS-R-04', 'VIS-R-01'],
      locationTokens: ['REP-005', 'REP-008', 'REP-010', 'REP-012'],
      auction: ['WORK-P-01'],
    }],
    [3, threePlayerConfigs, {
      orders: ['ORDER-02', 'ORDER-09', 'ORDER-03', 'ORDER-07'],
      artists: ['ART-D-BLUE-4', 'ART-D-RED-5', 'ART-P-BLUE-4', 'ART-P-RED-5', 'ART-S-BLUE-3', 'ART-S-RED-7', 'ART-A-BLUE-3', 'ART-A-RED-10'],
      plaza: ['VIS-B-08', 'VIS-W-05', 'VIS-B-04', 'VIS-R-02'],
      locationTokens: ['REP-009', 'REP-001', 'REP-004', 'REP-003'],
      auction: ['WORK-A-02', 'WORK-P-01'],
    }],
    [4, fourPlayerConfigs, {
      orders: ['ORDER-05', 'ORDER-15', 'ORDER-09', 'ORDER-19'],
      artists: ['ART-D-BLUE-1', 'ART-D-RED-5', 'ART-P-BLUE-1', 'ART-P-RED-5', 'ART-S-BLUE-3', 'ART-S-RED-7', 'ART-A-BLUE-5', 'ART-A-RED-10'],
      plaza: ['VIS-B-02', 'VIS-W-07', 'VIS-R-07', 'VIS-B-11'],
      locationTokens: ['REP-020', 'REP-004', 'REP-008', 'REP-018'],
      auction: ['WORK-S-05', 'WORK-A-05', 'WORK-P-10'],
    }],
  ]

  it.each(goldenCases)(
    'совпадает с эталонной раскладкой для %i игроков и seed -42',
    (playerCount, players, expected) => {
      const state = createGame({ playerCount, seed: -42 }, players).state
      expect({
        orders: state.orderMarket.visibleOrders,
        artists: state.artistMarket.slots.map(slot => slot.artistId),
        plaza: state.plazaVisitors.map(visitor => visitor.id),
        locationTokens: state.internationalMarket.locationTokens.map(token => token.tokenId),
        auction: state.masterpieceAuction.artworks.map(artwork => artwork.id),
      }).toEqual(expected)
    },
  )

  it('продолжает setup из восстановленного снимка с тем же результатом', () => {
    const original = createGame(
      { playerCount: 3, seed: -42 },
      threePlayerConfigs,
    ).state
    const restored = JSON.parse(JSON.stringify(original)) as SetupGameState

    const originalResult = completeSetup(original)
    const restoredResult = completeSetup(restored)

    expect(restoredResult).toEqual(originalResult)
    expect(Object.isFrozen(restoredResult)).toBe(true)
  })
})
