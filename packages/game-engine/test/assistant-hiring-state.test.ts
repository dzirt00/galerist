import { describe, expect, it } from 'vitest'
import { applyAssistantHiringToGameState, projectGameForViewer, restoreGameState, type GameState, type VisitorInstance } from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function scenario(coins = 5) {
  const initial = structuredClone(startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs)))
  const playerId = initial.players[0]!.id
  const state = { ...initial, players: initial.players.map(player => player.id === playerId ? { ...player, coins } : player) }
  return { state, playerId }
}

// Состав после предыдущих наймов; помощники вне офиса не участвуют в этом действии.
function remainingQueue(remaining: number, office = 0, coins = 50) {
  const { state, playerId } = scenario(coins)
  const board = state.playerBoards[0]!
  const ids = board.assistants.assistantHireQueueIds.slice(8 - remaining)
  state.playerBoards = [{ ...board, assistants: {
    office, hireQueue: remaining,
    assistantOfficeIds: Array.from({ length: office }, (_, index) => `OFFICE-${index}`),
    assistantHireQueueIds: ids,
  } }, ...state.playerBoards.slice(1)]
  return { state, playerId }
}

function galleryVisitors<T extends GameState>(state: T, types: readonly VisitorInstance['type'][]): T {
  const pool = [...state.visitorBag.visitors]
  const selected = types.map(type => {
    const index = pool.findIndex(visitor => visitor.type === type)
    if (index === -1) throw new Error(`Missing fixture visitor ${type}`)
    return pool.splice(index, 1)[0]!
  })
  return { ...state, visitorBag: { visitors: pool },
    playerBoards: state.playerBoards.map((board, index) => index === 0
      ? { ...board, gallery: { ...board.gallery, visitors: selected } } : board),
  }
}

function expectAtomicRejection(state: GameState, request: Parameters<typeof applyAssistantHiringToGameState>[1]) {
  const before = structuredClone(state)
  const requestBefore = structuredClone(request)
  expect(() => applyAssistantHiringToGameState(state, request)).toThrow()
  expect(state).toEqual(before)
  expect(request).toEqual(requestBefore)
  expect(Object.isFrozen(state.players[0]!.ticketsByColor)).toBe(false)
  expect(Object.isFrozen(state.playerBoards[0]!.assistants.assistantHireQueueIds)).toBe(false)
}

describe('HIRE-001/HIRE-002: публичная команда найма', () => {
  it('оплачивает первых двух, сохраняет ID, остаток очереди и билетную награду', () => {
    const { state, playerId } = scenario()
    const before = structuredClone(state)
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 2 })
    expect(result.state.players[0]!.coins).toBe(2)
    expect(result.state.players[0]!.ticketsByColor.B).toBe(before.players[0]!.ticketsByColor.B + 1)
    expect(result.state.ticketOffice.ticketsByColor.B).toBe(before.ticketOffice.ticketsByColor.B - 1)
    expect(result.state.playerBoards[0]!.assistants).toEqual({
      office: 4, hireQueue: 6,
      assistantOfficeIds: ['ASSISTANT-1', 'ASSISTANT-2', 'ASSISTANT-3', 'ASSISTANT-4'],
      assistantHireQueueIds: ['ASSISTANT-5', 'ASSISTANT-6', 'ASSISTANT-7', 'ASSISTANT-8', 'ASSISTANT-9', 'ASSISTANT-10'],
    })
    expect(result.events.map(event => event.type)).toEqual(['AssistantsHired', 'CoinsSpent', 'TicketReceived'])
    expect(state).toEqual(before)
    expect(result.state.players[1]).toEqual(before.players[1])
    expect(Object.isFrozen(result.state.playerBoards[0]!.assistants.assistantOfficeIds)).toBe(true)
    expect(projectGameForViewer(result.state, null).playerBoards[0]!.assistants).toEqual(result.state.playerBoards[0]!.assistants)
    expect(restoreGameState(result.state)).toEqual(result.state)
  })

  it('сохраняет выбранную цель влияния 0 и баланс оплаты до наград', () => {
    const { state, playerId } = scenario()
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 1, targetInfluence: 0 })
    expect(result.state.players[0]!.influence).toBe(0)
    const received = result.events.find(event => event.type === 'CoinsReceived')
    expect(received?.type).toBe('CoinsReceived')
    if (received?.type !== 'CoinsReceived') throw new Error('Missing CoinsReceived')
    expect(result.state.players[0]!.coins).toBe(5 + received.coinsReceived - 1)
    const types = result.events.map(event => event.type)
    expect(types.indexOf('InfluenceSpent')).toBeLessThan(types.indexOf('CoinsReceived'))
    expect(types.indexOf('CoinsReceived')).toBeLessThan(types.indexOf('CoinsSpent'))
  })

  it('фиксирует первое опустошение кассы после награды и запускает доигрывание', () => {
    const { state, playerId } = scenario()
    state.ticketOffice = { ticketsByColor: { B: 1, R: 0, W: 0 } }
    state.visitorBag = { visitors: [] }
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 2 })
    expect(result.state.ticketOfficeEmptyReached).toBe(true)
    expect(result.state.intermediateScoringStatus).toBe('pending')
    expect(result.state.phase).toBe('ending_current_round')
    expect(result.events.map(event => event.type)).toEqual([
      'AssistantsHired', 'CoinsSpent', 'TicketReceived', 'IntermediateScoringTriggered', 'EndConditionReached', 'GameEndTriggered',
    ])
  })

  it('не изменяет и не замораживает входные ресурсы при недостаточной оплате', () => {
    const { state, playerId } = scenario(0)
    const before = structuredClone(state)
    expect(() => applyAssistantHiringToGameState(state, { playerId, countAssistants: 1 })).toThrow()
    expect(state).toEqual(before)
    expect(Object.isFrozen(state.players[0]!.ticketsByColor)).toBe(false)
  })

  it('не замораживает исходные объекты при успешном найме', () => {
    const { state, playerId } = scenario()
    const before = structuredClone(state)
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 2 })
    expect(state).toEqual(before)
    expect(Object.isFrozen(result.state)).toBe(true)
    expect(Object.isFrozen(state.players[1])).toBe(false)
    expect(Object.isFrozen(state.playerBoards[0]!.gallery)).toBe(false)
  })

  it('отклоняет повтор ID между офисом и очередью при восстановлении', () => {
    const { state } = scenario()
    const board = state.playerBoards[0]!
    state.playerBoards = [{ ...board, assistants: { ...board.assistants,
      assistantHireQueueIds: [board.assistants.assistantOfficeIds[0]!, ...board.assistants.assistantHireQueueIds.slice(1)],
    } }, ...state.playerBoards.slice(1)]
    expect(() => restoreGameState(state)).toThrow()
  })

  it.each([1, 2, 3, 4])('заполняет %i свободных мест в порядке очереди', count => {
    const { state, playerId } = remainingQueue(8, 4 - count)
    const initialIds = state.playerBoards[0]!.assistants.assistantHireQueueIds
    const before = structuredClone(state)
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: count })
    expect(result.state.playerBoards[0]!.assistants.office).toBe(4)
    expect(result.state.playerBoards[0]!.assistants.assistantOfficeIds.slice(-count)).toEqual(initialIds.slice(0, count))
    expect(result.state.playerBoards[0]!.assistants.assistantHireQueueIds).toEqual(initialIds.slice(count))
    expect(result.state.players[0]!.coins).toBe(50 - [0, 1, 3, 5, 8][count]!)
    expect(state).toEqual(before)
    expect(restoreGameState(result.state)).toEqual(result.state)
  })

  it.each([
    { remaining: 8, office: 4, count: 1 },
    { remaining: 0, office: 0, count: 1 },
    { remaining: 1, office: 0, count: 2 },
    { remaining: 8, office: 3, count: 2 },
    ...[0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(count => ({ remaining: 8, office: 0, count })),
  ])('атомарно отклоняет недоступный найм $count при офисе $office и очереди $remaining', ({ remaining, office, count }) => {
    const { state, playerId } = remainingQueue(remaining, office)
    expectAtomicRejection(state, { playerId, countAssistants: count, targetInfluence: 0 })
  })

  it('найм из частично исчерпанной очереди сохраняет поздние цены и подписи помощников', () => {
    const { state, playerId } = remainingQueue(6, 1)
    const request = { playerId, countAssistants: 2 }
    const result = applyAssistantHiringToGameState(state, request)
    expect(result.state.players[0]!.coins).toBe(45)
    expect(result.state.playerBoards[0]!.assistants).toEqual({
      office: 3, hireQueue: 4,
      assistantOfficeIds: ['OFFICE-0', 'ASSISTANT-5', 'ASSISTANT-6'],
      assistantHireQueueIds: ['ASSISTANT-7', 'ASSISTANT-8', 'ASSISTANT-9', 'ASSISTANT-10'],
    })
    expect(result.state.players[0]!.ticketsByColor.R).toBe(state.players[0]!.ticketsByColor.R + 1)
    expect(result.events.map(event => event.type)).toEqual(['AssistantsHired', 'CoinsSpent', 'TicketReceived'])
    expect(restoreGameState(result.state)).toEqual(result.state)
  })

  it.each(['B', 'R', 'W'] as const)('выдаёт ровно один выбранный билет %s с шестой клетки', color => {
    const { state, playerId } = remainingQueue(3)
    const request = { playerId, countAssistants: 1, requestedTicketColors: [color] }
    const result = applyAssistantHiringToGameState(state, request)
    expect(result.state.players[0]!.coins).toBe(46)
    expect(result.state.players[0]!.ticketsByColor).toEqual({ ...state.players[0]!.ticketsByColor,
      [color]: state.players[0]!.ticketsByColor[color] + 1,
    })
    expect(result.state.ticketOffice.ticketsByColor[color]).toBe(state.ticketOffice.ticketsByColor[color] - 1)
    expect(result.events.filter(event => event.type === 'TicketReceived')).toEqual([{ type: 'TicketReceived', playerId, color }])
    expect(request.requestedTicketColors).toEqual([color])
    expect(restoreGameState(result.state)).toEqual(result.state)
  })

  it.each([undefined, [], ['B', 'R'], ['B', 'B']] as const)('отклоняет неверное число цветов без частичной оплаты (%j)', colors => {
    const { state, playerId } = remainingQueue(3)
    expectAtomicRejection(state, { playerId, countAssistants: 1,
      ...(colors === undefined ? {} : { requestedTicketColors: colors }),
    })
  })

  it('обменивает билет и выдаёт фиксированную награду в порядке событий', () => {
    const { state, playerId } = remainingQueue(7)
    state.ticketOffice = { ticketsByColor: { B: 0, R: 2, W: 0 } }
    state.ticketDiscard = { B: 1, R: 0, W: 0 }
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 1,
      replacementColorsByRequestedColor: { B: 'R' },
    })
    expect(result.state.ticketOffice.ticketsByColor).toEqual({ B: 0, R: 1, W: 0 })
    expect(result.state.ticketDiscard).toEqual({ B: 0, R: 1, W: 0 })
    expect(result.state.players[0]!.ticketsByColor.B).toBe(1)
    expect(result.events.map(event => event.type)).toEqual(['AssistantsHired', 'CoinsSpent', 'TicketExchanged', 'TicketReceived'])
  })

  it.each(['empty_office', 'missing_discard'] as const)('сохраняет успешный найм без недоступного билета: %s', reason => {
    const { state, playerId } = remainingQueue(7)
    state.ticketOffice = { ticketsByColor: { B: 0, R: reason === 'empty_office' ? 0 : 2, W: 0 } }
    state.ticketDiscard = { B: reason === 'empty_office' ? 1 : 0, R: 0, W: 0 }
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 1 })
    expect(result.state.players[0]!.coins).toBe(48)
    expect(result.state.players[0]!.ticketsByColor).toEqual(state.players[0]!.ticketsByColor)
    expect(result.state.ticketOffice).toEqual(state.ticketOffice)
    expect(result.state.ticketDiscard).toEqual(state.ticketDiscard)
    expect(result.events.map(event => event.type)).toEqual(['AssistantsHired', 'CoinsSpent'])
  })

  it('не сохраняет оплату и первый билет при ошибке обмена второй награды', () => {
    const { state, playerId } = remainingQueue(7)
    state.ticketOffice = { ticketsByColor: { B: 2, R: 0, W: 2 } }
    state.ticketDiscard = { B: 0, R: 1, W: 0 }
    expectAtomicRejection(state, { playerId, countAssistants: 2 })
  })

  it.each([10, 34, 35])('начисляет влияние по галерее с пределом 35, исходное влияние %i', influence => {
    const { state: initial, playerId } = remainingQueue(5)
    const state = galleryVisitors(initial, ['R', 'R', 'W', 'B'])
    state.players = state.players.map(player => player.id === playerId ? { ...player, influence } : player)
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 1 })
    const gained = Math.min(5, 35 - influence)
    expect(result.state.players[0]!.influence).toBe(influence + gained)
    expect(result.events.filter(event => event.type === 'InfluenceReceived')).toEqual(gained > 0
      ? [{ type: 'InfluenceReceived', playerId, gainedInfluence: gained }] : [])
    expect(result.state.players[0]!.coins).toBe(47)
    expect(restoreGameState(result.state)).toEqual(result.state)
  })

  it('начисляет награду влиянием после его расхода на оплату', () => {
    const { state: initial, playerId } = remainingQueue(5)
    const state = galleryVisitors(initial, ['R', 'W'])
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 1, targetInfluence: 0 })
    expect(result.state.players[0]!.influence).toBe(3)
    expect(result.events.filter(event => event.type === 'InfluenceReceived')).toEqual([{ type: 'InfluenceReceived', playerId, gainedInfluence: 3 }])
    const types = result.events.map(event => event.type)
    expect(types.indexOf('InfluenceSpent')).toBeLessThan(types.indexOf('CoinsSpent'))
    expect(types.indexOf('CoinsSpent')).toBeLessThan(types.indexOf('InfluenceReceived'))
  })

  it('выдаёт монеты только за инвесторов и коллекционеров галереи', () => {
    const { state: initial, playerId } = remainingQueue(1)
    const state = galleryVisitors(initial, ['B', 'B', 'W', 'R'])
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 1 })
    expect(result.state.players[0]!.coins).toBe(49)
    expect(result.events).toEqual([
      { type: 'AssistantsHired', countHiredAssistants: 1 }, { type: 'CoinsSpent', playerId, paid: 6 },
      { type: 'CoinsReceived', playerId, coinsReceived: 5 },
    ])
    expect(result.state.playerBoards[0]!.assistants.hireQueue).toBe(0)
    expect(restoreGameState(result.state)).toEqual(result.state)
  })

  it.each([5, 1])('не выдаёт награду за посетителя вестибюля при остатке %i', remaining => {
    const { state, playerId } = remainingQueue(remaining)
    state.vestibuleVisitors = state.vestibuleVisitors.map(entry => ({ ...entry, vestibuleVisitor: { ...entry.vestibuleVisitor, type: 'W' } }))
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 1 })
    expect(result.events.map(event => event.type)).toEqual(['AssistantsHired', 'CoinsSpent'])
  })

  it('не использует будущую награду монетами для оплаты найма', () => {
    const { state: initial, playerId } = remainingQueue(1, 0, 5)
    const state = galleryVisitors(initial, ['B', 'B', 'W'])
    expectAtomicRejection(state, { playerId, countAssistants: 1 })
  })

  it('применяет несколько наград к накопленным ресурсам, не теряя билет и монеты', () => {
    const { state: initial, playerId } = remainingQueue(4)
    const state = galleryVisitors(initial, ['B', 'W'])
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 4, requestedTicketColors: ['R'] })
    expect(result.state.players[0]!.coins).toBe(35) // 50 − (3 + 4 + 5 + 6) + 3
    expect(result.state.players[0]!.ticketsByColor.R).toBe(1)
    expect(result.state.playerBoards[0]!.assistants.office).toBe(4)
    expect(result.state.playerBoards[0]!.assistants.assistantHireQueueIds).toEqual([])
    expect(result.events.map(event => event.type)).toEqual(['AssistantsHired', 'CoinsSpent', 'TicketReceived', 'CoinsReceived'])
    expect(restoreGameState(result.state)).toEqual(result.state)
  })

  it.each(['ending_current_round', 'final_round'] as const)('разрешает найм в %s без повторного запуска завершения', phase => {
    const { state: initial, playerId } = scenario()
    const state: GameState = { ...initial, phase, endTriggeredRound: initial.round,
      ticketOffice: { ticketsByColor: { B: 0, R: 0, W: 0 } }, visitorBag: { visitors: [] },
    }
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 1 })
    expect(result.state.phase).toBe(phase)
    expect(result.state.activePlayerId).toBe(state.activePlayerId)
    expect(result.events.map(event => event.type)).toEqual(['AssistantsHired', 'CoinsSpent'])
  })

  it('отклоняет найм в setup до оплаты', () => {
    const state = structuredClone(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
    expectAtomicRejection(state, { playerId: state.players[0]!.id, countAssistants: 1 })
  })

  it.each(['final_scoring', 'finished'] as const)('атомарно отклоняет найм в фазе %s', phase => {
    const { state: initial, playerId } = scenario()
    const state: GameState = phase === 'finished'
      ? { ...initial, phase, status: 'finished', activePlayerId: null, endTriggeredRound: initial.round, winnerIds: [playerId] }
      : { ...initial, phase, activePlayerId: null, endTriggeredRound: initial.round, finalInfluenceScored: false }
    expectAtomicRejection(state, { playerId, countAssistants: 1 })
  })

  it('оплачивает нехватку собственных монет влиянием ровно один раз', () => {
    const { state, playerId } = scenario(0)
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 1, targetInfluence: 0 })
    expect(result.state.players[0]!.coins).toBe(3)
    expect(result.state.players[0]!.influence).toBe(0)
    expect(result.events.filter(event => event.type === 'CoinsReceived')).toEqual([{ type: 'CoinsReceived', playerId, coinsReceived: 4 }])
    expect(result.events.filter(event => event.type === 'InfluenceSpent')).toEqual([{ type: 'InfluenceSpent', playerId, spentInfluence: 10 }])
    expect(result.events.filter(event => event.type === 'CoinsSpent')).toEqual([{ type: 'CoinsSpent', playerId, paid: 1 }])
  })

  it('не сохраняет эффекты при недостатке монет даже после расхода влияния', () => {
    const { state, playerId } = remainingQueue(1, 0, 0)
    expectAtomicRejection(state, { playerId, countAssistants: 1, targetInfluence: 0 })
  })

  it('не повторяет индикатор опустошения кассы и промежуточный подсчёт', () => {
    const { state, playerId } = remainingQueue(7)
    state.ticketOfficeEmptyReached = true
    state.intermediateScoringStatus = 'completed'
    state.ticketOffice = { ticketsByColor: { B: 1, R: 0, W: 0 } }
    const result = applyAssistantHiringToGameState(state, { playerId, countAssistants: 1 })
    expect(result.state.intermediateScoringStatus).toBe('completed')
    expect(result.events.map(event => event.type)).toEqual(['AssistantsHired', 'CoinsSpent', 'TicketReceived'])
  })
})
