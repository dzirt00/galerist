import { deepFreeze } from './component-catalog.js'
import type { GamePhase, GameState, PlayerId } from './types.js'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(message: string): never {
  throw new Error(`Invalid game state: ${message}`)
}

function requireRecord(value: unknown, name: string): UnknownRecord {
  if (!isRecord(value)) {
    return fail(`${name} must be an object`)
  }
  return value
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(`${name} must be a non-empty string`)
  }
  return value
}

function requireSafeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value)) {
    return fail(`${name} must be a safe integer`)
  }
  return value as number
}

function requirePlayerReference(
  value: unknown,
  playerIds: ReadonlySet<PlayerId>,
  name: string,
): PlayerId {
  const playerId = requireNonEmptyString(value, name)
  if (!playerIds.has(playerId)) {
    return fail(`${name} must reference a player in the game`)
  }
  return playerId
}

function validateCommonCollections(state: UnknownRecord): void {
  const objectFields = [
    'orderMarket',
    'ticketOffice',
    'promotionSupply',
    'artistMarket',
    'artistSetup',
    'visitorBag',
    'internationalMarket',
    'artworkMarket',
    'masterpieceAuction',
    'privateGoals',
    'setupVersions',
  ] as const
  const arrayFields = ['playerBoards', 'plazaVisitors', 'vestibuleVisitors'] as const

  objectFields.forEach(field => requireRecord(state[field], field))
  arrayFields.forEach(field => {
    if (!Array.isArray(state[field])) {
      fail(`${field} must be an array`)
    }
  })

  const setupVersions = requireRecord(state.setupVersions, 'setupVersions')
  requireNonEmptyString(setupVersions.rulesVersion, 'setupVersions.rulesVersion')
  requireNonEmptyString(setupVersions.componentsVersion, 'setupVersions.componentsVersion')
  requireNonEmptyString(
    setupVersions.setupAlgorithmVersion,
    'setupVersions.setupAlgorithmVersion',
  )
}

function validatePlayers(state: UnknownRecord): ReadonlySet<PlayerId> {
  if (!Array.isArray(state.players)) {
    return fail('players must be an array')
  }

  const playerIds = new Set<PlayerId>()
  for (const [index, value] of state.players.entries()) {
    const player = requireRecord(value, `players[${index}]`)
    const playerId = requireNonEmptyString(player.id, `players[${index}].id`)
    requireNonEmptyString(player.name, `players[${index}].name`)
    if (player.kind !== 'human' && player.kind !== 'bot') {
      fail(`players[${index}].kind must be human or bot`)
    }
    const coins = requireSafeInteger(player.coins, `players[${index}].coins`)
    const influence = requireSafeInteger(player.influence, `players[${index}].influence`)
    if (coins < 0) {
      fail(`players[${index}].coins must be non-negative`)
    }
    if (influence < 0 || influence > 35) {
      fail(`players[${index}].influence must be from 0 to 35`)
    }
    if (playerIds.has(playerId)) {
      fail('players must have unique IDs')
    }
    playerIds.add(playerId)
  }

  return playerIds
}

function validatePhase(
  state: UnknownRecord,
  playerIds: ReadonlySet<PlayerId>,
): void {
  const phases: readonly GamePhase[] = [
    'setup',
    'regular_play',
    'ending_current_round',
    'final_round',
    'final_scoring',
    'finished',
  ]
  if (!phases.includes(state.phase as GamePhase)) {
    fail('phase is unknown')
  }

  const round = requireSafeInteger(state.round, 'round')
  if (state.phase === 'setup') {
    if (state.status !== 'setup' || round !== 0 || state.activePlayerId !== null) {
      fail('setup phase must have setup status, round 0, and no active player')
    }
    if (
      state.setupStage !== 'choosing_starting_locations'
      && state.setupStage !== 'complete'
    ) {
      fail('setupStage is invalid')
    }
    if (!Array.isArray(state.startingLocationSelectionOrder)) {
      fail('startingLocationSelectionOrder must be an array')
    }
    if (state.startingLocationSelectionOrder.length !== playerIds.size) {
      fail('startingLocationSelectionOrder must contain every player')
    }
    const selectionIds = new Set<unknown>(state.startingLocationSelectionOrder)
    if (selectionIds.size !== state.startingLocationSelectionOrder.length) {
      fail('startingLocationSelectionOrder must contain unique players')
    }
    state.startingLocationSelectionOrder.forEach((playerId, index) => {
      requirePlayerReference(playerId, playerIds, `startingLocationSelectionOrder[${index}]`)
    })
    if (state.currentStartingLocationPlayerId !== null) {
      requirePlayerReference(
        state.currentStartingLocationPlayerId,
        playerIds,
        'currentStartingLocationPlayerId',
      )
    }
    if (
      state.setupStage === 'choosing_starting_locations'
      && state.currentStartingLocationPlayerId === null
    ) {
      fail('choosing_starting_locations must have a current player')
    }
    if (state.setupStage === 'complete' && state.currentStartingLocationPlayerId !== null) {
      fail('complete setup must not have a current player')
    }
    if (!Array.isArray(state.availableStartingLocationIds)) {
      fail('availableStartingLocationIds must be an array')
    }
    return
  }

  if (round < 1) {
    fail('non-setup phases must have a positive round')
  }
  requirePlayerReference(state.firstPlayerId, playerIds, 'firstPlayerId')

  if (state.phase === 'finished') {
    if (state.status !== 'finished' || state.activePlayerId !== null) {
      fail('finished phase must have finished status and no active player')
    }
    requireSafeInteger(state.endTriggeredRound, 'endTriggeredRound')
    return
  }
  if (state.status !== 'in_progress') {
    fail('active game phases must have in_progress status')
  }
  if (state.phase === 'final_scoring') {
    if (state.activePlayerId !== null) {
      fail('final_scoring must not have an active player')
    }
    requireSafeInteger(state.endTriggeredRound, 'endTriggeredRound')
    return
  }
  requirePlayerReference(state.activePlayerId, playerIds, 'activePlayerId')
  if (state.phase === 'ending_current_round' || state.phase === 'final_round') {
    requireSafeInteger(state.endTriggeredRound, 'endTriggeredRound')
  }
}

/** Проверяет восстановленный JSON-снимок, копирует его и возвращает замороженный GameState. */
export function restoreGameState(input: unknown): GameState {
  const state = requireRecord(input, 'state')
  if (state.stateSchemaVersion !== 2) {
    fail('stateSchemaVersion must equal 2')
  }
  requireNonEmptyString(state.id, 'id')

  const config = requireRecord(state.config, 'config')
  if (config.playerCount !== 2 && config.playerCount !== 3 && config.playerCount !== 4) {
    fail('config.playerCount must be 2, 3, or 4')
  }
  requireSafeInteger(config.seed, 'config.seed')

  const playerIds = validatePlayers(state)
  if (playerIds.size !== config.playerCount) {
    fail('players length must match config.playerCount')
  }
  validateCommonCollections(state)
  validatePhase(state, playerIds)

  return deepFreeze(structuredClone(state)) as unknown as GameState
}
