import type {
  ConfirmedTurnCommand,
  PlayerId,
  TimedManagementAction,
  TurnDraft,
  TurnDraftEdit,
} from './types.js'

/** Копирует действие управления вместе с командой и замораживает обе части. */
function copyFrozenManagement(management: TimedManagementAction): TimedManagementAction {
  return Object.freeze({
    timing: management.timing,
    command: Object.freeze({ ...management.command }),
  })
}

/** Создаёт независимую замороженную копию черновика хода. */
function copyFrozenTurnDraft(draft: TurnDraft): TurnDraft {
  return Object.freeze({
    playerId: draft.playerId,
    ...(draft.movement === undefined ? {} : {
      movement: Object.freeze({ ...draft.movement }),
    }),
    ...(draft.locationAction === undefined ? {} : {
      locationAction: Object.freeze({ ...draft.locationAction }),
    }),
    ...(draft.management === undefined ? {} : {
      management: copyFrozenManagement(draft.management),
    }),
  })
}

/** Создаёт пустой замороженный черновик составного хода по ADR-003. */
export function createTurnDraft(playerId: PlayerId): TurnDraft {
  return Object.freeze({ playerId })
}

/** Применяет правку к копии черновика по ADR-003, не меняя исходный черновик. */
export function updateTurnDraft(draft: TurnDraft, edit: TurnDraftEdit): TurnDraft {
  switch (edit.type) {
    case 'set_movement':
      return copyFrozenTurnDraft({ ...draft, movement: edit.movement })
    case 'set_location_action':
      return copyFrozenTurnDraft({ ...draft, locationAction: edit.locationAction })
    case 'set_management_action':
      return copyFrozenTurnDraft({
        ...draft,
        management: {
          timing: edit.timing,
          command: edit.managementAction,
        },
      })
    case 'clear_management_action': {
      const updated = { ...draft }
      delete updated.management
      return copyFrozenTurnDraft(updated)
    }
  }
}

/** Подтверждает обязательные части составного хода по TURN-002. */
export function confirmTurnDraft(draft: TurnDraft): ConfirmedTurnCommand {
  if (!draft.movement) {
    throw new Error('Turn draft requires movement')
  }
  if (!draft.locationAction) {
    throw new Error('Turn draft requires location action')
  }
  return Object.freeze({
    type: 'perform_turn',
    playerId: draft.playerId,
    movement: Object.freeze({ ...draft.movement }),
    locationAction: Object.freeze({ ...draft.locationAction }),
    ...(draft.management === undefined ? {} : {
      management: copyFrozenManagement(draft.management),
    }),
  })
}
