import { expect, it } from 'vitest'
import {
  advanceTurn,
  applyTicketRewardToGameState,
  projectEventsForViewer,
  projectGameForViewer,
  type GameState,
  type RegularPlayGameState,
} from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState, startGameAfterSetup } from './helpers.js'

function regularState(): RegularPlayGameState {
  return {
    ...structuredClone(startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))),
    round: 7,
    intermediateScoringStatus: 'completed',
  }
}

it.each([
  { emptyTickets: false, emptyBag: false, superstars: 0, ends: false },
  { emptyTickets: true, emptyBag: false, superstars: 0, ends: false },
  { emptyTickets: false, emptyBag: true, superstars: 0, ends: false },
  { emptyTickets: false, emptyBag: false, superstars: 2, ends: false },
  { emptyTickets: true, emptyBag: true, superstars: 0, ends: true },
  { emptyTickets: true, emptyBag: false, superstars: 2, ends: true },
  { emptyTickets: false, emptyBag: true, superstars: 2, ends: true },
  { emptyTickets: true, emptyBag: true, superstars: 2, ends: true },
])('после билетной награды: пустая касса=$emptyTickets, пустой мешочек=$emptyBag, суперзвёзд=$superstars', ({ emptyTickets, emptyBag, superstars, ends }) => {
  const base = regularState()
  const state: RegularPlayGameState = {
    ...base,
    ticketOffice: { ticketsByColor: { B: 1, R: emptyTickets ? 0 : 1, W: 0 } },
    visitorBag: { visitors: emptyBag ? [] : base.visitorBag.visitors.slice(0, 1) },
    artistMarket: {
      ...base.artistMarket,
      slots: base.artistMarket.slots.map((slot, index) => ({ ...slot, isSuperstar: index < superstars })),
    },
  }
  const snapshot = structuredClone(state)
  const request = { playerId: state.activePlayerId, requestedColors: ['B'] as const }
  const requestSnapshot = structuredClone(request)

  const transition = applyTicketRewardToGameState(state, request)

  expect(transition.state.phase).toBe(ends ? 'ending_current_round' : 'regular_play')
  if (ends) expect(transition.state).toHaveProperty('endTriggeredRound', 7)
  else expect(transition.state).not.toHaveProperty('endTriggeredRound')
  expect(transition.state).toMatchObject({
    round: 7, firstPlayerId: state.firstPlayerId, activePlayerId: state.activePlayerId,
    intermediateScoringStatus: 'completed',
  })
  const recipient = transition.state.players.find(player => player.id === request.playerId)!
  const original = state.players.find(player => player.id === request.playerId)!
  expect(recipient).toEqual({ ...original, ticketsByColor: { ...original.ticketsByColor, B: original.ticketsByColor.B + 1 } })
  expect(transition.state.ticketOffice.ticketsByColor).toEqual({ B: 0, R: emptyTickets ? 0 : 1, W: 0 })
  expect(transition.state.ticketDiscard).toEqual(state.ticketDiscard)
  expect(transition.events).toEqual([
    { type: 'TicketReceived', playerId: request.playerId, color: 'B' },
    ...(ends ? [{ type: 'GameEndTriggered' }] : []),
  ])
  for (const viewerId of [null, ...state.players.map(player => player.id)]) {
    expect(projectEventsForViewer(transition.events, transition.state, viewerId)).toEqual(transition.events)
    expect(projectGameForViewer(transition.state, viewerId).phase).toBe(transition.state.phase)
  }
  expect(state).toEqual(snapshot)
  expect(request).toEqual(requestSnapshot)
  expect(Object.isFrozen(state)).toBe(false)
  expect(transition.state).not.toBe(state)
  expect(Object.isFrozen(transition)).toBe(true)
  expect(Object.isFrozen(transition.state)).toBe(true)
  expect(Object.isFrozen(recipient.ticketsByColor)).toBe(true)
  expect(Object.isFrozen(transition.state.ticketOffice.ticketsByColor)).toBe(true)
  expect(Object.isFrozen(transition.events)).toBe(true)
  expect(transition.events.every(Object.isFrozen)).toBe(true)
})

it('оценивает завершение после всей награды и события промежуточного подсчёта', () => {
  const state: RegularPlayGameState = {
    ...regularState(),
    intermediateScoringStatus: 'not_triggered',
    ticketOffice: { ticketsByColor: { B: 1, R: 1, W: 0 } },
    visitorBag: { visitors: [] },
  }
  const transition = applyTicketRewardToGameState(state, {
    playerId: state.activePlayerId, requestedColors: ['B', 'R'],
  })
  expect(transition.state).toMatchObject({ phase: 'ending_current_round', endTriggeredRound: 7, intermediateScoringStatus: 'pending' })
  expect(transition.state.ticketOffice.ticketsByColor).toEqual({ B: 0, R: 0, W: 0 })
  expect(transition.events).toEqual([
    { type: 'TicketReceived', playerId: state.activePlayerId, color: 'B' },
    { type: 'TicketReceived', playerId: state.activePlayerId, color: 'R' },
    { type: 'IntermediateScoringTriggered' },
    { type: 'GameEndTriggered' },
  ])
})

it('запускает завершение после обмена последнего доступного билета', () => {
  const state: RegularPlayGameState = {
    ...regularState(),
    ticketOffice: { ticketsByColor: { B: 0, R: 1, W: 0 } },
    ticketDiscard: { B: 1, R: 0, W: 0 },
    visitorBag: { visitors: [] },
  }
  const transition = applyTicketRewardToGameState(state, {
    playerId: state.activePlayerId, requestedColors: ['B'], replacementColorsByRequestedColor: { B: 'R' },
  })
  expect(transition.state.phase).toBe('ending_current_round')
  expect(transition.state.ticketOffice.ticketsByColor).toEqual({ B: 0, R: 0, W: 0 })
  expect(transition.state.ticketDiscard).toEqual({ B: 0, R: 1, W: 0 })
  expect(transition.events).toEqual([
    { type: 'TicketExchanged', playerId: state.activePlayerId, discardedColor: 'R', receivedColor: 'B' },
    { type: 'TicketReceived', playerId: state.activePlayerId, color: 'B' },
    { type: 'GameEndTriggered' },
  ])
})

it.each(['ending_current_round', 'final_round'] as const)('не запускает завершение повторно при награде в %s', phase => {
  const base = regularState()
  let state: GameState = applyTicketRewardToGameState({
    ...base,
    visitorBag: { visitors: [] },
    artistMarket: { ...base.artistMarket, slots: base.artistMarket.slots.map((slot, index) => ({ ...slot, isSuperstar: index < 2 })) },
    ticketOffice: { ticketsByColor: { B: 1, R: 1, W: 0 } },
  }, { playerId: base.activePlayerId, requestedColors: ['B'] }).state
  while (phase === 'final_round' && state.phase === 'ending_current_round') {
    state = advanceTurn(state).state
  }
  expect(state.phase).toBe(phase)
  const snapshot = structuredClone(state)
  const transition = applyTicketRewardToGameState(state, { playerId: base.activePlayerId, requestedColors: ['R'] })
  expect(transition.state).toMatchObject({ phase, round: state.round, endTriggeredRound: 7, activePlayerId: state.activePlayerId })
  expect(transition.state.ticketOffice.ticketsByColor).toEqual({ B: 0, R: 0, W: 0 })
  expect(transition.events).toEqual([{ type: 'TicketReceived', playerId: base.activePlayerId, color: 'R' }])
  expect(state).toEqual(snapshot)
})

it('отклоняет ошибку второго билета без частичной награды и смены фазы', () => {
  const state: RegularPlayGameState = {
    ...regularState(),
    intermediateScoringStatus: 'not_triggered',
    ticketOffice: { ticketsByColor: { B: 1, R: 0, W: 1 } },
    ticketDiscard: { B: 0, R: 1, W: 0 },
    visitorBag: { visitors: [] },
  }
  const snapshot = structuredClone(state)
  expect(() => applyTicketRewardToGameState(state, {
    playerId: state.activePlayerId, requestedColors: ['B', 'R'],
  })).toThrow('Replacement ticket color is required')
  expect(state).toEqual(snapshot)
  expect(state.phase).toBe('regular_play')
  expect(state).not.toHaveProperty('endTriggeredRound')
  expect(Object.isFrozen(state)).toBe(false)
})
