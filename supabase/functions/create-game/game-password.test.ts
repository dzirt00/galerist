import assert from 'node:assert/strict'
import { pbkdf2Sync } from 'node:crypto'
import { hashGamePassword } from './game-password.ts'

const storedFormat = /^pbkdf2-sha256\$600000\$([0-9a-f]{32})\$([0-9a-f]{64})$/

Deno.test('Хеш содержит алгоритм, параметры, соль 16 байт и результат 32 байта', async () => {
  const stored = await hashGamePassword('valid-password')
  assert.match(stored, storedFormat)
  assert.equal(stored.includes('valid-password'), false)
})

Deno.test('Одинаковый пароль получает новую случайную соль при каждом вызове', async () => {
  const first = await hashGamePassword('same-password')
  const second = await hashGamePassword('same-password')
  const firstParts = storedFormat.exec(first)
  const secondParts = storedFormat.exec(second)
  assert.ok(firstParts)
  assert.ok(secondParts)
  assert.notEqual(firstParts[1], secondParts[1])
  assert.notEqual(first, second)
})

Deno.test('Сохранённый хеш проверяется независимым PBKDF2 и сохраняет UTF-8 и пробелы', async () => {
  const password = '  пароль комнаты 🎨  '
  const stored = await hashGamePassword(password)
  const parts = storedFormat.exec(stored)
  assert.ok(parts)
  const salt = Uint8Array.from(parts[1].match(/../g)!, (byte) => Number.parseInt(byte, 16))
  const expected = pbkdf2Sync(password, salt, 600_000, 32, 'sha256').toString('hex')
  assert.equal(parts[2], expected)
  assert.notEqual(parts[2], pbkdf2Sync(password.trim(), salt, 600_000, 32, 'sha256').toString('hex'))
})
