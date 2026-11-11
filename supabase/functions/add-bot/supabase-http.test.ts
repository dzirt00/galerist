import assert from 'node:assert/strict'

type Handler = (request: Request) => Response | Promise<Response>
const base = 'http://127.0.0.1:4921/supabase'
const gameId = '22222222-2222-4222-8222-222222222222'
const userId = '11111111-1111-4111-8111-111111111111'
const requestId = '33333333-3333-4333-8333-333333333333'
const seatId = '44444444-4444-4444-8444-444444444444'
const otherGame = '55555555-5555-4555-8555-555555555555'
const environment = {SUPABASE_URL: base, SUPABASE_ANON_KEY: 'fixture-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key'}

Deno.test('add-bot: real HTTP and SDK against local Postman simulation', async (test) => {
  const saved = Object.fromEntries(Object.keys(environment).map(key => [key, Deno.env.get(key)]))
  let handler: Handler | undefined
  const originalServe = Deno.serve
  Deno.serve = ((value: Handler) => { handler = value }) as unknown as typeof Deno.serve
  try { await import('./index.ts') } finally { Deno.serve = originalServe }
  assert.ok(handler)
  const server = Deno.serve({hostname: '127.0.0.1', port: 0, onListen() {}}, handler)
  const client = Deno.createHttpClient({poolIdleTimeout: 0})
  const endpoint = 'http://127.0.0.1:' + server.addr.port
  const send = (url: string, init?: RequestInit) => fetch(url, {...init, client})
  const reset = async (options: Record<string, unknown> = {}) => {
    for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value)
    const response = await send(base + '/__test/reset', {method: 'POST',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify(options)})
    assert.equal(response.status, 200)
    await response.json()
  }
  const state = async () => {
    const response = await send(base + '/__test/state')
    assert.equal(response.status, 200)
    return response.json()
  }
  const post = (body: unknown = {gameId, requestId}, raw = false) => send(endpoint, {
    method: 'POST', headers: {Authorization: 'Bearer fixture-user-token', 'Content-Type': 'application/json'},
    body: raw ? String(body) : JSON.stringify(body),
  })
  const failure = async (response: Response, status: number, error?: string) => {
    assert.equal(response.status, status)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    const body = await response.json()
    assert.deepEqual(Object.keys(body), ['error'])
    assert.equal(typeof body.error, 'string')
    assert.ok(body.error.trim())
    if (error) assert.equal(body.error, error)
    assert.doesNotMatch(JSON.stringify(body), /Private|fixture-|password_hash|service-key/)
  }
  try {
    await test.step('Auth owns identity, exact RPC payload and separate server key; seat differs from request ID', async () => {
      await reset()
      const response = await post({gameId, requestId, userId: otherGame, p_user_id: otherGame, seat_id: otherGame})
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('access-control-allow-origin'), '*')
      assert.deepEqual(await response.json(), {gameId, seat_id: seatId})
      const snapshot = await state()
      assert.equal(snapshot.calls.length, 2)
      const [auth, rpc] = snapshot.calls
      assert.equal(auth.method, 'GET')
      assert.equal(auth.path, '/auth/v1/user')
      assert.equal(auth.apikey, 'fixture-anon-key')
      assert.equal(auth.authorization, 'Bearer fixture-user-token')
      assert.equal(rpc.method, 'POST')
      assert.equal(rpc.path, '/rest/v1/rpc/add_bot')
      assert.equal(rpc.apikey, 'fixture-service-key')
      assert.equal(rpc.authorization, 'Bearer fixture-service-key')
      assert.deepEqual(rpc.body, {p_game_id: gameId, p_user_id: userId, p_request_id: requestId})
    })
    await test.step('repeated HTTP requests preserve requestId and return saved reply', async () => {
      await reset({rpcResult: {gameId, seat_id: seatId}})
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await post()
        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), {gameId, seat_id: seatId})
      }
      const calls = (await state()).calls.filter((call: {path: string}) => call.path.endsWith('/add_bot'))
      assert.equal(calls.length, 2)
      assert.deepEqual(calls[0].body, calls[1].body)
    })
    for (const body of [null, [], 'bot', {}, {gameId}, {requestId},
      ...[null, true, 4, '', 'wrong'].map(gameId => ({gameId, requestId})),
      ...[null, true, 4, '', 'wrong'].map(requestId => ({gameId, requestId}))]) {
      await test.step('invalid payload ' + JSON.stringify(body), async () => {
        await reset()
        await failure(await post(body), 400)
        assert.deepEqual((await state()).calls.map((call: {path: string}) => call.path), ['/auth/v1/user'])
      })
    }
    await test.step('malformed JSON skips RPC', async () => {
      await reset()
      await failure(await post('{', true), 400)
      assert.equal((await state()).calls.length, 1)
    })
    for (const [code, status, message] of [
      ['22023', 400, 'Некорректные параметры добавления бота'],
      ['P0002', 404, 'Комната не найдена'],
      ['42501', 403, 'Добавлять ботов может только создатель — участник комнаты'],
      ['P1002', 409, 'Свободных мест нет'],
      ['XX000', 500, undefined],
    ] as const) {
      await test.step('SQL error ' + code, async () => {
        await reset({rpcError: code})
        await failure(await post(), status, message)
      })
    }
    await test.step('expected LOBBY_NOT_OPEN is a 409, with diagnostics stripped', async () => {
      await reset({rpcResult: {code: 'LOBBY_NOT_OPEN', gameId, diagnostic: 'Private SQL detail'}})
      await failure(await post(), 409, 'Добавить бота можно только в открытое лобби')
    })
    for (const rpcResult of [null, [], {}, false, 4, 'bot',
      {gameId}, {seat_id: seatId}, {gameId, seat_id: null}, {gameId, seat_id: 'wrong'},
      {gameId: otherGame, seat_id: seatId},
      {code: 'LOBBY_NOT_OPEN', gameId: otherGame},
      {code: 'LOBBY_NOT_OPEN', gameId: 'wrong'},
      {code: 'UNKNOWN', gameId}]) {
      await test.step('invalid or foreign RPC result ' + JSON.stringify(rpcResult), async () => {
        await reset({rpcResult})
        await failure(await post(), 500)
      })
    }
    await test.step('successful reply exposes only gameId and seat_id', async () => {
      await reset({rpcResult: {gameId, seat_id: seatId, password_hash: 'Private', result: 'Private'}})
      const response = await post()
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), {gameId, seat_id: seatId})
    })
    await test.step('preflight, unsupported methods and missing bearer skip dependencies', async () => {
      await reset()
      const options = await send(endpoint, {method: 'OPTIONS'})
      assert.equal(options.status, 204)
      assert.equal(options.headers.get('access-control-allow-origin'), '*')
      await options.text()
      for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
        const response = await send(endpoint, {method})
        assert.equal(response.headers.get('allow'), 'POST, OPTIONS')
        await failure(response, 405)
      }
      for (const authorization of ['', 'Basic token', 'Bearer', 'Bearer ']) {
        await failure(await send(endpoint, {method: 'POST', headers: {Authorization: authorization}}), 401)
      }
      assert.deepEqual((await state()).calls, [])
    })
    for (const authStatus of [401, 403, 503]) {
      await test.step('Auth refusal ' + authStatus + ' skips RPC', async () => {
        await reset({authStatus})
        await failure(await post(), authStatus === 503 ? 503 : 401)
        assert.equal((await state()).calls.length, 1)
      })
    }
    for (const key of Object.keys(environment)) {
      await test.step('missing setting ' + key + ' skips RPC', async () => {
        await reset()
        Deno.env.delete(key)
        await failure(await post(), 500)
        assert.ok((await state()).calls.every((call: {path: string}) => call.path === '/auth/v1/user'))
      })
    }
    await test.step('unreachable Auth is a safe 503, restored dependency allows retry', async () => {
      await reset()
      const listener = Deno.listen({hostname: '127.0.0.1', port: 0})
      const port = listener.addr.port
      listener.close()
      Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:' + port)
      await failure(await post(), 503)
      await reset()
      const response = await post()
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), {gameId, seat_id: seatId})
    })
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
    client.close()
    await server.shutdown()
  }
})
