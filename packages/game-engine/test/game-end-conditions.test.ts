import { expect, it } from 'vitest'
import {
  projectEventsForViewer,
  triggerGameEnd,
  type RegularPlayGameState,
} from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState, startGameAfterSetup } from './helpers.js'

function createRegularState(): RegularPlayGameState {
  return startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
}

const indicatorCases = [
  { emptyTickets: false, emptyBag: false, superstarCount: 0, succeeds: false },
  { emptyTickets: true, emptyBag: false, superstarCount: 0, succeeds: false },
  { emptyTickets: false, emptyBag: true, superstarCount: 0, succeeds: false },
  { emptyTickets: false, emptyBag: false, superstarCount: 2, succeeds: false },
  { emptyTickets: true, emptyBag: true, superstarCount: 1, succeeds: true },
  { emptyTickets: true, emptyBag: false, superstarCount: 2, succeeds: true },
  { emptyTickets: false, emptyBag: true, superstarCount: 2, succeeds: true },
  { emptyTickets: true, emptyBag: true, superstarCount: 3, succeeds: true },
]

it.each(indicatorCases)(
  'END-002: пустая касса=$emptyTickets, пустой мешочек=$emptyBag, суперзвёзд=$superstarCount',
  ({ emptyTickets, emptyBag, superstarCount, succeeds }) => {
    const base = structuredClone(createRegularState())
    const state: RegularPlayGameState = {
      ...base,
      round: 3,
      ticketOffice: {
        ticketsByColor: emptyTickets ? { B: 0, R: 0, W: 0 } : { B: 1, R: 2, W: 3 },
      },
      visitorBag: { visitors: emptyBag ? [] : base.visitorBag.visitors.slice(0, 1) },
      artistMarket: {
        ...base.artistMarket,
        slots: base.artistMarket.slots.map((slot, index) => ({
          ...slot,
          isSuperstar: index < superstarCount,
        })),
      },
    }
    const snapshot = structuredClone(state)

    if (!succeeds) {
      expect(() => triggerGameEnd(state)).toThrow('Invalid trigger end game')
      expect(state).toEqual(snapshot)
      expect(state).not.toHaveProperty('endTriggeredRound')
      expect(Object.isFrozen(state)).toBe(false)
      return
    }

    const transition = triggerGameEnd(state)
    expect(transition.state).toEqual({
      ...snapshot,
      phase: 'ending_current_round',
      endTriggeredRound: 3,
    })
    expect(transition.state).not.toBe(state)
    expect(transition.events).toEqual([{ type: 'GameEndTriggered' }])
    for (const viewerId of [null, state.players[0]!.id]) {
      expect(projectEventsForViewer(transition.events, transition.state, viewerId))
        .toEqual(transition.events)
    }
    expect(Object.isFrozen(transition)).toBe(true)
    expect(Object.isFrozen(transition.state.ticketOffice.ticketsByColor)).toBe(true)
    expect(Object.isFrozen(transition.state.visitorBag.visitors)).toBe(true)
    expect(Object.isFrozen(transition.state.artistMarket.slots)).toBe(true)
    expect(transition.state.artistMarket.slots.every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(transition.events)).toBe(true)
    expect(Object.isFrozen(transition.events[0])).toBe(true)
    expect(state).toEqual(snapshot)
    const endedSnapshot = structuredClone(transition.state)
    expect(() => triggerGameEnd(transition.state)).toThrow('Only regular_play')
    expect(transition.state).toEqual(endedSnapshot)
  },
)

it.each([
  { B: 1, R: 0, W: 0 },
  { B: 0, R: 1, W: 0 },
  { B: 0, R: 0, W: 1 },
])('END-002: оставшийся билет %j не даёт считать кассу пустой', ticketsByColor => {
  const state: RegularPlayGameState = {
    ...structuredClone(createRegularState()),
    ticketOffice: { ticketsByColor },
    visitorBag: { visitors: [] },
  }
  const snapshot = structuredClone(state)
  expect(() => triggerGameEnd(state)).toThrow('Invalid trigger end game')
  expect(state).toEqual(snapshot)
})
