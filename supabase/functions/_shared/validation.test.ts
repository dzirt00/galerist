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
  assert.equal(isGamePlayersRows([{user_id: id, is_ready: false}]), true)
  assert.equal(isGamePlayersRows([{user_id: id, is_ready: 'false'}]), false)
  assert.equal(isGameListItem({id, seat_count: 2, occupiedSeatCount: 3, hasPassword: false, turnDurationMinutes: 3}), false)
})
Deno.test('единый JSON ошибки сохраняет сообщение, метаданные и CORS', async () => {
  const response = jsonError(409, 'У вас уже есть открытое лобби', {code: 'OWN_LOBBY_EXISTS', gameId: id})
  assert.equal(response.status, 409)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
  assert.deepEqual(await response.json(), {error: 'У вас уже есть открытое лобби', code: 'OWN_LOBBY_EXISTS', gameId: id})
})
