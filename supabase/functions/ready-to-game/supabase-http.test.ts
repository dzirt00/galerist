import assert from 'node:assert/strict'

type Handler = (request: Request) => Response | Promise<Response>
const base = 'http://127.0.0.1:4918/supabase'
const gameId = '22222222-2222-4222-8222-222222222222'
const userId = '11111111-1111-4111-8111-111111111111'
const environment = {SUPABASE_URL: base, SUPABASE_ANON_KEY: 'fixture-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key'}

Deno.test('ready-to-game: real HTTP and SDK against local Postman simulation', async (test) => {
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
    return response.json()
  }
  const post = (body: unknown = {gameId, isReady: true}, raw = false) => send(endpoint, {
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
    await test.step('true, retry, false and verified Auth user instead of forged user', async () => {
      const otherUser = '33333333-3333-4333-8333-333333333333'
      await reset({readyMembers: [{gameId, userId, isReady: false},
        {gameId, userId: otherUser, isReady: false}]})
      for (const isReady of [true, true, false]) {
        const response = await post({gameId, isReady, userId: otherUser})
        assert.equal(response.status, 200)
        assert.equal(response.headers.get('access-control-allow-origin'), '*')
        assert.deepEqual(await response.json(), {isReady})
        const snapshot = await state()
        assert.equal(snapshot.options.readyMembers[0].isReady, isReady)
        assert.equal(snapshot.options.readyMembers[1].isReady, false)
        const [auth, rpc] = snapshot.calls.slice(-2)
        assert.equal(auth.path, '/auth/v1/user')
        assert.equal(auth.apikey, 'fixture-anon-key')
        assert.equal(auth.authorization, 'Bearer fixture-user-token')
        assert.equal(rpc.path, '/rest/v1/rpc/ready_to_game')
        assert.equal(rpc.apikey, 'fixture-service-key')
        assert.equal(rpc.authorization, 'Bearer fixture-service-key')
        assert.deepEqual(rpc.body, {p_game_id: gameId, p_user_id: userId, p_is_ready: isReady})
      }
    })
    for (const payload of [null, [], {}, {gameId}, {gameId: 'wrong', isReady: true},
      {gameId, isReady: null}, {gameId, isReady: 'true'}, {gameId, isReady: 0}]) {
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
    for (const [code, status] of [['P0002', 404], ['22023', 400], ['42501', 500]] as const) {
      await test.step('RPC ' + code + ' maps to ' + status, async () => {
        await reset({rpcError: code})
        await failure(await post(), status)
        assert.equal((await state()).options.readyMembers[0].isReady, false)
      })
    }
    await test.step('nonmember rejected without a success response', async () => {
      await reset({readyMembers: []})
      await failure(await post(), 404)
    })
    for (const authStatus of [401, 403, 503]) {
      await test.step('Auth failure ' + authStatus + ' does not call RPC', async () => {
        await reset({authStatus})
        await failure(await post(), authStatus === 503 ? 503 : 401)
        assert.equal((await state()).calls.length, 1)
      })
    }
    for (const rpcResult of [null, [], true, {}, {isReady: 'true'}, {isReady: false}]) {
      await test.step('invalid or mismatching RPC result ' + JSON.stringify(rpcResult), async () => {
        await reset({rpcResult})
        await failure(await post(), 500)
      })
    }
    await test.step('only confirmed public field is returned', async () => {
      await reset({rpcResult: {isReady: true, privateField: 'Private diagnostic'}})
      assert.deepEqual(await (await post()).json(), {isReady: true})
    })
    await test.step('OPTIONS, unsupported method, missing authorization', async () => {
      await reset()
      const preflight = await send(endpoint, {method: 'OPTIONS'})
      assert.equal(preflight.status, 204)
      assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
      await preflight.text()
      await failure(await send(endpoint), 405)
      await failure(await send(endpoint, {method: 'POST'}), 401)
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
    await test.step('unreachable upstream returns a server error; retry recovers', async () => {
      await reset()
      const closed = Deno.listen({hostname: '127.0.0.1', port: 0})
      const port = closed.addr.port
      closed.close()
      Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:' + port)
      await failure(await post(), 503)
      await reset()
      assert.deepEqual(await (await post()).json(), {isReady: true})
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
