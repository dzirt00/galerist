import assert from 'node:assert/strict'
import {isArrayOf, isBoolean, isIntegerInRange, isObject, isOneOf, isUUID} from './validation.ts'
import {isCreateGameResult, isGameListItem, isGamePlayersRows, isJoinGameRefusal} from './lobby-validation.ts'
import {jsonError} from './http.ts'

const id = '11111111-1111-4111-8111-111111111111'
Deno.test('общая Edge-валидация: вложенные DTO, обязательные поля и границы', () => {
  const validate = isObject({id: isUUID, flags: isArrayOf(isBoolean)})
  assert.equal(validate({id, flags: [false], extra: 'allowed'}), true)
  for (const value of [null, [], {}, {id, flags: ['false']}, {id: 'invalid', flags: []},
    Object.create({id, flags: []})]) assert.equal(validate(value), false)
  for (const value of ['3', 0, 11, 1.5, NaN, Infinity]) assert.equal(isIntegerInRange(1, 10)(value), false)
  assert.equal(isOneOf(['A', 'B'])('C'), false)
  assert.equal(isCreateGameResult({code: 'SUCCESS', gameId: id}), true)
  assert.equal(isCreateGameResult({code: 'LOBBY_NOT_OPEN', gameId: id}), false)
  assert.equal(isJoinGameRefusal({code: 'OWN_LOBBY_EXISTS', gameId: id}), true)
  assert.equal(isJoinGameRefusal({code: 'UNKNOWN', gameId: id}), false)
  const row = {creator_id: id, user_id: id, is_ready: false, display_name: 'anna', seat_count: 3,
    turn_duration_minutes: 3, is_bot: false, seat_id: id}
  assert.equal(isGamePlayersRows([row]), true)
  for (const value of [[], [row, {...row, seat_count: 4}], [row, {...row, turn_duration_minutes: 5}],
    [{...row, is_ready: 'false'}], [{...row, seat_count: 1}], [{...row, turn_duration_minutes: 11}],
    [{...row, turn_duration_minutes: undefined}], [{...row, creator_id: undefined}],
    [{...row, creator_id: null}], [{...row, creator_id: 'wrong'}],
    [row, {...row, creator_id: '22222222-2222-4222-8222-222222222222'}]]) assert.equal(isGamePlayersRows(value), false)
  assert.equal(isGamePlayersRows([row, {...row, user_id: '22222222-2222-4222-8222-222222222222',
    seat_id: '22222222-2222-4222-8222-222222222222'}]), true)
  const bot = {...row, user_id: null, display_name: null, is_bot: true,
    seat_id: '33333333-3333-4333-8333-333333333333'}
  assert.equal(isGamePlayersRows([row, bot]), true)
  for (const invalid of [{...bot, user_id: id}, {...bot, display_name: 'bot'},
    {...row, display_name: null}, {...row, user_id: null}, {...bot, seat_id: null},
    {...bot, is_bot: undefined}]) assert.equal(isGamePlayersRows([row, invalid]), false)
  assert.equal(isGameListItem({id, seat_count: 2, occupiedSeatCount: 3, hasPassword: false, turnDurationMinutes: 3, display_name: 'anna'}), false)
})
Deno.test('единый JSON ошибки сохраняет сообщение, метаданные и CORS', async () => {
  const response = jsonError(409, 'У вас уже есть открытое лобби', {code: 'OWN_LOBBY_EXISTS', gameId: id})
  assert.equal(response.status, 409)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
  assert.deepEqual(await response.json(), {error: 'У вас уже есть открытое лобби', code: 'OWN_LOBBY_EXISTS', gameId: id})
})
