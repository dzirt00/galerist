import assert from 'node:assert/strict'

type Handler = (request: Request) => Response | Promise<Response>
const base = 'http://127.0.0.1:4919/supabase'
const gameId = '22222222-2222-4222-8222-222222222222'
const userId = '11111111-1111-4111-8111-111111111111'
const otherUser = '33333333-3333-4333-8333-333333333333'
const otherGame = '44444444-4444-4444-8444-444444444444'
const environment = {SUPABASE_URL: base, SUPABASE_ANON_KEY: 'fixture-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key'}

Deno.test('get-game-players: real HTTP and SDK against local Postman simulation', async (test) => {
  const saved = Object.fromEntries(Object.keys(environment).map((key) => [key, Deno.env.get(key)]))
  let handler: Handler | undefined
  const original = Deno.serve
  Deno.serve = ((value: Handler) => { handler = value }) as unknown as typeof Deno.serve
  try { await import('./index.ts') } finally { Deno.serve = original }
  assert.ok(handler)
  const server = Deno.serve({hostname: '127.0.0.1', port: 0, onListen() {}}, handler)
  const client = Deno.createHttpClient({poolIdleTimeout: 0})
  const endpoint = 'http://127.0.0.1:' + server.addr.port
  const send = (url: string, init?: RequestInit) => fetch(url, {...init, client})
  const reset = async (options: Record<string, unknown> = {}) => {
    for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value)
    const response = await send(base + '/__test/reset', {method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({readyMembers: [{gameId, userId, isReady: false}], ...options})})
    assert.equal(response.status, 200)
    await response.json()
  }
  const state = async () => {
    const response = await send(base + '/__test/state')
    assert.equal(response.status, 200)
    return response.json()
  }
  const post = (body: unknown = {gameId}, raw = false) => send(endpoint, {
    method: 'POST', headers: {Authorization: 'Bearer fixture-user-token', 'Content-Type': 'application/json'},
    body: raw ? String(body) : JSON.stringify(body),
  })
  const failure = async (response: Response, status: number) => {
    assert.equal(response.status, status)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    const body = await response.json()
    assert.deepEqual(Object.keys(body), ['error'])
    assert.equal(typeof body.error, 'string')
    assert.doesNotMatch(JSON.stringify(body), /Private|fixture-/)
  }
  try {
    await test.step('full safe roster, room isolation and verified user instead of forged identity', async () => {
      const readyMembers = [{gameId, userId: otherUser, isReady: false},
        {gameId: otherGame, userId, isReady: false}, {gameId, userId, isReady: true}]
      await reset({readyMembers})
      const response = await post({gameId, userId: otherUser, p_user_id: otherUser})
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('access-control-allow-origin'), '*')
      assert.deepEqual(await response.json(), {gameId, players: [
        {user_id: userId, isReady: true}, {user_id: otherUser, isReady: false}]})
      const snapshot = await state()
      assert.deepEqual(snapshot.options.readyMembers, readyMembers)
      assert.equal(snapshot.calls.length, 2)
      const [auth, rpc] = snapshot.calls
      assert.equal(auth.method, 'GET')
      assert.equal(auth.path, '/auth/v1/user')
      assert.equal(auth.apikey, 'fixture-anon-key')
      assert.equal(auth.authorization, 'Bearer fixture-user-token')
      assert.equal(rpc.method, 'POST')
      assert.equal(rpc.path, '/rest/v1/rpc/get_game_players')
      assert.equal(rpc.apikey, 'fixture-service-key')
      assert.equal(rpc.authorization, 'Bearer fixture-service-key')
      assert.deepEqual(rpc.body, {p_game_id: gameId, p_user_id: userId})
    })
    await test.step('single participant remains an array', async () => {
      await reset()
      const response = await post()
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), {gameId, players: [{user_id: userId, isReady: false}]})
    })
    await test.step('fresh reads reflect saved true and false', async () => {
      for (const isReady of [true, false]) {
        await reset({readyMembers: [{gameId, userId, isReady}, {gameId, userId: otherUser, isReady: true}]})
        assert.deepEqual(await (await post()).json(), {gameId, players: [
          {user_id: userId, isReady}, {user_id: otherUser, isReady: true}]})
      }
    })
    for (const payload of [null, [], {}, 'room', {gameId: null}, {gameId: 1}, {gameId: 'wrong'}]) {
      await test.step('invalid input ' + JSON.stringify(payload), async () => {
        await reset()
        await failure(await post(payload), 400)
        assert.deepEqual((await state()).calls.map((call: {path: string}) => call.path), ['/auth/v1/user'])
      })
    }
    await test.step('malformed JSON', async () => {
      await reset()
      await failure(await post('{', true), 400)
      assert.equal((await state()).calls.length, 1)
    })
    await test.step('membership in another room does not authorize this room', async () => {
      await reset({readyMembers: [{gameId: otherGame, userId, isReady: false},
        {gameId, userId: otherUser, isReady: true}]})
      await failure(await post({gameId, userId: otherUser}), 404)
    })
    for (const [code, status] of [['P0002', 404], ['22023', 400], ['42501', 500]] as const) {
      await test.step('RPC ' + code, async () => {
        await reset({rpcError: code})
        await failure(await post(), status)
      })
    }
    for (const authStatus of [401, 403, 503]) {
      await test.step('Auth failure ' + authStatus + ' does not call RPC', async () => {
        await reset({authStatus})
        await failure(await post(), authStatus === 503 ? 503 : 401)
        assert.equal((await state()).calls.length, 1)
      })
    }
    const validRow = {user_id: userId, is_ready: true}
    for (const rpcResult of [null, {}, true, [null], [1], ['text'], [[]], [{}],
      [{user_id: 'wrong', is_ready: true}], [{user_id: userId}],
      [{user_id: userId, is_ready: 'true'}], [validRow, null]]) {
      await test.step('invalid DB result ' + JSON.stringify(rpcResult), async () => {
        await reset({rpcResult})
        await failure(await post(), 500)
      })
    }
    await test.step('private DB fields are excluded from the HTTP response', async () => {
      await reset({rpcResult: [{...validRow, password_hash: 'Private hash', privateField: 'Private diagnostic'}]})
      assert.deepEqual(await (await post()).json(), {gameId, players: [{user_id: userId, isReady: true}]})
    })
    await test.step('preflight, method and authorization checks prevent dependency calls', async () => {
      await reset()
      const response = await send(endpoint, {method: 'OPTIONS'})
      assert.equal(response.status, 204)
      assert.equal(response.headers.get('access-control-allow-origin'), '*')
      await response.text()
      for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
        const response = await send(endpoint, {method})
        assert.equal(response.headers.get('allow'), 'POST, OPTIONS')
        await failure(response, 405)
      }
      for (const authorization of ['', 'Basic token', 'Bearer ', 'Bearer']) {
        await failure(await send(endpoint, {method: 'POST', headers: {Authorization: authorization}}), 401)
      }
      assert.deepEqual((await state()).calls, [])
    })
    for (const key of Object.keys(environment)) {
      await test.step('missing setting ' + key, async () => {
        await reset()
        Deno.env.delete(key)
        await failure(await post(), 500)
        assert.ok((await state()).calls.every((call: {path: string}) => call.path === '/auth/v1/user'))
      })
    }
    await test.step('unreachable Auth returns 503; retry recovers', async () => {
      await reset()
      const closed = Deno.listen({hostname: '127.0.0.1', port: 0})
      const port = closed.addr.port
      closed.close()
      Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:' + port)
      await failure(await post(), 503)
      await reset()
      assert.deepEqual(await (await post()).json(), {gameId, players: [{user_id: userId, isReady: false}]})
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
