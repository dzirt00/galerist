import assert from 'node:assert/strict'
import {pbkdf2Sync} from 'node:crypto'
import {verifyGamePassword} from './game-password.ts'

type Handler = (request: Request) => Response | Promise<Response>
const base = 'http://127.0.0.1:4918/supabase'
const gameId = '22222222-2222-4222-8222-222222222222'
const userId = '11111111-1111-4111-8111-111111111111'
const password = '  пароль 🎨  '
const salt = Buffer.alloc(16, 7)
const hash = 'pbkdf2-sha256$600000$' + salt.toString('hex') + '$'
  + pbkdf2Sync(password, salt, 600000, 32, 'sha256').toString('hex')
const room = {id: gameId, seat_count: 3, occupiedSeatCount: 1, hasPassword: false, turnDurationMinutes: 3}
const environment = {SUPABASE_URL: base, SUPABASE_ANON_KEY: 'fixture-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key'}

Deno.test('verifyGamePassword: независимый PBKDF2, UTF-8, пробелы и неверный формат', async () => {
  assert.equal(await verifyGamePassword(password, hash), true)
  assert.equal(await verifyGamePassword(password.trim(), hash), false)
  assert.equal(await verifyGamePassword('wrong', hash), false)
  await assert.rejects(() => verifyGamePassword(password, 'invalid-hash'))
})

Deno.test('join-game: настоящий HTTP и SDK против локальной Postman simulation', async (test) => {
  const saved = Object.fromEntries(Object.keys(environment).map((key) => [key, Deno.env.get(key)]))
  let handler: Handler | undefined
  const original = Deno.serve
  Deno.serve = ((value: Handler) => { handler = value }) as unknown as typeof Deno.serve
  try { await import('./index.ts') } finally { Deno.serve = original }
  assert.ok(handler)
  const server = Deno.serve({hostname: '127.0.0.1', port: 0, onListen() {}}, handler)
  const endpoint = 'http://127.0.0.1:' + server.addr.port
  const client = Deno.createHttpClient({poolIdleTimeout: 0})
  const send = (url: string, init?: RequestInit) => fetch(url, {...init, client})
  const reset = async (options: Record<string, unknown> = {}) => {
    for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value)
    const response = await send(base + '/__test/reset', {method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({games: [room], passwordHash: hash, ...options})})
    assert.equal(response.status, 200)
    await response.json()
  }
  const state = async () => {
    const response = await send(base + '/__test/state')
    return response.json()
  }
  const post = (body: unknown = {gameId}, raw = false) => send(endpoint, {method: 'POST',
    headers: {Authorization: 'Bearer fixture-user-token', 'Content-Type': 'application/json'},
    body: raw ? String(body) : JSON.stringify(body)})
  const failure = async (response: Response, status: number) => {
    assert.equal(response.status, status)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    const body = await response.json()
    assert.deepEqual(Object.keys(body), ['error'])
    assert.equal(typeof body.error, 'string')
    assert.doesNotMatch(JSON.stringify(body), /Private|fixture-|password_hash|pbkdf2/)
  }
  try {
    await test.step('Выбранная комната, Auth user вместо подставленного ID, безопасный ответ и повтор', async () => {
      await reset({games: [room, {...room, id: '33333333-3333-4333-8333-333333333333'}]})
      const response = await post({gameId, userId: 'untrusted'})
      assert.equal(response.status, 200)
      const first = await response.json()
      assert.deepEqual(first, {...room, occupiedSeatCount: 2})
      const calls = (await state()).calls
      assert.deepEqual(calls.map((call: {path: string}) => call.path), ['/auth/v1/user', '/rest/v1/rpc/join_game'])
      assert.equal(calls[0].apikey, 'fixture-anon-key')
      assert.equal(calls[1].apikey, 'fixture-service-key')
      assert.equal(calls[1].authorization, 'Bearer fixture-service-key')
      assert.deepEqual(calls[1].body, {p_game_id: gameId, p_user_id: userId, p_verified_password_hash: null})
      const repeated = await post()
      assert.deepEqual(await repeated.json(), first)
    })
    await test.step('Пароль UTF-8 с пробелами: хеш сверяется, plaintext не отправляется в БД', async () => {
      await reset({games: [{...room, hasPassword: true, turnDurationMinutes: 3}]})
      const response = await post({gameId, password})
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), {...room, hasPassword: true, turnDurationMinutes: 3, occupiedSeatCount: 2})
      const calls = (await state()).calls
      assert.deepEqual(calls[1].query, {select: 'password_hash', game_id: 'eq.' + gameId})
      assert.equal(calls[2].body.p_verified_password_hash, hash)
      assert.equal(JSON.stringify(calls).includes(password), false)
      const repeated = await post()
      assert.equal(repeated.status, 200)
      assert.equal((await repeated.json()).occupiedSeatCount, 2)
    })
    for (const supplied of [undefined, '', 'wrong', password.trim()]) {
      await test.step('Неверный/отсутствующий пароль ' + JSON.stringify(supplied), async () => {
        await reset({games: [{...room, hasPassword: true, turnDurationMinutes: 3}]})
        await failure(await post({gameId, ...(supplied !== undefined && {password: supplied})}), 403)
        assert.equal((await state()).options.games[0].occupiedSeatCount, 1)
      })
    }
    for (const [code, status] of [['P0002', 404], ['P1001', 403], ['P1002', 409], ['42501', 500]] as const) {
      await test.step('RPC ' + code + ' → ' + status, async () => {
        await reset({rpcError: code})
        await failure(await post(), status)
      })
    }
    for (const authStatus of [400, 401, 403, 503]) {
      await test.step('Отказ Auth ' + authStatus + ' без RPC', async () => {
        await reset({authStatus})
        await failure(await post(), authStatus === 503 ? 503 : 401)
        assert.ok((await state()).calls.every((call: {path: string}) => call.path === '/auth/v1/user'))
      })
    }
    for (const payload of [null, [], {}, {gameId: 'wrong'}, {gameId, password: 12}]) {
      await test.step('Неверный payload ' + JSON.stringify(payload), async () => {
        await reset()
        await failure(await post(payload), 400)
        assert.equal((await state()).calls.length, 1)
      })
    }
    await test.step('Неверный JSON: 400', async () => {
      await reset()
      await failure(await post('{', true), 400)
    })
    for (const method of ['GET', 'PUT', 'DELETE']) {
      await test.step('Метод ' + method + ': 405', async () => {
        await reset()
        const response = await send(endpoint, {method})
        assert.equal(response.headers.get('Allow'), 'POST, OPTIONS')
        await failure(response, 405)
        assert.deepEqual((await state()).calls, [])
      })
    }
    await test.step('OPTIONS и неверный Bearer не вызывают зависимости', async () => {
      await reset()
      const preflight = await send(endpoint, {method: 'OPTIONS'})
      assert.equal(preflight.status, 204)
      await preflight.text()
      for (const value of ['', 'Basic invalid', 'Bearer ']) {
        await failure(await send(endpoint, {method: 'POST', headers: {Authorization: value}}), 401)
      }
      assert.deepEqual((await state()).calls, [])
    })
    await test.step('Ошибка чтения хеша и неверный формат: 500 без RPC', async () => {
      for (const options of [{readError: 'game_passwords'}, {passwordHash: 'invalid'}]) {
        await reset({games: [{...room, hasPassword: true, turnDurationMinutes: 3}], ...options})
        await failure(await post({gameId, password}), 500)
        assert.equal((await state()).calls.length, 2)
      }
    })
    for (const rpcResult of [null,
      ...[undefined, null, '3', 0, 11, 2.5].map((minutes) => ({...room, turnDurationMinutes: minutes})), {...room, id: 'other'}, {...room, occupiedSeatCount: 4}]) {
      await test.step('Неверный DTO: 500', async () => {
        await reset({rpcResult})
        await failure(await post(), 500)
      })
    }
    await test.step('Лишние приватные поля RPC удаляются из ответа', async () => {
      await reset({rpcResult: {...room, password_hash: 'private'}})
      assert.deepEqual(await (await post()).json(), room)
    })
    for (const key of Object.keys(environment)) {
      await test.step('Отсутствует ' + key, async () => {
        await reset()
        Deno.env.delete(key)
        await failure(await post(), 500)
        assert.deepEqual((await state()).calls, [])
      })
    }
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
    client.close()
    await server.shutdown()
  }
})