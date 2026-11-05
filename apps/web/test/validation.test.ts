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
  const room = {id: 'room', seat_count: 2, occupiedSeatCount: 2, hasPassword: false, turnDurationMinutes: 10}
  expect(isGameListItem(room)).toBe(true)
  expect(isGameListItem({...room, occupiedSeatCount: 3})).toBe(false)
  expect(isGameListItem({...room, turnDurationMinutes: 11})).toBe(false)
  expect(isGamePlayersResponse({gameId: 'room', players: [{user_id: 'user', isReady: false}]})).toBe(true)
  expect(isGamePlayersResponse({gameId: 'room', players: [{user_id: 'user', isReady: 0}]})).toBe(false)
})
