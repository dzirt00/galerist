import { describe, expect, it } from 'vitest'
import {
  applyTicketRewardToGameState,
  projectEventsForViewer,
  projectGameForViewer,
  restoreGameState,
  type SetupGameState,
  type SetupTicketColor,
  type TicketRewardRequest,
} from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState } from './helpers.js'

function mutableStateWithSupplies(
  office: Record<SetupTicketColor, number>,
  discard: Record<SetupTicketColor, number>,
): SetupGameState {
  return structuredClone({
    ...createGameState(twoPlayerGameConfig, twoPlayerConfigs),
    ticketOffice: { ticketsByColor: office },
    ticketDiscard: discard,
  })
}

describe('Выдача билетов через applyTicketRewardToGameState', () => {
  it('выдаёт разные конкретные цвета, обновляет состояние и создаёт события по порядку', () => {
    const state = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const request: TicketRewardRequest = {
      playerId: 'player-1',
      requestedColors: ['B', 'R'],
    }
    const stateSnapshot = structuredClone(state)
    const requestSnapshot = structuredClone(request)

    const transition = applyTicketRewardToGameState(state, request)

    expect(transition.state.players[0]!.ticketsByColor).toEqual({ B: 1, R: 1, W: 0 })
    expect(transition.state.players[1]!.ticketsByColor).toEqual({ B: 0, R: 0, W: 0 })
    expect(transition.state.ticketOffice.ticketsByColor).toEqual({ B: 9, R: 9, W: 10 })
    expect(transition.state.ticketDiscard).toEqual({ B: 0, R: 0, W: 0 })
    expect(transition.events).toEqual([
      { type: 'TicketReceived', playerId: 'player-1', color: 'B' },
      { type: 'TicketReceived', playerId: 'player-1', color: 'R' },
    ])
    expect(projectEventsForViewer(transition.events, transition.state, null)).toEqual(
      transition.events,
    )
    const projection = projectGameForViewer(transition.state, null)
    expect(projection.players[0]!.ticketsByColor).toEqual({ B: 1, R: 1, W: 0 })
    expect(projection.ticketDiscard).toEqual({ B: 0, R: 0, W: 0 })
    expect(restoreGameState(structuredClone(transition.state))).toEqual(transition.state)
    expect(state).toEqual(stateSnapshot)
    expect(request).toEqual(requestSnapshot)
    expect(Object.isFrozen(transition)).toBe(true)
    expect(Object.isFrozen(transition.state)).toBe(true)
    expect(Object.isFrozen(transition.state.players)).toBe(true)
    expect(Object.isFrozen(transition.state.players[0]!.ticketsByColor)).toBe(true)
    expect(Object.isFrozen(transition.events)).toBe(true)
    expect(transition.events.every(Object.isFrozen)).toBe(true)
  })

  it('заменяет недоступный цвет и создаёт TicketExchanged перед TicketReceived', () => {
    const state = mutableStateWithSupplies(
      { B: 0, R: 2, W: 1 },
      { B: 3, R: 0, W: 0 },
    )

    const transition = applyTicketRewardToGameState(state, {
      playerId: 'player-1',
      requestedColors: ['B'],
      replacementColorsByRequestedColor: { B: 'R' },
    })

    expect(transition.state.players[0]!.ticketsByColor).toEqual({ B: 1, R: 0, W: 0 })
    expect(transition.state.ticketOffice.ticketsByColor).toEqual({ B: 0, R: 1, W: 1 })
    expect(transition.state.ticketDiscard).toEqual({ B: 2, R: 1, W: 0 })
    expect(transition.events).toEqual([
      {
        type: 'TicketExchanged',
        playerId: 'player-1',
        discardedColor: 'R',
        receivedColor: 'B',
      },
      { type: 'TicketReceived', playerId: 'player-1', color: 'B' },
    ])
  })

  it('не выдаёт билет из сброса при полностью пустой кассе', () => {
    const state = mutableStateWithSupplies(
      { B: 0, R: 0, W: 0 },
      { B: 1, R: 2, W: 3 },
    )
    const snapshot = structuredClone(state)

    const transition = applyTicketRewardToGameState(state, {
      playerId: 'player-1',
      requestedColors: ['B'],
    })

    expect(transition.state.ticketOffice).toEqual(snapshot.ticketOffice)
    expect(transition.state.ticketDiscard).toEqual(snapshot.ticketDiscard)
    expect(transition.state.players).toEqual(snapshot.players)
    expect(transition.events).toEqual([])
    expect(state).toEqual(snapshot)
  })

  it('не требует замену и ничего не меняет, если нужного цвета нет и в сбросе', () => {
    const state = mutableStateWithSupplies(
      { B: 0, R: 2, W: 1 },
      { B: 0, R: 1, W: 1 },
    )
    const snapshot = structuredClone(state)

    const transition = applyTicketRewardToGameState(state, {
      playerId: 'player-1',
      requestedColors: ['B'],
    })

    expect(transition.state.ticketOffice).toEqual(snapshot.ticketOffice)
    expect(transition.state.ticketDiscard).toEqual(snapshot.ticketDiscard)
    expect(transition.state.players).toEqual(snapshot.players)
    expect(transition.events).toEqual([])
  })

  it.each([
    [
      'повтор цвета',
      { playerId: 'player-1', requestedColors: ['B', 'B'] },
      'Ticket reward colors must be unique',
    ],
    [
      'неизвестный игрок',
      { playerId: 'missing', requestedColors: ['B'] },
      'Player must belong to the game',
    ],
    [
      'пустая награда',
      { playerId: 'player-1', requestedColors: [] },
      'Ticket reward must request at least one color',
    ],
    [
      'неизвестный цвет',
      { playerId: 'player-1', requestedColors: ['X'] },
      'Ticket reward contains an invalid color',
    ],
  ] as const)('атомарно отклоняет: %s', (_name, request, error) => {
    const state = createGameState(twoPlayerGameConfig, twoPlayerConfigs)
    const snapshot = structuredClone(state)

    expect(() => applyTicketRewardToGameState(
      state,
      request as unknown as TicketRewardRequest,
    )).toThrow(error)
    expect(state).toEqual(snapshot)
  })

  it('восстановление отклоняет повреждённые запасы игрока и сброса', () => {
    const state = structuredClone(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
    const missingPlayerTickets = structuredClone(state) as unknown as {
      players: Array<Record<string, unknown>>
    }
    delete missingPlayerTickets.players[0]!.ticketsByColor

    expect(() => restoreGameState(missingPlayerTickets)).toThrow(
      'Invalid game state: players[0].ticketsByColor must be an object',
    )

    const negativeDiscard = structuredClone(state)
    ;(negativeDiscard.ticketDiscard as Record<SetupTicketColor, number>).B = -1
    expect(() => restoreGameState(negativeDiscard)).toThrow(
      'Invalid game state: ticketDiscard.B must be non-negative',
    )
  })
})
