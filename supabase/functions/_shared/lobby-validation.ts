import {isArrayOf, isBoolean, isIntegerInRange, isObject, isOneOf, isUUID} from './validation.ts'

export const isSeatCount = isOneOf([2, 3, 4])
export const isTurnDurationMinutes = isOneOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
const isGameListItemShape = isObject({
  id: isUUID, seat_count: isSeatCount, occupiedSeatCount: isIntegerInRange(0, 4),
  hasPassword: isBoolean, turnDurationMinutes: isTurnDurationMinutes,
})
export function isGameListItem(value: unknown): value is GameListItem {
  return isGameListItemShape(value) && value.occupiedSeatCount <= value.seat_count
}
export type GameListItem = {id: string; seat_count: number; occupiedSeatCount: number; hasPassword: boolean; turnDurationMinutes: number}
export const isGameList = isArrayOf(isGameListItem)
export const isGameIdRequest = isObject({gameId: isUUID})
export const isReadyRequest = isObject({gameId: isUUID, isReady: isBoolean})
export const isReadyResult = isObject({isReady: isBoolean})
export const isChangeSettingsGameRequest = isObject({
  gameId: isUUID, seatCount: isSeatCount, turnDurationMinutes: isTurnDurationMinutes,
})
export const isSettingsRow = isObject({seat_count: isSeatCount, turn_duration_minutes: isTurnDurationMinutes})
export const isGamePlayersRows = isArrayOf(isObject({user_id: isUUID, is_ready: isBoolean}))
export const isGameRow = isObject({
  id: isUUID, creator_id: isUUID, seat_count: isSeatCount, turn_duration_minutes: isTurnDurationMinutes,
})
export const isGamePlayerRows = isArrayOf(isObject({user_id: isUUID}))
export const isCreateGameResult = isObject({
  code: isOneOf(['SUCCESS', 'OWN_LOBBY_EXISTS', 'GAME_IN_PROGRESS', 'LOBBY_MEMBERSHIP_EXISTS']), gameId: isUUID,
})
export const isJoinGameRefusal = isObject({
  code: isOneOf(['LOBBY_NOT_OPEN', 'OWN_LOBBY_EXISTS', 'GAME_IN_PROGRESS']), gameId: isUUID,
})
