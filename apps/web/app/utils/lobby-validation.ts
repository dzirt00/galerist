import {isArrayOf, isBoolean, isIntegerInRange, isNonEmptyString, isObject, isOneOf, isString} from './validation'
import type {GameListItem} from '../types/lobby'

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
export const isGamePlayersResponse = isObject({
  gameId: isString,
  seat_count: isSeatCount,
  turnDurationMinutes: isTurnDurationMinutes,

  players: isArrayOf(isObject({user_id: isNonEmptyString, isReady: isBoolean, display_name: isNonEmptyString,})),
})
export const isReadyResult = isObject({isReady: isBoolean})
export const isSettingsResult = isObject({seat_count: isSeatCount, turnDurationMinutes: isTurnDurationMinutes})
export const isProfile = isObject({id: isNonEmptyString, created_at: isNonEmptyString, display_name: isNonEmptyString})
