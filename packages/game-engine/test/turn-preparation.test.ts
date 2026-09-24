import { expect, it } from 'vitest'
import {
  advanceTurn,
  confirmTurnDraft,
  createTurnDraft,
  prepareTurn,
  triggerGameEnd,
  updateTurnDraft,
  type ConfirmedTurnCommand,
  type GameState,
  type ManagementTiming,
} from '../src/index.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'
import { createGameState, startGameAfterSetup } from './helpers.js'

/** Создаёт состояние обычного хода для тестов. */
function createRegularTurnState(): GameState {
  return startGameAfterSetup(createGameState(twoPlayerGameConfig, twoPlayerConfigs))
}

/** Доводит тестовую игру до финального раунда. */
function createFinalRoundTurnState(): GameState {
  let state: GameState = triggerGameEnd(createRegularTurnState()).state
  state = advanceTurn(state)
  return advanceTurn(state)
}

/** Доводит тестовую игру до итогового подсчёта. */
function createFinalScoringTurnState(): GameState {
  let state = createFinalRoundTurnState()
  state = advanceTurn(state)
  return advanceTurn(state)
}

/** Создаёт подтверждённую команду хода с заданным временем управления. */
function createConfirmedTurn(
  timing?: ManagementTiming,
): ConfirmedTurnCommand {
  return {
    type: 'perform_turn',
    playerId: 'player-1',
    movement: { category: 'movement' },
    locationAction: { category: 'location_action' },
    ...(timing === undefined ? {} : {
      management: {
        timing,
        command: { category: 'management_action' },
      },
    }),
  }
}

/** Проверяет заморозку плана хода и всех его шагов. */
function expectPreparedTurnFrozen(
  prepared: ReturnType<typeof prepareTurn>,
) {
  expect(Object.isFrozen(prepared)).toBe(true)
  expect(Object.isFrozen(prepared.steps)).toBe(true)
  prepared.steps.forEach(step => expect(Object.isFrozen(step)).toBe(true))
}

/** Сохраняет признаки заморозки входного состояния и команды. */
function inputFreezeFlags(
  state: GameState,
  command: ConfirmedTurnCommand,
): boolean[] {
  const values: unknown[] = [
    state,
    state.config,
    state.players,
    ...state.players,
    command,
    command.movement,
    command.locationAction,
    command.management,
    command.management?.command,
  ]

  return values
    .filter((value): value is object => typeof value === 'object' && value !== null)
    .map(value => Object.isFrozen(value))
}

/** Проверяет отказ в подготовке хода без изменения входных данных. */
function expectPreparationRejectedWithoutChangingInputs(
  state: GameState,
  command: ConfirmedTurnCommand,
  message: string,
) {
  const stateSnapshot = structuredClone(state)
  const commandSnapshot = structuredClone(command)
  const freezeFlags = inputFreezeFlags(state, command)

  expect(() => prepareTurn(state, command)).toThrow(message)
  expect(state).toEqual(stateSnapshot)
  expect(command).toEqual(commandSnapshot)
  expect(inputFreezeFlags(state, command)).toEqual(freezeFlags)
}

it.each([
  {
    timing: undefined,
    expectedCategories: ['movement', 'location_action'],
  },
  {
    timing: 'before_location' as const,
    expectedCategories: ['movement', 'management_action', 'location_action'],
  },
  {
    timing: 'after_location' as const,
    expectedCategories: ['movement', 'location_action', 'management_action'],
  },
])('составляет точный порядок шагов при времени управления $timing', ({
  timing,
  expectedCategories,
}) => {
  const prepared = prepareTurn(createRegularTurnState(), createConfirmedTurn(timing))

  expect(prepared).toEqual({
    playerId: 'player-1',
    steps: expectedCategories.map(category => ({ category })),
  })
  expect(prepared.steps).toHaveLength(expectedCategories.length)
  expect(prepared.steps).not.toContain(undefined)
})

it.each([
  ['regular_play', createRegularTurnState],
  ['ending_current_round', () => triggerGameEnd(createRegularTurnState()).state],
  ['final_round', createFinalRoundTurnState],
] as const)('подготавливает ход в фазе %s', (phase, createState) => {
  const prepared = prepareTurn(createState(), createConfirmedTurn())

  expect(prepared.playerId).toBe('player-1')
  expect(prepared.steps.map(step => step.category)).toEqual([
    'movement',
    'location_action',
  ])
  expect(phase).toBe(createState().phase)
})

it.each([
  ['setup', () => createGameState(twoPlayerGameConfig, twoPlayerConfigs), 'Game status must be in_progress'],
  [
    'final_scoring',
    createFinalScoringTurnState,
    'Turn preparation is not allowed in phase: final_scoring',
  ],
  [
    'finished',
    () => ({
      ...createFinalScoringTurnState(),
      status: 'finished',
      phase: 'finished',
    } as unknown as GameState),
    'Game status must be in_progress',
  ],
] as const)('отклоняет подготовку хода в фазе %s', (_phase, createState, message) => {
  expectPreparationRejectedWithoutChangingInputs(
    createState(),
    createConfirmedTurn(),
    message,
  )
})

it('отклоняет несогласованный статус игры в фазе хода', () => {
  const state = {
    ...createRegularTurnState(),
    status: 'finished',
  } as unknown as GameState

  expectPreparationRejectedWithoutChangingInputs(
    state,
    createConfirmedTurn(),
    'Game status must be in_progress',
  )
})

it.each([
  ['другой участник', 'player-2'],
  ['неизвестный игрок', 'player-unknown'],
])('отклоняет команду, которую отправил %s', (_case, playerId) => {
  const command = { ...createConfirmedTurn(), playerId }

  expectPreparationRejectedWithoutChangingInputs(
    createRegularTurnState(),
    command,
    'Command playerId does not match activePlayerId',
  )
})

it.each([
  ['пустой ID', null],
  ['неизвестный игрок', 'player-unknown'],
])('отклоняет активного игрока: %s', (_case, activePlayerId) => {
  const state = {
    ...createRegularTurnState(),
    activePlayerId,
  } as unknown as GameState

  expectPreparationRejectedWithoutChangingInputs(
    state,
    createConfirmedTurn(),
    'activePlayerId is invalid or not in the game',
  )
})

type InvalidConfirmedTurnChange = (command: ConfirmedTurnCommand) => unknown

const invalidConfirmedTurnMutationCases: readonly (readonly [
  caseName: string,
  changeCommand: InvalidConfirmedTurnChange,
])[] = [
  ['отсутствует перемещение', command => {
    const changed: Record<string, unknown> = { ...command }
    delete changed.movement
    return changed
  }],
  ['перемещение не определено', command => ({ ...command, movement: undefined })],
  ['отсутствует действие локации', command => {
    const changed: Record<string, unknown> = { ...command }
    delete changed.locationAction
    return changed
  }],
  ['действие локации не определено', command => ({ ...command, locationAction: undefined })],
]

it.each(invalidConfirmedTurnMutationCases)('отклоняет подтверждённый ход: %s', (_case, changeCommand) => {
  const command = changeCommand(createConfirmedTurn())

  expectPreparationRejectedWithoutChangingInputs(
    createRegularTurnState(),
    command as unknown as ConfirmedTurnCommand,
    'Confirmed turn requires movement and location action',
  )
})

it('возвращает новый замороженный план, независимый от изменяемых входов', () => {
  const state = structuredClone(createRegularTurnState())
  const command = structuredClone(createConfirmedTurn('before_location'))
  const stateSnapshot = structuredClone(state)
  const commandSnapshot = structuredClone(command)

  const prepared = prepareTurn(state, command)

  expectPreparedTurnFrozen(prepared)
  expect(prepared.steps[0]).not.toBe(command.movement)
  expect(prepared.steps[1]).not.toBe(command.management?.command)
  expect(prepared.steps[2]).not.toBe(command.locationAction)
  expect(state).toEqual(stateSnapshot)
  expect(command).toEqual(commandSnapshot)
  expect(Object.isFrozen(state)).toBe(false)
  expect(Object.isFrozen(command)).toBe(false)
  expect(Object.isFrozen(command.movement)).toBe(false)
  expect(Object.isFrozen(command.locationAction)).toBe(false)
  expect(Object.isFrozen(command.management)).toBe(false)
  expect(Object.isFrozen(command.management?.command)).toBe(false)

  Object.assign(command.movement, { testMarker: 'changed' })
  Object.assign(command.locationAction, { testMarker: 'changed' })
  Object.assign(command.management!.command, { testMarker: 'changed' })

  prepared.steps.forEach(step => expect(step).not.toHaveProperty('testMarker'))
})

it('возвращает равные независимые планы при повторной подготовке', () => {
  const state = structuredClone(createRegularTurnState())
  const command = structuredClone(createConfirmedTurn('after_location'))

  const first = prepareTurn(state, command)
  const second = prepareTurn(state, command)

  expect(second).toEqual(first)
  expect(second).not.toBe(first)
  expect(second.steps).not.toBe(first.steps)
  second.steps.forEach((step, index) => expect(step).not.toBe(first.steps[index]))
  expectPreparedTurnFrozen(first)
  expectPreparedTurnFrozen(second)
})

it('повторно проверяет активного игрока после передачи хода', () => {
  const state = createRegularTurnState()
  const command = createConfirmedTurn()

  expect(() => prepareTurn(state, command)).not.toThrow()

  const nextState = advanceTurn(state)
  expectPreparationRejectedWithoutChangingInputs(
    nextState,
    command,
    'Command playerId does not match activePlayerId',
  )
})

it('подготавливает ход, созданный через полный цикл черновика', () => {
  const empty = createTurnDraft('player-1')
  const moved = updateTurnDraft(empty, {
    type: 'set_movement',
    movement: { category: 'movement' },
  })
  const located = updateTurnDraft(moved, {
    type: 'set_location_action',
    locationAction: { category: 'location_action' },
  })
  const managed = updateTurnDraft(located, {
    type: 'set_management_action',
    timing: 'before_location',
    managementAction: { category: 'management_action' },
  })

  const prepared = prepareTurn(
    createRegularTurnState(),
    confirmTurnDraft(managed),
  )

  expect(prepared.steps.map(step => step.category)).toEqual([
    'movement',
    'management_action',
    'location_action',
  ])
  expectPreparedTurnFrozen(prepared)
})
