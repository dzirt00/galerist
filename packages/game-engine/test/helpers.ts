import { expect } from 'vitest'
import { restoreGameState, setupComponentCatalog } from '../src/index.js'

/**
 * Согласует неиспользованные запасы старой изолированной фикстуры перед проверкой JSON-восстановления.
 * Такие сценарии напрямую задают ресурсы и размещения для проверки отдельного действия.
 * Помощник меняет только тестовую копию; тесты повреждённых снимков вызывают restoreGameState напрямую.
 */
export function conserveFixtureComponents<T extends GameState>(input: T): T {
  let state = structuredClone(input)
  const activeVisitors = [...state.plazaVisitors, ...state.vestibuleVisitors.map(item => item.vestibuleVisitor),
    ...state.playerBoards.flatMap(board => board.gallery.visitors)]
  const visitorIds = new Set(activeVisitors.map(item => item.id))
  const counts = Object.fromEntries(setupComponentCatalog.ticketColors.map(color => [color, activeVisitors.filter(item => item.type === color).length]))
  /** Сохраняет фонового посетителя только при свободном ID и наличии места в физическом пуле его цвета. */
  const keepVisitor = (visitor: import('../src/index.js').VisitorInstance) => {
    if (visitorIds.has(visitor.id) || counts[visitor.type]! >= setupComponentCatalog.visitorPools[state.config.playerCount][visitor.type]) return false
    visitorIds.add(visitor.id); counts[visitor.type]!++; return true
  }
  state = { ...state, artistSetup: { ...state.artistSetup, slots: state.artistSetup.slots.map(slot => ({ ...slot, collector: slot.collector && keepVisitor(slot.collector) ? slot.collector : null })) },
    artworkMarket: { ...state.artworkMarket, openArtworksByGenre: Object.fromEntries(Object.entries(state.artworkMarket.openArtworksByGenre).map(([genre, slot]) => [genre, slot ? { ...slot, visitors: slot.visitors.filter(keepVisitor) } : null])) as GameState['artworkMarket']['openArtworksByGenre'] } }
  state = { ...state, visitorBag: { visitors: state.visitorBag.visitors.filter(keepVisitor) } }
  // Билеты, явно выданные игрокам и сбросу, вычитаются из кассы, а не добавляются поверх полного запаса.
  const tickets = { ...state.ticketOffice.ticketsByColor }
  for (const color of setupComponentCatalog.ticketColors) tickets[color] = Math.max(0, setupComponentCatalog.ticketsPerColor[state.config.playerCount]
    - state.ticketDiscard[color] - state.players.reduce((sum, player) => sum + player.ticketsByColor[color], 0))
  const used = new Set(state.masterpieceAuction.artworks.map(item => item.id))
  /** Сопоставляет условную работу фикстуры со свободным каталожным экземпляром, не дублируя аукционные работы. */
  const remap = (id: string): string => {
    let candidate = setupComponentCatalog.artworks.find(item => item.id === id && !used.has(id))
    candidate ??= setupComponentCatalog.artworks.find(item => !used.has(item.id))
    if (!candidate) throw new Error('Synthetic artwork fixture exceeds catalog')
    used.add(candidate.id); return candidate.id
  }
  state = { ...state, ticketOffice: { ticketsByColor: tickets }, playerBoards: state.playerBoards.map(board => {
    const soldArtworkIds = board.soldArtworkIds.map(remap)
    const artworkSlots = board.gallery.artworkSlots.map(item => item ? { ...item, artworkId: remap(item.artworkId) } : null) as unknown as typeof board.gallery.artworkSlots
    const pending = board.reputationTokenArtworkIds
    return { ...board, soldArtworkIds, gallery: { ...board.gallery, artworkSlots },
      reputationTokenArtworkIds: pending && Object.fromEntries(Object.entries(pending).map(([token, id]) => [token, id])) }
  }) }
  // Приоритет у явно заданных работ игроков и аукциона; их копии удаляются из фоновых стопок рынка.
  state = { ...state, artworkMarket: { ...state.artworkMarket,
    openArtworksByGenre: Object.fromEntries(Object.entries(state.artworkMarket.openArtworksByGenre).map(([genre, slot]) => {
      if (!slot || used.has(slot.artwork.id)) return [genre, null]
      used.add(slot.artwork.id); return [genre, slot]
    })) as GameState['artworkMarket']['openArtworksByGenre'],
    remainingArtworksByGenre: Object.fromEntries(Object.entries(state.artworkMarket.remainingArtworksByGenre).map(([genre, artworks]) => [genre, artworks.filter(artwork => {
      if (used.has(artwork.id)) return false
      used.add(artwork.id); return true
    })])) as unknown as GameState['artworkMarket']['remainingArtworksByGenre'] } }
  // Помощники, явно размещённые сценарием, сокращают неиспользованную очередь до общего лимита десять.
  state = { ...state, playerBoards: state.playerBoards.map(board => {
    const deployed = board.assistants.assistantOfficeIds.length + board.locationAssistants.length
      + Object.values(board.boardOrders).filter(item => item.assistant !== null).length
      + state.internationalMarket.marketAssistants.filter(item => item.playerId === board.playerId).length
      + (board.ejectedAssistant ? 1 : 0)
    const ids = board.assistants.assistantHireQueueIds.slice(0, Math.max(0, 10 - deployed))
    return { ...board, assistants: { ...board.assistants, assistantHireQueueIds: ids, hireQueue: ids.length } }
  }) }
  return state as T
}

/** Проверяет JSON-восстановление изолированной фикстуры после согласования её фоновых запасов. */
export function expectRestoredFixture(input: GameState): void {
  const state = conserveFixtureComponents(input)
  expect(restoreGameState(JSON.parse(JSON.stringify(state)))).toEqual(state)
}
import {
  advanceTurn,
  chooseStartingLocation,
  createGame,
  startGame,
  type EndingSequenceGameState,
  type GameConfig,
  type GameState,
  type PlayerConfig,
  type RegularPlayGameState,
  type SetupGameState,
  type TurnDraft,
} from '../src/index.js'

/** Готовит два индикатора окончания для тестов следующих этапов lifecycle. */
export function withGameEndConditions<TState extends GameState>(
  state: TState,
  preserve?: 'ticketOffice' | 'visitorBag',
): TState {
  const superstarMarket = {
    ...state.artistMarket,
    slots: state.artistMarket.slots.map((slot, index) => index < 2
      ? { ...slot, isOpen: true, fame: 19, isSuperstar: true }
      : slot),
  }
  return {
    ...state,
    ...(preserve === 'ticketOffice'
      ? { artistMarket: superstarMarket }
      : { ticketOffice: { ticketsByColor: { B: 0, R: 0, W: 0 } } }),
    ...(preserve === 'visitorBag'
      ? { artistMarket: superstarMarket }
      : { visitorBag: { visitors: [] } }),
  }
}

/** Завершает выбор стартовых локаций первым доступным вариантом для каждого игрока. */
export function completeStartingLocationSelection(
  initialState: SetupGameState,
): SetupGameState {
  let state = initialState

  while (state.setupStage === 'choosing_starting_locations') {
    state = chooseStartingLocation(
      state,
      state.currentStartingLocationPlayerId!,
      state.availableStartingLocationIds[0]!,
    ).state
  }

  return state
}

/** Завершает setup с детерминированным тестовым выбором и начинает игру. */
export function startGameAfterSetup(
  initialState: SetupGameState,
): RegularPlayGameState {
  return startGame(completeStartingLocationSelection(initialState)).state
}

/** Создаёт setup-состояние для тестов, не проверяющих события команды. */
export function createGameState(
  config: GameConfig,
  players: readonly PlayerConfig[],
): SetupGameState {
  return createGame({
    gameId: 'game-test',
    config,
    players,
  }).state
}

/** Проверяет последовательность ходов и неизменность исходного состояния. */
export function advanceAndExpectTurns(
  initialState: GameState,
  expectedTurns: readonly { activePlayerId: string; round: number }[],
) {
  const initialStateSnapshot = structuredClone(initialState)
  const nextStates: GameState[] = []
  const nextStateSnapshots: GameState[] = []
  let previousState = initialState

  for (const expectedTurn of expectedTurns) {
    const nextState = advanceTurn(previousState).state

    expect(nextState).not.toBe(previousState)
    nextStates.push(nextState)
    nextStateSnapshots.push(structuredClone(nextState))
    expect(nextState.id).toBe(initialState.id)
    expect(nextState.status).toBe(initialState.status)
    expect(nextState.config).toEqual(initialState.config)
    expect(nextState.players).toEqual(initialState.players)
    expect(Object.isFrozen(nextState)).toBe(true)
    expect(nextState.activePlayerId).toBe(expectedTurn.activePlayerId)
    expect(nextState.round).toBe(expectedTurn.round)

    previousState = nextState
  }

  expect(nextStates).toEqual(nextStateSnapshots)
  expect(initialState).toEqual(initialStateSnapshot)
}

type EndingTurnExpectation = readonly [
  phase: 'ending_current_round' | 'final_round' | 'final_scoring',
  round: number,
  firstPlayerId: string,
  activePlayerId: string | null,
]

/** Определяет, относится ли состояние к фазам завершения игры. */
function isEndingSequenceGameState(state: GameState): state is EndingSequenceGameState {
  return state.phase === 'ending_current_round'
    || state.phase === 'final_round'
    || state.phase === 'final_scoring'
}

/** Сверяет состояния завершения с ожидаемыми фазами, раундами и игроками. */
export function expectEndingTurns(
  states: readonly GameState[],
  initialState: GameState,
  expectedTurns: readonly EndingTurnExpectation[],
) {
  expect(states).toHaveLength(expectedTurns.length)

  states.forEach((state, index) => {
    const [phase, round, firstPlayerId, activePlayerId] = expectedTurns[index]!
    expect(state.phase).toBe(phase)
    if (!isEndingSequenceGameState(state)) {
      throw new Error(`Expected an ending state, received ${state.phase}`)
    }
    expect(state.round).toBe(round)
    expect(state.firstPlayerId).toBe(firstPlayerId)
    expect(state).toMatchObject({ endTriggeredRound: initialState.round })
    expect(state.status).toBe('in_progress')
    expect(state.config).toEqual(initialState.config)
    expect(state.players).toEqual(initialState.players)
    expect(state.activePlayerId).toEqual(activePlayerId)
  })
}

/** Проверяет заморозку черновика и всех вложенных действий. */
export function expectDraftFrozen(draft: TurnDraft, frozen: boolean) {
  const objects = [
    draft,
    draft.movement,
    draft.locationAction,
    draft.management,
    draft.management?.command,
  ]
  for (const object of objects) {
    if (object !== undefined) {
      expect(Object.isFrozen(object)).toBe(frozen)
    }
  }
}

/** Проверяет заморозку плана хода, списка шагов и каждого шага. */
export function expectPreparedTurnFrozen(
  prepared: { readonly steps: readonly object[] },
) {
  expect(Object.isFrozen(prepared)).toBe(true)
  expect(Object.isFrozen(prepared.steps)).toBe(true)
  prepared.steps.forEach(step => expect(Object.isFrozen(step)).toBe(true))
}
