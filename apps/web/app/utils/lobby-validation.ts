import {
  isArrayOf,
  isBoolean,
  isIntegerInRange,
  isNonEmptyString,
  isObject,
  isOneOf,
  isString,
  isUUID, isUUIDorNull
} from './validation'
import type {GameListItem} from '../types/lobby'
import type {GamePlayer} from '~/GameLobby.vue'

export interface isGamePlayersResponse {
  players: GamePlayer[],
  gameId: string,
  seat_count: number,
  turnDurationMinutes: number,
  creator_id: string
}
export const isSeatCount = isOneOf([2, 3, 4])
export const isTurnDurationMinutes = isOneOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
const isGameListItemShape = isObject({
  id: isNonEmptyString, seat_count: isSeatCount, occupiedSeatCount: isIntegerInRange(0, 4),
  hasPassword: isBoolean, turnDurationMinutes: isTurnDurationMinutes, display_name: isNonEmptyString
})

export function isGameListItem(value: unknown): value is GameListItem {
  return isGameListItemShape(value) && value.occupiedSeatCount <= value.seat_count
}

export const isGameList = isArrayOf(isGameListItem)

export const isResponseCreateGame = isObject({
  id: isString, creator_id: isString, seat_count: isSeatCount, hasPassword: isBoolean,
  occupiedSeats: isArrayOf(isObject({user_id: isString})),
  turnDurationMinutes: isTurnDurationMinutes,
  display_name: isNonEmptyString
})

const isGamePlayersResponseShape = isObject({
  gameId: isString,
  creator_id: isUUID,
  seat_count: isSeatCount,
  turnDurationMinutes: isTurnDurationMinutes,
  players: isArrayOf(isObject({
    user_id: isUUIDorNull,
    isReady: isBoolean,
    display_name: isNonEmptyString,
    seat_id: isUUID,
    is_bot: isBoolean,
  })),
})

export function isGamePlayersResponse(value: unknown): value is isGamePlayersResponse {
  return isGamePlayersResponseShape(value) &&
    value.players.every(el => (el.is_bot && el.user_id === null) || (!el.is_bot && el.user_id !== null))
}

export const isReadyResult = isObject({isReady: isBoolean})
export const isSettingsResult = isObject({seat_count: isSeatCount, turnDurationMinutes: isTurnDurationMinutes})
export const isAddBot = isObject({
  gameId: isUUID,
  seat_id: isUUID,
})
export const isProfile = isObject({id: isNonEmptyString, created_at: isNonEmptyString, display_name: isNonEmptyString})
