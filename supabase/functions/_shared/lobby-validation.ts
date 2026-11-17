import {
  isArrayOf,
  isBoolean,
  isIntegerInRange,
  isNonEmptyString, isNonEmptyStringOrNull,
  isObject,
  isOneOf,
  isUUID,
  isUUIDorNull
} from './validation.ts'

interface GetGamePlayers {
  user_id: string | null,
  is_ready: boolean,
  seat_count: number,
  turn_duration_minutes: number,
  display_name: string | null,
  is_bot: boolean,
  seat_id: string,
  creator_id: string
}

interface DeleteUser {
  gameId: string
}
export const isSeatCount = isOneOf([2, 3, 4])
export const isTurnDurationMinutes = isOneOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
const isGameListItemShape = isObject({
  id: isUUID, seat_count: isSeatCount, occupiedSeatCount: isIntegerInRange(0, 4),
  hasPassword: isBoolean, turnDurationMinutes: isTurnDurationMinutes, display_name: isNonEmptyString
})

export function isGameListItem(value: unknown): value is GameListItem {
  return isGameListItemShape(value) && value.occupiedSeatCount <= value.seat_count
}

export type GameListItem = {
  id: string;
  seat_count: number;
  occupiedSeatCount: number;
  hasPassword: boolean;
  turnDurationMinutes: number
  display_name: string
}
export type ResponseAddBotError = {
  code: 'LOBBY_NOT_OPEN';
  gameId: string;
}
export const isGameList = isArrayOf(isGameListItem)
export const isGameIdRequest = isObject({gameId: isUUID})
export const isReadyRequest = isObject({gameId: isUUID, isReady: isBoolean})
export const isReadyResult = isObject({isReady: isBoolean})
export const isChangeSettingsGameRequest = isObject({
  gameId: isUUID, seatCount: isSeatCount, turnDurationMinutes: isTurnDurationMinutes,
})
export const isResponseAddBot = isObject({gameId: isUUID, seat_id: isUUID})
export const isResponseRemoveBotShare = isObject({gameId: isUUID})
const isResponseAddBotErrorShare = isObject({code: isNonEmptyString, gameId: isUUID})
const isResponseDeleteUserShare = isObject({gameId: isUUID})

export function isResponseDeleteUser(value: unknown): value is DeleteUser {
  return isResponseDeleteUserShare(value) && !('code' in value)
}
export function isResponseAddBotError(value: unknown): value is ResponseAddBotError {
  return isResponseAddBotErrorShare(value) && value.code === 'LOBBY_NOT_OPEN'
}

export function isResponseRemoveBotError(value: unknown): value is ResponseAddBotError {
  return isResponseAddBotErrorShare(value) && value.code === 'LOBBY_NOT_OPEN'
}

export function isResponseRemoveBot(value: unknown): value is DeleteUser {
  return isResponseRemoveBotShare(value) && !('code' in value)
}

export const isAddBot = isObject({gameId: isUUID, requestId: isUUID})
export const isRemoveBot = isObject({gameId: isUUID, requestId: isUUID, seat_id: isUUID,})
export const isLeaveGame = isObject({gameId: isUUID, requestId: isUUID})
export const isSettingsRow = isObject({seat_count: isSeatCount, turn_duration_minutes: isTurnDurationMinutes})
const isGamePlayersRowsShape =
  isArrayOf(isObject({
    user_id: isUUIDorNull,
    is_ready: isBoolean,
    display_name: isNonEmptyStringOrNull,
    seat_count: isSeatCount,
    turn_duration_minutes: isTurnDurationMinutes,
    is_bot: isBoolean,
    seat_id: isUUID,
    creator_id: isUUID,
  }))

export function isGamePlayersRows(value: unknown): value is GetGamePlayers[] {
  return isGamePlayersRowsShape(value) &&
    value.length > 0 &&
    value.every(item => item.seat_count === value[0].seat_count && item.turn_duration_minutes === value[0].turn_duration_minutes && item.creator_id === value[0].creator_id) &&
    value.every(el => (el.is_bot && el.user_id === null && el.display_name === null) || (!el.is_bot && el.user_id !== null && el.display_name !== null))
}

export const isGameRow = isObject({
  id: isUUID,
  creator_id: isUUID,
  seat_count: isSeatCount,
  turn_duration_minutes: isTurnDurationMinutes,
})
export const isGamePlayerRows = isArrayOf(isObject({user_id: isUUID}))
export const isCreateGameResult = isObject({
  code: isOneOf(['SUCCESS', 'OWN_LOBBY_EXISTS', 'GAME_IN_PROGRESS', 'LOBBY_MEMBERSHIP_EXISTS']), gameId: isUUID,
})
export const isJoinGameRefusal = isObject({
  code: isOneOf(['LOBBY_NOT_OPEN', 'OWN_LOBBY_EXISTS', 'GAME_IN_PROGRESS']), gameId: isUUID,
})
export const isDisplayName = isObject({display_name: isNonEmptyString})
