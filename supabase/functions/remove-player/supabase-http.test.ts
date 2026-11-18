import assert from 'node:assert/strict'

type Handler = (request: Request) => Response | Promise<Response>
const gameId = '22222222-2222-4222-8222-222222222222'
const userId = '11111111-1111-4111-8111-111111111111'
const requestId = '33333333-3333-4333-8333-333333333333'
const seat_id = '44444444-4444-4444-8444-444444444444'
const otherGame = '55555555-5555-4555-8555-555555555555'
const base = 'http://127.0.0.1:4923/supabase'
const environment = {SUPABASE_URL: base, SUPABASE_ANON_KEY: 'fixture-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key'}

Deno.test('remove-player: real handler and SDK against local Postman simulation', async test => {
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
  const post = (body: unknown = {gameId, requestId, seat_id}, raw = false) => send(endpoint, {method: 'POST',
    headers: {Authorization: 'Bearer fixture-user-token', 'Content-Type': 'application/json'},
    body: raw ? String(body) : JSON.stringify(body)})
  const failure = async (response: Response, status: number) => {
    assert.equal(response.status, status)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    const body = await response.json()
    assert.deepEqual(Object.keys(body), ['error'])
    assert.equal(typeof body.error, 'string')
    assert.ok(body.error.trim())
    assert.doesNotMatch(JSON.stringify(body), /Private|fixture-|password_hash|service-key/)
  }
  try {
    await test.step('Auth identity, exact removal RPC, server key and safe repeat reply', async () => {
      await reset()
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await post({gameId, requestId, seat_id, userId: otherGame, p_user_id: otherGame})
        assert.equal(response.status, 200)
        assert.equal(response.headers.get('access-control-allow-origin'), '*')
        assert.deepEqual(await response.json(), {gameId})
      }
      const calls = (await state()).calls
      assert.equal(calls.length, 4)
      for (let i = 0; i < 4; i += 2) {
        assert.equal(calls[i].path, '/auth/v1/user')
        assert.equal(calls[i].apikey, 'fixture-anon-key')
        assert.equal(calls[i].authorization, 'Bearer fixture-user-token')
        assert.equal(calls[i + 1].path, '/rest/v1/rpc/remove_player')
        assert.equal(calls[i + 1].apikey, 'fixture-service-key')
        assert.equal(calls[i + 1].authorization, 'Bearer fixture-service-key')
        assert.deepEqual(calls[i + 1].body, {p_game_id: gameId, p_user_id: userId, p_request_id: requestId, p_seat_id: seat_id})
      }
    })
    for (const body of [null, [], {}, {gameId}, {requestId}, {gameId, requestId}, {gameId, requestId, seatId: seat_id}, {gameId: 'bad', requestId, seat_id}, {gameId, requestId: null, seat_id}, {gameId, requestId, seat_id: null}, {gameId, requestId, seat_id: 'bad'}]) {
      await test.step('invalid input ' + JSON.stringify(body), async () => {
        await reset()
        await failure(await post(body), 400)
        assert.equal((await state()).calls.length, 1)
      })
    }
    await test.step('malformed JSON', async () => {
      await reset()
      await failure(await post('{', true), 400)
      assert.equal((await state()).calls.length, 1)
    })
    for (const [rpcError, status] of [['22023', 400], ['P0002', 404], ['42501', 403], ['P1002', 409], ['XX000', 500]] as const) {
      await test.step('SQL refusal ' + rpcError, async () => {
        await reset({rpcError})
        await failure(await post(), status)
      })
    }
    await test.step('closed lobby', async () => {
      await reset({rpcResult: {code: 'LOBBY_NOT_OPEN', gameId}})
      await failure(await post(), 409)
    })
    for (const rpcResult of [null, [], {}, false, 4, 'exit', {gameId: 'bad'}, {gameId: otherGame},
      {code: 'UNKNOWN', gameId}, {code: null, gameId}, {code: '', gameId},
      {code: 'LOBBY_NOT_OPEN', gameId: otherGame}]) {
      await test.step('invalid or foreign result ' + JSON.stringify(rpcResult), async () => {
        await reset({rpcResult})
        await failure(await post(), 500)
      })
    }
    await test.step('extra private fields are stripped', async () => {
      await reset({rpcResult: {gameId, password_hash: 'Private', players: ['Private']}})
      const response = await post()
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), {gameId})
    })
    await test.step('preflight, methods and missing bearer skip dependencies', async () => {
      await reset()
      const response = await send(endpoint, {method: 'OPTIONS'})
      assert.equal(response.status, 204)
      await response.text()
      await failure(await send(endpoint), 405)
      await failure(await send(endpoint, {method: 'POST'}), 401)
      assert.deepEqual((await state()).calls, [])
    })
    for (const authStatus of [401, 403, 503]) {
      await test.step('Auth refusal ' + authStatus, async () => {
        await reset({authStatus})
        await failure(await post(), authStatus === 503 ? 503 : 401)
        assert.equal((await state()).calls.length, 1)
      })
    }
    for (const key of Object.keys(environment)) {
      await test.step('missing setting ' + key, async () => {
        await reset()
        Deno.env.delete(key)
        await failure(await post(), 500)
        assert.ok((await state()).calls.every((call: {path: string}) => call.path === '/auth/v1/user'))
      })
    }
    await test.step('unreachable Auth and recovery', async () => {
      await reset()
      const listener = Deno.listen({hostname: '127.0.0.1', port: 0})
      const port = listener.addr.port
      listener.close()
      Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:' + port)
      await failure(await post(), 503)
      await reset()
      const response = await post()
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), {gameId})
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
