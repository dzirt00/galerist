import { describe, expect, it } from 'vitest'
import {
  orderCardReward, receiveOrder, restoreGameState, projectGameForViewer, projectEventsForViewer,
  setupComponentCatalog, type GameState, type VisitorType,
  type OrderRewardChoices,
} from '../src/index.js'
import { applyOrderRewardEffect } from '../src/order-reward-effect.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

function fixture(orderSlot: 1 | 2 | 3 = 2, orderId = 'ORDER-03') {
  const initial = startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
  const previous = initial.orderMarket.visibleOrders[1]!
  const swap = (id: string) => id === orderId ? previous : id === previous ? orderId : id
  const market = initial.orderMarket
  const input: GameState = { ...initial, orderMarket: {
    ...market,
    visibleOrders: Object.fromEntries(Object.entries(market.visibleOrders).map(([slot, id]) =>
      [slot, id === null ? null : swap(id)])) as typeof market.visibleOrders,
    orderMarket: Object.fromEntries(Object.entries(market.orderMarket).map(([slot, ids]) =>
      [slot, ids.map(swap)])) as typeof market.orderMarket,
    remainingOrderIds: market.remainingOrderIds.map(swap),
  } }
  const playerId = input.activePlayerId
  const state = structuredClone(receiveOrder(input, playerId, 'ACCEPT_ORDER', orderId, String(orderSlot),
    orderSlot === 3 ? 'W' : null).state)
  const boardIndex = state.playerBoards.findIndex(board => board.playerId === playerId)
  const assistantId = state.playerBoards[boardIndex]!.assistants.assistantOfficeIds[1]!
  return { state, playerId, boardIndex, assistantId, orderSlot }
}

function withGallery(state: GameState, boardIndex: number, types: readonly VisitorType[]): GameState {
  const remaining = [...state.visitorBag.visitors]
  const visitors = types.map(type => {
    const index = remaining.findIndex(visitor => visitor.type === type)
    return remaining.splice(index, 1)[0]!
  })
  const visitorBag = { visitors: remaining }
  return structuredClone({ ...state, visitorBag,
    artworkMarket: { ...state.artworkMarket, remainingVisitorBag: visitorBag },
    playerBoards: state.playerBoards.map((board, index) => index === boardIndex
      ? { ...board, gallery: { ...board.gallery, visitors } } : board),
  })
}

function expectFrozen(value: unknown, frozen: boolean): void {
  if (!value || typeof value !== 'object') return
  expect(Object.isFrozen(value)).toBe(frozen)
  Object.values(value).forEach(item => expectFrozen(item, frozen))
}

describe('MGMT-004: публичная лицевая награда с помощником из офиса', () => {
  it.each([1, 2, 3] as const)('переносит выбранного помощника в клетку %i, сохраняет проекции и снимок', orderSlot => {
    const { state, playerId, boardIndex, assistantId } = fixture(orderSlot)
    const input = withGallery(state, boardIndex, ['B', 'B', 'W', 'R'])
    const before = structuredClone(input)
    const result = orderCardReward(input, playerId, orderSlot, assistantId)
    const board = result.state.playerBoards[boardIndex]!
    const player = result.state.players.find(item => item.id === playerId)!
    const previousPlayer = input.players.find(item => item.id === playerId)!
    expect(player).toEqual({ ...previousPlayer, coins: previousPlayer.coins + 5 })
    expect(board).toEqual({ ...input.playerBoards[boardIndex]!,
      assistants: { ...input.playerBoards[boardIndex]!.assistants,
        office: 1, assistantOfficeIds: input.playerBoards[boardIndex]!.assistants.assistantOfficeIds.filter(id => id !== assistantId) },
      boardOrders: { ...input.playerBoards[boardIndex]!.boardOrders,
        [orderSlot]: { ...input.playerBoards[boardIndex]!.boardOrders[orderSlot], assistant: assistantId } },
    })
    expect(result.state.players.filter(item => item.id !== playerId)).toEqual(input.players.filter(item => item.id !== playerId))
    expect(result.state.playerBoards.filter(item => item.playerId !== playerId)).toEqual(input.playerBoards.filter(item => item.playerId !== playerId))
    expect(result.state.orderMarket).toEqual(input.orderMarket)
    expect(result.events).toEqual([
      { type: 'AssistantAssignedToOrder', playerId, orderSlot, orderId: 'ORDER-03', assistantId },
      { type: 'CoinsReceived', playerId, coinsReceived: 5 },
    ])
    for (const viewer of [null, ...input.players.map(item => item.id)]) {
      const projection = projectGameForViewer(result.state, viewer)
      expect(projection.playerBoards[boardIndex]).toEqual(board)
      expect(projection.players.find(item => item.id === playerId)?.coins).toBe(player.coins)
      expect(projectEventsForViewer(result.events, result.state, viewer)).toEqual(result.events)
    }
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
    expect(input).toEqual(before)
    expectFrozen(input, false)
    expectFrozen(result, true)
    const restoredInput = restoreGameState(JSON.parse(JSON.stringify(input)))
    expect(orderCardReward(restoredInput, playerId, orderSlot, assistantId)).toEqual(result)
  })

  it.each(['ORDER-03', 'ORDER-10'])('использует актуальную галерею для %s, игнорируя площадь и вестибюль', orderId => {
    const { state, playerId, boardIndex, assistantId, orderSlot } = fixture(2, orderId)
    const first = withGallery(state, boardIndex, ['B', 'B'])
    expect(orderCardReward(first, playerId, orderSlot, assistantId).events[1]).toMatchObject({ coinsReceived: 4 })
    const changed = withGallery(state, boardIndex, ['W', 'R'])
    expect(changed.plazaVisitors.length).toBeGreaterThan(0)
    expect(changed.vestibuleVisitors.length).toBeGreaterThan(0)
    expect(orderCardReward(changed, playerId, orderSlot, assistantId).events[1]).toMatchObject({ coinsReceived: 1 })
  })

  it('пустая галерея занимает заказ и выдаёт событие нулевой награды; повтор атомарно отклоняется', () => {
    const { state, playerId, boardIndex, assistantId, orderSlot } = fixture()
    const result = orderCardReward(state, playerId, orderSlot, assistantId)
    expect(result.state.players).toEqual(state.players)
    expect(result.events).toEqual([
      { type: 'AssistantAssignedToOrder', playerId, orderSlot, orderId: 'ORDER-03', assistantId },
      { type: 'CoinsReceived', playerId, coinsReceived: 0 },
    ])
    const repeat = structuredClone(result.state)
    const before = structuredClone(repeat)
    const remainingAssistant = repeat.playerBoards[boardIndex]!.assistants.assistantOfficeIds[0]!
    expect(() => orderCardReward(repeat, playerId, orderSlot, remainingAssistant)).toThrow('already has an assistant')
    expect(repeat).toEqual(before)
    expectFrozen(repeat, false)
    expect(() => orderCardReward(restoreGameState(JSON.parse(JSON.stringify(repeat))), playerId, orderSlot, remainingAssistant)).toThrow('already has an assistant')
  })

  it.each(['regular_play', 'ending_current_round', 'final_round'] as const)('доступна в %s', phase => {
    const { state, playerId, assistantId, orderSlot } = fixture()
    expect(orderCardReward({ ...state, phase } as GameState, playerId, orderSlot, assistantId).events).toHaveLength(2)
  })

  it.each(['setup', 'final_scoring', 'finished'] as const)('атомарно отклоняет фазу %s', phase => {
    const { state, playerId, assistantId, orderSlot } = fixture()
    const input = { ...state, phase } as GameState
    const before = structuredClone(input)
    expect(() => orderCardReward(input, playerId, orderSlot, assistantId)).toThrow('playing phase')
    expect(input).toEqual(before)
    expectFrozen(input, false)
  })

  it.each([0, 4, -1, 1.5, NaN, '2', null, undefined])('атомарно отклоняет неверный слот %s', slot => {
    const { state, playerId, assistantId } = fixture()
    const before = structuredClone(state)
    expect(() => orderCardReward(state, playerId, slot as 2, assistantId)).toThrow('Invalid order slot')
    expect(state).toEqual(before)
    expectFrozen(state, false)
  })

  it.each(['missing player', 'missing board', 'empty order', 'completed order', 'unknown order', 'missing assistant', 'hire queue assistant', 'other office assistant'])('атомарно отклоняет %s', scenario => {
    const { state, playerId, boardIndex, assistantId, orderSlot } = fixture()
    const board = state.playerBoards[boardIndex]!
    let input = state
    let selectedPlayer = playerId
    let selectedAssistant = assistantId
    if (scenario === 'missing player') selectedPlayer = 'unknown'
    if (scenario === 'missing board') input = { ...state, playerBoards: state.playerBoards.filter(item => item.playerId !== playerId) }
    if (scenario === 'empty order' || scenario === 'completed order' || scenario === 'unknown order') {
      input = { ...state, playerBoards: state.playerBoards.map((item, index) => index === boardIndex
        ? { ...item, boardOrders: { ...item.boardOrders, [orderSlot]: {
          orderId: scenario === 'empty order' ? null : scenario === 'unknown order' ? 'unknown' : 'ORDER-03',
          orderStatus: scenario === 'empty order' ? null : scenario === 'completed order' ? 'completed' : 'unfulfilled', assistant: null,
        } } } : item) }
    }
    if (scenario === 'missing assistant') selectedAssistant = 'unknown'
    if (scenario === 'hire queue assistant') selectedAssistant = board.assistants.assistantHireQueueIds[0]!
    if (scenario === 'other office assistant') {
      selectedAssistant = 'other-only-assistant'
      input = { ...state, playerBoards: state.playerBoards.map((item, index) => index !== boardIndex
        ? { ...item, assistants: { ...item.assistants, assistantOfficeIds: [selectedAssistant], office: 1 } } : item) }
    }
    const before = structuredClone(input)
    expect(() => orderCardReward(input, selectedPlayer, orderSlot, selectedAssistant)).toThrow()
    expect(input).toEqual(before)
    expectFrozen(input, false)
  })

  it.each(setupComponentCatalog.orders.map(order => order.id))('исполняет каталожную лицевую награду %s через публичный API', orderId => {
    const { state, playerId, assistantId, orderSlot, boardIndex } = fixture(2, orderId)
    const input = withGallery({ ...state, players: state.players.map(player => player.id === playerId
      ? { ...player, status: 'WAITING' } : player) }, boardIndex, ['B', 'R'])
    const reward = setupComponentCatalog.orders.find(order => order.id === orderId)!.reward
    const from = reward === 'VISITOR-BR' ? input.plazaVisitors.filter(visitor => visitor.type !== 'W') : input.visitorBag.visitors.filter(visitor => visitor.type !== 'W')
    const choices: OrderRewardChoices = {
      visitorId: from[0]!.id,
      orderActions: [{ typeAction: 'ACCEPT_ORDER', orderId: input.orderMarket.visibleOrders[1]!, orderSlot: 1 }],
    }
    const before = structuredClone(input)
    const result = orderCardReward(input, playerId, orderSlot, assistantId, choices)
    expect(result.events[0]).toEqual({ type: 'AssistantAssignedToOrder', playerId, orderSlot, orderId, assistantId })
    expect(result.state.playerBoards[boardIndex]!.boardOrders[orderSlot].assistant).toBe(assistantId)
    const previousPlayer = input.players.find(player => player.id === playerId)!
    const updatedPlayer = result.state.players.find(player => player.id === playerId)!
    const updatedBoard = result.state.playerBoards[boardIndex]!
    if (reward === 'COINS') expect(updatedPlayer.coins).toBe(previousPlayer.coins + 2)
    if (reward === 'INFLUENCE') expect(updatedPlayer.influence).toBe(previousPlayer.influence + 2)
    if (reward === 'VISITOR-BR' || reward === 'VISITOR-BAG') {
      expect(updatedBoard.gallery.visitors).toHaveLength(3)
      expect(updatedBoard.gallery.visitors[2]!.id).toBe(choices.visitorId)
    }
    if (reward === 'HIRE-FREE') {
      expect(updatedBoard.assistants.office).toBe(2)
      expect(updatedBoard.assistants.hireQueue).toBe(input.playerBoards[boardIndex]!.assistants.hireQueue - 1)
      expect(updatedPlayer.coins).toBe(previousPlayer.coins)
    }
    if (reward === 'ORDER-ACTION') {
      expect(updatedBoard.boardOrders[1].orderId).toBe(choices.orderActions![0]!.orderId)
      expect(updatedPlayer.status).toBe('SUCCESS')
    }
    for (const viewer of [null, ...input.players.map(player => player.id)]) {
      expect(projectGameForViewer(result.state, viewer).playerBoards[boardIndex]).toEqual(updatedBoard)
      expect(projectEventsForViewer(result.events, result.state, viewer)).toEqual(result.events)
    }
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
    expect(input).toEqual(before)
    expectFrozen(result, true)
    expectFrozen(input, false)
  })

  it('ограничивает влияние и не начисляет монеты', () => {
    const { state, playerId, assistantId, boardIndex, orderSlot } = fixture(2, 'ORDER-01')
    const input = withGallery({ ...state, players: state.players.map(player => player.id === playerId
      ? { ...player, influence: 34 } : player) }, boardIndex, ['R', 'R', 'W', 'B'])
    const result = orderCardReward(input, playerId, orderSlot, assistantId)
    expect(result.state.players.find(player => player.id === playerId)).toEqual({
      ...input.players.find(player => player.id === playerId), influence: 35,
    })
    expect(result.events[1]).toEqual({ type: 'InfluenceReceived', playerId, gainedInfluence: 1 })
  })

  it('бесплатный найм использует место, освобождённое назначением, без оплаты и награды клетки', () => {
    const { state, playerId, assistantId, boardIndex, orderSlot } = fixture(2, 'ORDER-09')
    const assistants = state.playerBoards[boardIndex]!.assistants
    const office = [...assistants.assistantOfficeIds, ...assistants.assistantHireQueueIds.slice(0, 2)]
    const queue = assistants.assistantHireQueueIds.slice(2)
    const input = { ...state, playerBoards: state.playerBoards.map((board, index) => index === boardIndex
      ? { ...board, assistants: { office: 4, assistantOfficeIds: office, hireQueue: queue.length, assistantHireQueueIds: queue } } : board) }
    const result = orderCardReward(input, playerId, orderSlot, assistantId)
    expect(result.state.playerBoards[boardIndex]!.assistants).toEqual({ office: 4,
      assistantOfficeIds: [...office.filter(id => id !== assistantId), queue[0]],
      hireQueue: queue.length - 1, assistantHireQueueIds: queue.slice(1) })
    expect(result.state.players).toEqual(input.players)
    expect(result.events.slice(1)).toEqual([{ type: 'AssistantsHired', countHiredAssistants: 1 }])
  })

  it('пустая очередь пропускает бесплатный найм, сохраняя назначение', () => {
    const { state, playerId, assistantId, boardIndex, orderSlot } = fixture(2, 'ORDER-09')
    const input = { ...state, playerBoards: state.playerBoards.map((board, index) => index === boardIndex
      ? { ...board, assistants: { ...board.assistants, hireQueue: 0, assistantHireQueueIds: [] } } : board) }
    const result = orderCardReward(input, playerId, orderSlot, assistantId)
    expect(result.events).toHaveLength(1)
    expect(result.state.playerBoards[boardIndex]!.assistants.office).toBe(1)
  })

  it.each(['VISITOR-BR', 'VISITOR-BAG'] as const)('%s выбирает мешочек по правилам источника', reward => {
    const { state, playerId, assistantId, boardIndex, orderSlot } = fixture(2, reward === 'VISITOR-BR' ? 'ORDER-05' : 'ORDER-06')
    const input = structuredClone({ ...state, plazaVisitors: state.plazaVisitors.filter(visitor => visitor.type === 'W') })
    const visitor = input.visitorBag.visitors.find(item => reward !== 'VISITOR-BR' || item.type === 'B')!
    const result = orderCardReward(input, playerId, orderSlot, assistantId, { visitorId: visitor.id })
    expect(result.events[1]).toEqual({ type: 'VisitorMoved', visitorId: visitor.id, from: 'visitorBag', to: 'gallery', playerId })
    expect(result.state.playerBoards[boardIndex]!.gallery.visitors).toContainEqual(visitor)
    expect(result.state.visitorBag.visitors).not.toContainEqual(visitor)
    expect(result.state.artworkMarket.remainingVisitorBag).toEqual(result.state.visitorBag)
  })

  it.each(['wrong source', 'collector limit', 'missing visitor'] as const)('поздний отказ посетителя: %s откатывает назначение', scenario => {
    const { state, playerId, assistantId, boardIndex, orderSlot } = fixture(2, scenario === 'collector limit' ? 'ORDER-06' : 'ORDER-05')
    const input = withGallery(state, boardIndex, scenario === 'collector limit' ? ['W'] : [])
    const visitorId = scenario === 'missing visitor' ? undefined
      : input.visitorBag.visitors.find(visitor => visitor.type === (scenario === 'collector limit' ? 'W' : 'B'))!.id
    const before = structuredClone(input)
    expect(() => orderCardReward(input, playerId, orderSlot, assistantId, visitorId === undefined ? {} : { visitorId })).toThrow()
    expect(input).toEqual(before)
    expectFrozen(input, false)
  })

  it('ORDER-ACTION сохраняет обновление, отказ, RNG и все события', () => {
    const { state, playerId, assistantId, boardIndex, orderSlot } = fixture(2, 'ORDER-02')
    const input: GameState = { ...state, players: state.players.map(player => player.id === playerId ? { ...player, status: 'WAITING' } : player) }
    const expectedRefresh = receiveOrder(input, playerId, 'REFRESH')
    const expected = receiveOrder(expectedRefresh.state, playerId, 'DECLINE')
    const result = orderCardReward(input, playerId, orderSlot, assistantId, { orderActions: [{ typeAction: 'REFRESH' }, { typeAction: 'DECLINE' }] })
    expect(result.events.slice(1)).toEqual([...expectedRefresh.events, ...expected.events])
    expect(result.state.orderMarket).toEqual(expected.state.orderMarket)
    expect(result.state.runtimeRng).toEqual(expected.state.runtimeRng)
    expect(result.state.players).toEqual(expected.state.players)
    expect(result.state.playerBoards[boardIndex]!.boardOrders[orderSlot].assistant).toBe(assistantId)
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
  })

  it.each(['missing actions', 'unfinished refresh', 'late invalid order', 'three orders'])('ORDER-ACTION атомарно отклоняет %s', scenario => {
    const { state, playerId, assistantId, boardIndex, orderSlot } = fixture(2, 'ORDER-02')
    let input: GameState = structuredClone({ ...state, players: state.players.map(player => player.id === playerId ? { ...player, status: 'WAITING' } : player) })
    if (scenario === 'three orders') input = { ...input, playerBoards: input.playerBoards.map((board, index) => index === boardIndex ? {
      ...board, boardOrders: { ...board.boardOrders,
        1: { orderId: 'ORDER-03', orderStatus: 'unfulfilled', assistant: null },
        3: { orderId: 'ORDER-10', orderStatus: 'unfulfilled', assistant: null },
      },
    } : board) }
    const choices: OrderRewardChoices = scenario === 'missing actions' ? {} : {
      orderActions: scenario === 'unfinished refresh' ? [{ typeAction: 'REFRESH' }]
        : [{ typeAction: 'REFRESH' }, { typeAction: 'ACCEPT_ORDER', orderId: 'invalid', orderSlot: 1 }],
    }
    const before = structuredClone(input)
    expect(() => orderCardReward(input, playerId, orderSlot, assistantId, choices)).toThrow()
    expect(input).toEqual(before)
    expectFrozen(input, false)
  })
})

describe('Общие эффекты без лицевых карт в текущем каталоге заказов', () => {
  it('билетная награда сохраняет пустую кассу, промежуточный подсчёт и переход к окончанию раунда', () => {
    const { state, playerId } = fixture()
    const input: GameState = { ...state, visitorBag: { visitors: [] },
      artworkMarket: { ...state.artworkMarket, remainingVisitorBag: { visitors: [] } },
      ticketOffice: { ticketsByColor: { B: 1, R: 0, W: 0 } },
    }
    const before = structuredClone(input)
    const result = applyOrderRewardEffect(input, playerId, 'TICKET-B', {})
    expect(result.state.ticketOfficeEmptyReached).toBe(true)
    expect(result.state.intermediateScoringStatus).toBe('pending')
    expect(result.state.phase).toBe('ending_current_round')
    expect(result.events.filter(event => event.type === 'GameEndTriggered')).toHaveLength(1)
    expect(input).toEqual(before)
  })

  it('TICKET-ANY использует выбранную замену недоступного цвета', () => {
    const { state, playerId } = fixture()
    const input: GameState = { ...state, ticketOffice: { ticketsByColor: { B: 0, R: 1, W: 0 } },
      ticketDiscard: { B: 1, R: 0, W: 0 } }
    const result = applyOrderRewardEffect(input, playerId, 'TICKET-ANY', {
      requestedTicketColors: ['B'], replacementColorsByRequestedColor: { B: 'R' },
    })
    expect(result.events).toContainEqual({ type: 'TicketExchanged', playerId, discardedColor: 'R', receivedColor: 'B' })
    expect(result.events).toContainEqual({ type: 'TicketReceived', playerId, color: 'B' })
  })

  it('полный офис пропускает HIRE-FREE без оплаты', () => {
    const { state, playerId, boardIndex } = fixture()
    const assistants = state.playerBoards[boardIndex]!.assistants
    const input: GameState = { ...state, playerBoards: state.playerBoards.map((board, index) => index === boardIndex
      ? { ...board, assistants: { office: 4, assistantOfficeIds: [...assistants.assistantOfficeIds, ...assistants.assistantHireQueueIds.slice(0, 2)],
        hireQueue: assistants.hireQueue - 2, assistantHireQueueIds: assistants.assistantHireQueueIds.slice(2) } } : board) }
    const result = applyOrderRewardEffect(input, playerId, 'HIRE-FREE', {})
    expect(result.state).toEqual(input)
    expect(result.events).toEqual([])
  })

  it('пустые запасы пропускают посетителя', () => {
    const { state, playerId } = fixture()
    const input: GameState = { ...state, plazaVisitors: [], visitorBag: { visitors: [] },
      artworkMarket: { ...state.artworkMarket, remainingVisitorBag: { visitors: [] } } }
    for (const reward of ['VISITOR-ANY', 'VISITOR-BR', 'VISITOR-BAG'] as const) {
      expect(applyOrderRewardEffect(input, playerId, reward, {}).events).toEqual([])
    }
  })

  it.each(['TICKET-ANY', 'TICKET-DIFF2', 'TICKET-B', 'TICKET-R'] as const)('%s переиспользует билетную команду', reward => {
    const { state, playerId } = fixture()
    const result = applyOrderRewardEffect(state, playerId, reward, { requestedTicketColors: reward === 'TICKET-DIFF2' ? ['B', 'W'] : ['W'] })
    const colors = reward === 'TICKET-B' ? ['B'] : reward === 'TICKET-R' ? ['R'] : reward === 'TICKET-DIFF2' ? ['B', 'W'] : ['W']
    expect(result.events.filter(event => event.type === 'TicketReceived').map(event => event.color)).toEqual(colors)
    expect(restoreGameState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state)
  })

  it.each([{}, { requestedTicketColors: ['B'] }, { requestedTicketColors: ['B', 'B'] }, { requestedTicketColors: ['B', 'invalid'] }])('TICKET-DIFF2 атомарно проверяет цвета %j', choices => {
    const { state, playerId } = fixture()
    const before = structuredClone(state)
    expect(() => applyOrderRewardEffect(state, playerId, 'TICKET-DIFF2', choices as OrderRewardChoices)).toThrow()
    expect(state).toEqual(before)
    expectFrozen(state, false)
  })

  it.each(['plaza', 'visitorBag'] as const)('VISITOR-ANY выбирает %s', from => {
    const { state, playerId, boardIndex } = fixture()
    const input = from === 'visitorBag' ? { ...state, plazaVisitors: [] } : state
    const visitor = (from === 'plaza' ? input.plazaVisitors : input.visitorBag.visitors)[0]!
    const result = applyOrderRewardEffect(input, playerId, 'VISITOR-ANY', { visitorId: visitor.id })
    expect(result.state.playerBoards[boardIndex]!.gallery.visitors).toContainEqual(visitor)
    expect(result.events[0]).toEqual({ type: 'VisitorMoved', visitorId: visitor.id, from, to: 'gallery', playerId })
  })

  it('FAME-C повышает известность выбранного открытого художника и применяет суперзвезду один раз', () => {
    const { state, playerId, boardIndex } = fixture()
    const artist = state.artistMarket.slots.find(item => item.isOpen)!
    const input = withGallery({ ...state, artistMarket: { ...state.artistMarket,
      slots: state.artistMarket.slots.map(item => item.artistId === artist.artistId ? { ...item, fame: 18 } : item) } }, boardIndex, ['W'])
    const result = applyOrderRewardEffect(input, playerId, 'FAME-C', { fameArtistId: artist.artistId })
    expect(result.state.artistMarket.slots.find(item => item.artistId === artist.artistId)).toMatchObject({ fame: 19, isSuperstar: true })
    expect(result.events).toContainEqual({ type: 'CoinsReceived', playerId, coinsReceived: 5 })
    const again = applyOrderRewardEffect(result.state, playerId, 'FAME-C', { fameArtistId: artist.artistId })
    expect(again.events).not.toContainEqual({ type: 'CoinsReceived', playerId, coinsReceived: 5 })
    expectFrozen(result, true)
    expectFrozen(input, false)
  })

  it('FAME-C запрещает закрытого художника даже при нуле коллекционеров', () => {
    const { state, playerId } = fixture()
    const artist = state.artistMarket.slots.find(item => !item.isOpen)!
    const before = structuredClone(state)
    expect(() => applyOrderRewardEffect(state, playerId, 'FAME-C', { fameArtistId: artist.artistId })).toThrow('open artist')
    expect(state).toEqual(before)
    expectFrozen(state, false)
  })
})
