import {expect, it} from 'vitest'
import {isArrayOf, isBoolean, isIntegerInRange, isObject, isOneOf, isRecord, isUUID} from '../app/utils/validation'
import {isGameListItem, isGamePlayersResponse} from '../app/utils/lobby-validation'

it('общие проверки отклоняют не объекты, неполные и вложенные некорректные данные', () => {
  const validate = isObject({id: isUUID, players: isArrayOf(isObject({isReady: isBoolean}))})
  const valid = {id: '11111111-1111-4111-8111-111111111111', players: [{isReady: false}]}
  expect(validate(valid)).toBe(true)
  expect(validate({...valid, extra: 'ignored'})).toBe(true)
  for (const value of [null, [], 1, 'text', {}, {...valid, id: 'invalid'},
    {...valid, players: [null]}, {...valid, players: [{isReady: 'false'}]}, Object.create(valid)]) {
    expect(validate(value)).toBe(false)
  }
  expect(isRecord([])).toBe(false)
  expect(isOneOf(['A', 'B'])('C')).toBe(false)
  for (const value of [0, 11, 1.5, '3', NaN, Infinity]) expect(isIntegerInRange(1, 10)(value)).toBe(false)
  expect(isIntegerInRange(1, 10)(10)).toBe(true)
})
it('проверки DTO сохраняют границы вместимости, таймера и состава', () => {
  const room = {display_name: 'anna', id: 'room', seat_count: 2, occupiedSeatCount: 2, hasPassword: false, turnDurationMinutes: 10}
  expect(isGameListItem(room)).toBe(true)
  expect(isGameListItem({...room, occupiedSeatCount: 3})).toBe(false)
  expect(isGameListItem({...room, turnDurationMinutes: 11})).toBe(false)
  const roster = {gameId: 'room', seat_count: 4, turnDurationMinutes: 5,
    players: [{display_name: 'boris', user_id: '11111111-1111-4111-8111-111111111111',
      isReady: false, is_bot: false, seat_id: '22222222-2222-4222-8222-222222222222'}]}
  expect(isGamePlayersResponse(roster)).toBe(true)
  expect(isGamePlayersResponse({...roster, players: [{...roster.players[0], isReady: 0}]})).toBe(false)
  expect(isGamePlayersResponse({...roster, seat_count: 1})).toBe(false)
  expect(isGamePlayersResponse({...roster, turnDurationMinutes: 11})).toBe(false)
  const bot = {display_name: 'Бот', user_id: null, isReady: false,
    is_bot: true, seat_id: '33333333-3333-4333-8333-333333333333'}
  expect(isGamePlayersResponse({...roster, players: [...roster.players, bot]})).toBe(true)
  for (const invalid of [{...bot, user_id: roster.players[0]!.user_id},
    {...bot, is_bot: false}, {...bot, display_name: null}, {...bot, seat_id: null},
    {...bot, is_bot: undefined}]) {
    expect(isGamePlayersResponse({...roster, players: [...roster.players, invalid]})).toBe(false)
  }
})
