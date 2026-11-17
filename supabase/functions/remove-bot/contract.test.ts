import assert from 'node:assert/strict'
import {
  isRemoveBot,
  isResponseRemoveBot,
  isResponseRemoveBotError,
} from '../_shared/lobby-validation.ts'

const gameId = '22222222-2222-4222-8222-222222222222'
const requestId = '33333333-3333-4333-8333-333333333333'
const seat_id = '44444444-4444-4444-8444-444444444444'

Deno.test('remove-bot request accepts the agreed gameId/requestId/seat_id contract', () => {
  assert.equal(isRemoveBot({gameId, requestId, seat_id}), true)
  for (const value of [null, [], {}, {gameId, requestId},
    {gameId, requestId, seat_id: null}, {gameId, requestId, seat_id: 'bad'},
    {gameId: 'bad', requestId, seat_id}, {gameId, requestId: 'bad', seat_id}]) {
    assert.equal(isRemoveBot(value), false)
  }
})

Deno.test('remove-bot success rejects all results carrying code', () => {
  assert.equal(isResponseRemoveBot({gameId}), true)
  for (const value of [null, [], {}, {gameId: 'bad'},
    {gameId, code: 'LOBBY_NOT_OPEN'}, {gameId, code: 'UNKNOWN'},
    {gameId, code: null}, {gameId, code: ''}, {gameId, code: undefined}]) {
    assert.equal(isResponseRemoveBot(value), false)
  }
})

Deno.test('remove-bot refusal recognizes only LOBBY_NOT_OPEN with a valid gameId', () => {
  assert.equal(isResponseRemoveBotError({gameId, code: 'LOBBY_NOT_OPEN'}), true)
  for (const value of [null, {}, {gameId}, {gameId, code: 'UNKNOWN'},
    {gameId: 'bad', code: 'LOBBY_NOT_OPEN'}]) {
    assert.equal(isResponseRemoveBotError(value), false)
  }
})
