import { describe, expect, it } from 'vitest'
import {
  applyArtworkPurchaseToGameState,
  projectEventsForViewer,
  projectGameForViewer,
  restoreGameState,
  type ArtworkPurchaseRequest,
  type GameState,
  type RegularPlayGameState,
} from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState, startGameAfterSetup } from './helpers.js'

type Scenario = 'tickets_and_bag' | 'tickets_and_superstars' | 'bag_and_superstars' | 'all' | 'one'

/** Each successful scenario reaches its second indicator through this purchase. */
function purchaseScenario(scenario: Scenario) {
  const base = structuredClone(startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs)))
  const artist = base.artistMarket.slots.find(slot => slot.isOpen)!
  const otherArtist = base.artistMarket.slots.find(slot => slot.artistId !== artist.artistId)!
  const open = base.artworkMarket.openArtworksByGenre[artist.genre]!
  const gainsSuperstar = scenario === 'bag_and_superstars' || scenario === 'all'
  const hasSuperstars = scenario === 'tickets_and_superstars'
  const emptiesBag = scenario === 'bag_and_superstars'
  const state: RegularPlayGameState = {
    ...base,
    round: 3,
    players: base.players.map(player => ({ ...player, coins: 30 })),
    ticketOffice: { ticketsByColor: scenario === 'bag_and_superstars'
      ? { B: 3, R: 3, W: 3 }
      : { B: 1, R: 0, W: 0 } },
    visitorBag: { visitors: scenario === 'tickets_and_bag' || scenario === 'all'
      ? [] : base.visitorBag.visitors.slice(0, 1) },
    artistMarket: {
      ...base.artistMarket,
      slots: base.artistMarket.slots.map(slot => slot.artistId === artist.artistId
        ? { ...slot, fame: gainsSuperstar ? 18 : slot.fame }
        : { ...slot, isSuperstar: hasSuperstars || (gainsSuperstar && slot.artistId === otherArtist.artistId) }),
    },
    artworkMarket: {
      ...base.artworkMarket,
      openArtworksByGenre: {
        ...base.artworkMarket.openArtworksByGenre,
        [artist.genre]: { ...open, artwork: { ...open.artwork, fameGain: 1, ticketReward: 'B' } },
      },
      remainingArtworksByGenre: {
        ...base.artworkMarket.remainingArtworksByGenre,
        [artist.genre]: emptiesBag ? [{ ...open.artwork, visitorCount: 1 }] : [],
      },
    },
  }
  const request: ArtworkPurchaseRequest = {
    playerId: state.activePlayerId,
    artistId: artist.artistId,
    purchaseType: 'regular',
    requestedTicketColors: ['B'],
  }
  return { state, request, artist }
}

describe('END-002: automatic game end after artwork purchase', () => {
  it.each(['tickets_and_bag', 'tickets_and_superstars', 'bag_and_superstars', 'all'] as const)(
    'uses all completed purchase effects: %s', scenario => {
      const { state, request, artist } = purchaseScenario(scenario)
      const before = structuredClone(state)
      const requestBefore = structuredClone(request)
      const transition = applyArtworkPurchaseToGameState(state, request)

      expect(transition.state).toMatchObject({
        phase: 'ending_current_round',
        endTriggeredRound: 3,
        round: 3,
        activePlayerId: state.activePlayerId,
        firstPlayerId: state.firstPlayerId,
      })
      expect(transition.state.players.find(player => player.id === request.playerId)!.acquiredArtworkCount).toBe(1)
      expect(transition.state.playerBoards.find(board => board.playerId === request.playerId)!
        .gallery.artworkSlots.some(slot => slot?.artistId === artist.artistId)).toBe(true)
      expect(transition.events.filter(event => event.type === 'GameEndTriggered')).toEqual([{ type: 'GameEndTriggered' }])
      expect(transition.events.at(-1)).toEqual({ type: 'GameEndTriggered' })
      expect(transition.events.findIndex(event => event.type === 'ArtworkExhibited')).toBeLessThan(transition.events.length - 1)
      if (scenario === 'bag_and_superstars') {
        expect(transition.state.visitorBag.visitors).toEqual([])
        expect(transition.events.at(-2)?.type).toBe('ArtworkMarketRefilled')
      }
      for (const viewer of [null, request.playerId]) {
        expect(projectEventsForViewer(transition.events, transition.state, viewer).at(-1)).toEqual({ type: 'GameEndTriggered' })
        expect(projectGameForViewer(transition.state, viewer)).toMatchObject({ phase: 'ending_current_round', endTriggeredRound: 3 })
      }
      expect(restoreGameState(transition.state)).toEqual(transition.state)
      expect(Object.isFrozen(transition)).toBe(true)
      expect(Object.isFrozen(transition.state)).toBe(true)
      expect(Object.isFrozen(transition.state.playerBoards[0]!.gallery.artworkSlots)).toBe(true)
      expect(Object.isFrozen(transition.events)).toBe(true)
      expect(transition.events.every(Object.isFrozen)).toBe(true)
      expect(state).toEqual(before)
      expect(request).toEqual(requestBefore)
      expect(Object.isFrozen(state)).toBe(false)
      expect(Object.isFrozen(state.ticketOffice.ticketsByColor)).toBe(false)
    },
  )

  it('keeps regular_play when only the ticket office becomes empty', () => {
    const { state, request } = purchaseScenario('one')
    const transition = applyArtworkPurchaseToGameState(state, request)
    expect(transition.state.ticketOffice.ticketsByColor).toEqual({ B: 0, R: 0, W: 0 })
    expect(transition.state.phase).toBe('regular_play')
    expect(transition.state).not.toHaveProperty('endTriggeredRound')
    expect(transition.events.some(event => event.type === 'GameEndTriggered')).toBe(false)
  })

  it('does not count an exhausted ticket color as an empty office', () => {
    const { state: base, request } = purchaseScenario('tickets_and_bag')
    const state: RegularPlayGameState = { ...base, ticketOffice: { ticketsByColor: { B: 1, R: 1, W: 0 } } }
    const transition = applyArtworkPurchaseToGameState(state, request)
    expect(transition.state.ticketOffice.ticketsByColor).toEqual({ B: 0, R: 1, W: 0 })
    expect(transition.state.phase).toBe('regular_play')
    expect(transition.events.some(event => event.type === 'GameEndTriggered')).toBe(false)
  })

  it.each(['ending_current_round', 'final_round'] as const)(
    'allows purchase in %s without triggering game end again', phase => {
      const { state: base, request } = purchaseScenario('all')
      const state: GameState = { ...base, phase, endTriggeredRound: 2 }
      const before = structuredClone(state)
      const transition = applyArtworkPurchaseToGameState(state, request)
      expect(transition.state).toMatchObject({ phase, endTriggeredRound: 2 })
      expect(transition.state.players.find(player => player.id === request.playerId)!.acquiredArtworkCount).toBe(1)
      expect(transition.events.some(event => event.type === 'ArtworkExhibited')).toBe(true)
      expect(transition.events.some(event => event.type === 'GameEndTriggered')).toBe(false)
      expect(state).toEqual(before)
    },
  )

  it('leaves the input untouched when the purchase cannot be paid', () => {
    const { state: base, request } = purchaseScenario('all')
    const state: RegularPlayGameState = { ...base, players: base.players.map(player => ({ ...player, coins: 0 })) }
    const before = structuredClone(state)
    expect(() => applyArtworkPurchaseToGameState(state, request)).toThrow()
    expect(state).toEqual(before)
    expect(state.phase).toBe('regular_play')
    expect(Object.isFrozen(state)).toBe(false)
  })
})
