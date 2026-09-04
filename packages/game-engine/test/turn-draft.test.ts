import { expect, it } from 'vitest'
import {
  confirmTurnDraft,
  createTurnDraft,
  updateTurnDraft,
  type LocationActionCommand,
  type ManagementActionCommand,
  type ManagementTiming,
  type MovementCommand,
  type TurnDraft,
  type TurnDraftEdit,
} from '../src/index.js'
import { expectDraftFrozen } from './helpers.js'

it('createTurnDraft creates an empty frozen draft for the player', () => {
  const draft = createTurnDraft('player-1')

  expect(draft).toEqual({ playerId: 'player-1' })
  expect(draft).not.toBe(createTurnDraft('player-1'))
  expect(draft).not.toHaveProperty('movement')
  expect(draft).not.toHaveProperty('locationAction')
  expect(draft).not.toHaveProperty('management')
  expect(Object.isFrozen(draft)).toBe(true)
})

function expectDraftReplacementIsImmutable({
  initialDraft,
  initialSnapshot,
  previousDraft,
  previousSnapshot,
  finalDraft,
  originalCommand,
  replacementCommand,
}: {
  initialDraft: TurnDraft
  initialSnapshot: TurnDraft
  previousDraft: TurnDraft
  previousSnapshot: TurnDraft
  finalDraft: TurnDraft
  originalCommand: object
  replacementCommand: object
}) {
  expect(finalDraft).not.toBe(previousDraft)
  expect(previousDraft).toEqual(previousSnapshot)
  expectDraftFrozen(previousDraft, true)
  expectDraftFrozen(finalDraft, true)
  expect(Object.isFrozen(originalCommand)).toBe(false)
  expect(Object.isFrozen(replacementCommand)).toBe(false)
  expect(initialDraft).toEqual(initialSnapshot)
  expect(previousDraft).not.toBe(initialDraft)
}

it('проверка case set_movement в updateTurnDraft',() => {
  const turnDraft: TurnDraft = { playerId: 'player-1' }
  const turnDraftClone = structuredClone(turnDraft)
  const firstMovement: MovementCommand = { category: 'movement' }
  const firstEdit: TurnDraftEdit = {
    type: 'set_movement',
    movement: firstMovement
  }
  const draftWithFirstMovement = updateTurnDraft(turnDraft, firstEdit)
  const firstDraftSnapshot = structuredClone(draftWithFirstMovement)
  // Test-only labels distinguish abstract commands without defining game actions.
  const secondMovement = { category: 'movement' as const, testId: 'replacement' }
  const secondEdit: TurnDraftEdit = {
    type: 'set_movement',
    movement: secondMovement
  }
  const finalDraft = updateTurnDraft(draftWithFirstMovement, secondEdit)

  expect(finalDraft.movement).toEqual(secondMovement)
  expect(finalDraft.movement).not.toBe(secondMovement)
  expect(finalDraft.movement).not.toBe(draftWithFirstMovement.movement)
  expectDraftReplacementIsImmutable({
    initialDraft: turnDraft,
    initialSnapshot: turnDraftClone,
    previousDraft: draftWithFirstMovement,
    previousSnapshot: firstDraftSnapshot,
    finalDraft,
    originalCommand: firstMovement,
    replacementCommand: secondMovement,
  })
})

it('проверка case set_location_action в updateTurnDraft',() => {
  const turnDraft: TurnDraft = { playerId: 'player-1' }
  const turnDraftClone = structuredClone(turnDraft)
  const firstMovement: LocationActionCommand = { category: 'location_action' }
  const firstEdit: TurnDraftEdit = {
    type: 'set_location_action',
    locationAction: firstMovement
  }
  const draftWithFirstMovement = updateTurnDraft(turnDraft, firstEdit)
  const firstDraftSnapshot = structuredClone(draftWithFirstMovement)
  const secondMovement = { category: 'location_action' as const, testId: 'replacement' }
  const secondEdit: TurnDraftEdit = {
    type: 'set_location_action',
    locationAction: secondMovement
  }
  const finalDraft = updateTurnDraft(draftWithFirstMovement, secondEdit)

  expect(finalDraft.locationAction).toEqual(secondMovement)
  expect(finalDraft.locationAction).not.toBe(secondMovement)
  expect(finalDraft.locationAction).not.toBe(draftWithFirstMovement.locationAction)
  expectDraftReplacementIsImmutable({
    initialDraft: turnDraft,
    initialSnapshot: turnDraftClone,
    previousDraft: draftWithFirstMovement,
    previousSnapshot: firstDraftSnapshot,
    finalDraft,
    originalCommand: firstMovement,
    replacementCommand: secondMovement,
  })
})

it.each([
  ['before_location', 'after_location'],
  ['after_location', 'before_location'],
] as const)('replaces management timing from %s to %s', (firstTiming, secondTiming) => {
  const turnDraft: TurnDraft = { playerId: 'player-1' }
  const turnDraftClone = structuredClone(turnDraft)
  const firstManagementAction: ManagementActionCommand = { category: 'management_action' }
  const firstEdit: TurnDraftEdit = {
    type: 'set_management_action',
    timing: firstTiming,
    managementAction: firstManagementAction
  }
  const draftWithFirstMovement = updateTurnDraft(turnDraft, firstEdit)
  const firstDraftSnapshot = structuredClone(draftWithFirstMovement)
  const secondManagementAction = { category: 'management_action' as const, testId: 'replacement' }
  const secondEdit: TurnDraftEdit = {
    type: 'set_management_action',
    timing: secondTiming,
    managementAction: secondManagementAction
  }
  const finalDraft = updateTurnDraft(draftWithFirstMovement, secondEdit)

  expect(finalDraft.management!.timing).toBe(secondEdit.timing)
  expect(finalDraft.management!.command).toStrictEqual(secondManagementAction)
  expect(finalDraft.management).not.toBe(draftWithFirstMovement.management)
  expect(finalDraft.management!.command).not.toBe(secondManagementAction)
  expect(finalDraft).not.toBe(draftWithFirstMovement)
  expect(draftWithFirstMovement).toEqual(firstDraftSnapshot)
  expect(finalDraft).toEqual({
    playerId: 'player-1',
    management: { timing: secondTiming, command: secondManagementAction },
  })
  expectDraftFrozen(draftWithFirstMovement, true)
  expectDraftFrozen(finalDraft, true)
  expect(Object.isFrozen(firstManagementAction)).toBe(false)
  expect(Object.isFrozen(secondManagementAction)).toBe(false)
  expect(turnDraft).toEqual(turnDraftClone)
  expect(draftWithFirstMovement).not.toBe(turnDraft)
  expect(turnDraft).toEqual({ playerId: 'player-1' })
})

function createCompleteMutableTurnDraftFixture() {
  return {
    playerId: 'player-1',
    movement: { category: 'movement' as const, testId: 'original movement' },
    locationAction: { category: 'location_action' as const, testId: 'original location' },
    management: {
      timing: 'before_location' as ManagementTiming,
      command: { category: 'management_action' as const, testId: 'original management' },
    },
  }
}

function expectDraftFrozen(draft: TurnDraft, frozen: boolean) {
  const objects = [draft, draft.movement, draft.locationAction, draft.management, draft.management?.command]
  for (const object of objects) {
    if (object !== undefined) expect(Object.isFrozen(object)).toBe(frozen)
  }
}

it.each([true, false])('clears management immutably when present: %s', present => {
  const complete = createCompleteMutableTurnDraftFixture()
  const { management, ...withoutManagement } = complete
  const input = present ? complete : withoutManagement
  const snapshot = structuredClone(input)
  const result = updateTurnDraft(input, { type: 'clear_management_action' })

  expect(result).toEqual(withoutManagement)
  expect(result).not.toHaveProperty('management')
  expect(result).not.toBe(input)
  expect(input).toEqual(snapshot)
  expectDraftFrozen(input, false)
  expectDraftFrozen(result, true)
})

const immutableDraftEditCases: readonly TurnDraftEdit[] = [
  { type: 'set_movement', movement: { category: 'movement' } },
  { type: 'set_location_action', locationAction: { category: 'location_action' } },
  { type: 'set_management_action', timing: 'after_location', managementAction: { category: 'management_action' } },
  { type: 'clear_management_action' },
]

it.each(immutableDraftEditCases)('owns all nested objects after $type on a mutable draft', edit => {
  const input = createCompleteMutableTurnDraftFixture()
  const inputSnapshot = structuredClone(input)
  const editSnapshot = structuredClone(edit)
  const result = updateTurnDraft(input, edit)
  const resultSnapshot = structuredClone(result)

  expect(result).not.toBe(input)
  expect(result.playerId).toBe(input.playerId)
  expect(input).toEqual(inputSnapshot)
  expect(edit).toEqual(editSnapshot)
  expectDraftFrozen(input, false)
  expectDraftFrozen(result, true)

  if (edit.type !== 'set_movement') expect(result.movement).toEqual(input.movement)
  if (edit.type !== 'set_location_action') expect(result.locationAction).toEqual(input.locationAction)
  if (edit.type === 'set_movement' || edit.type === 'set_location_action') {
    expect(result.management).toEqual(input.management)
  }
  const command = edit.type === 'set_movement' ? edit.movement
    : edit.type === 'set_location_action' ? edit.locationAction
    : edit.type === 'set_management_action' ? edit.managementAction : undefined
  if (command !== undefined) expect(Object.isFrozen(command)).toBe(false)

  input.movement.testId = 'changed by caller'
  input.locationAction.testId = 'changed by caller'
  input.management.command.testId = 'changed by caller'
  input.management.timing = 'after_location'
  expect(result).toEqual(resultSnapshot)
})

it.each(['before_location', 'after_location', undefined] as const)(
  'confirms an independent frozen command with management timing: %s', timing => {
    const complete = createCompleteMutableTurnDraftFixture()
    const { management, ...withoutManagement } = complete
    if (timing !== undefined) management.timing = timing
    const input = timing === undefined ? withoutManagement : complete
    const snapshot = structuredClone(input)
    const result = confirmTurnDraft(input)

    expect(result).toEqual({ type: 'perform_turn', ...snapshot })
    expect(result).not.toBe(input)
    expect(result.movement).not.toBe(input.movement)
    expect(result.locationAction).not.toBe(input.locationAction)
    if (timing === undefined) {
      expect(result).not.toHaveProperty('management')
    } else {
      expect(result.management).not.toBe(management)
      expect(result.management!.command).not.toBe(management.command)
      expect(result.management!.timing).toBe(timing)
    }
    expect(input).toEqual(snapshot)
    expectDraftFrozen(input, false)
    expectDraftFrozen(result, true)

    complete.movement.testId = 'changed by caller'
    complete.locationAction.testId = 'changed by caller'
    management.command.testId = 'changed by caller'
    management.timing = timing === 'before_location' ? 'after_location' : 'before_location'
    expect(result).toEqual({ type: 'perform_turn', ...snapshot })
  },
)

it.each([
  { name: 'both absent', parts: {}, error: 'Turn draft requires movement' },
  { name: 'movement absent', parts: { locationAction: { category: 'location_action' } }, error: 'Turn draft requires movement' },
  { name: 'location action absent', parts: { movement: { category: 'movement' } }, error: 'Turn draft requires location action' },
  { name: 'movement undefined', parts: { movement: undefined, locationAction: { category: 'location_action' } }, error: 'Turn draft requires movement' },
  { name: 'location action undefined', parts: { movement: { category: 'movement' }, locationAction: undefined }, error: 'Turn draft requires location action' },
])('rejects $name without mutating or freezing input', ({ parts, error }) => {
  // Explicit undefined simulates a JavaScript caller outside the static TS contract.
  const input = {
    playerId: 'player-1',
    management: createCompleteMutableTurnDraftFixture().management,
    ...parts,
  } as unknown as TurnDraft
  const snapshot = structuredClone(input)

  expect(() => confirmTurnDraft(input)).toThrow(error)
  expect(input).toEqual(snapshot)
  expectDraftFrozen(input, false)
})

it('keeps earlier drafts unchanged throughout creation, editing and confirmation', () => {
  const empty = createTurnDraft('player-1')
  const snapshots = [structuredClone(empty)]
  const fixture = createCompleteMutableTurnDraftFixture()
  const moved = updateTurnDraft(empty, { type: 'set_movement', movement: fixture.movement })
  snapshots.push(structuredClone(moved))
  const complete = updateTurnDraft(moved, { type: 'set_location_action', locationAction: fixture.locationAction })
  snapshots.push(structuredClone(complete))
  const managed = updateTurnDraft(complete, { type: 'set_management_action', timing: 'before_location', managementAction: fixture.management.command })
  snapshots.push(structuredClone(managed))
  const drafts = [empty, moved, complete, managed]
  const confirmed = confirmTurnDraft(managed)
  const cleared = updateTurnDraft(managed, { type: 'clear_management_action' })

  expect(drafts).toEqual(snapshots)
  expect(confirmed).toEqual({ type: 'perform_turn', ...managed })
  expect(cleared).toEqual(complete)
  expect(cleared).not.toBe(complete)
  drafts.forEach(draft => expectDraftFrozen(draft, true))
  expectDraftFrozen(confirmed, true)
  expectDraftFrozen(cleared, true)
})
