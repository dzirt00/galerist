import assert from 'node:assert/strict'

type Handler = (request: Request) => Response | Promise<Response>
const base = 'http://127.0.0.1:4919/supabase'
const userId = '11111111-1111-4111-8111-111111111111'
const gameId = '22222222-2222-4222-8222-222222222222'
const otherId = '33333333-3333-4333-8333-333333333333'
const room = {id: gameId, seat_count: 2, occupiedSeatCount: 2, hasPassword: true, turnDurationMinutes: 7}
const environment = {SUPABASE_URL: base, SUPABASE_ANON_KEY: 'fixture-anon-key', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key'}

Deno.test('get-own-lobby: authenticated read-only restoration over real SDK/HTTP', async test => {
  const saved = Object.fromEntries(Object.keys(environment).map(key => [key, Deno.env.get(key)]))
  let handler: Handler | undefined
  const originalServe = Deno.serve
  Deno.serve = ((value: Handler) => { handler = value }) as unknown as typeof Deno.serve
  try { await import('./index.ts') } finally { Deno.serve = originalServe }
  assert.ok(handler)
  const server = Deno.serve({hostname: '127.0.0.1', port: 0, onListen() {}}, handler)
  const endpoint = 'http://127.0.0.1:' + server.addr.port
  const client = Deno.createHttpClient({poolIdleTimeout: 0})
  const send = (url: string, init?: RequestInit) => fetch(url, {...init, client})
  const reset = async (options: Record<string, unknown> = {}) => {
    for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value)
    const response = await send(base + '/__test/reset', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({games: [{...room, creator_id: userId, members: [userId, otherId]}], ...options})})
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
  const fail = async (response: Response, status: number) => {
    assert.equal(response.status, status)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
    const body = await response.json()
    assert.deepEqual(Object.keys(body), ['error'])
    assert.equal(typeof body.error, 'string')
    assert.doesNotMatch(JSON.stringify(body), /Private|fixture-|password_hash/)
  }
  try {
    await test.step('full protected lobby, repeat, verified identity and safe DTO without writes', async () => {
      await reset()
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await post({gameId, userId: otherId})
        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), room)
      }
      const captured = await state()
      assert.equal(captured.options.games[0].members.length, 2)
      assert.deepEqual(captured.calls.map((call: {path: string}) => call.path),
        ['/auth/v1/user', '/rest/v1/rpc/get_own_lobby', '/auth/v1/user', '/rest/v1/rpc/get_own_lobby'])
      assert.deepEqual(captured.calls[1].body, {p_game_id: gameId, p_user_id: userId})
      assert.equal(captured.calls[0].apikey, 'fixture-anon-key')
      assert.equal(captured.calls[1].authorization, 'Bearer fixture-service-key')
    })
    for (const games of [[], [{...room, creator_id: otherId, members: [userId]}],
      [{...room, creator_id: userId, members: []}],
      ...['CLOSED', 'GAME_STARTED'].map(status => [{...room, creator_id: userId, members: [userId], status}])]) {
      await test.step('missing/foreign/closed/started lobby refuses restoration', async () => {
        await reset({games})
        await fail(await post(), 404)
      })
    }
    for (const payload of [null, [], {}, {gameId: 'invalid'}, {gameId: 1}]) {
      await test.step('invalid payload ' + JSON.stringify(payload), async () => {
        await reset()
        await fail(await post(payload), 400)
        assert.equal((await state()).calls.length, 1)
      })
    }
    await test.step('malformed JSON', async () => { await reset(); await fail(await post('{', true), 400) })
    for (const rpcResult of [null, [], {...room, id: otherId}, {...room, occupiedSeatCount: 0},
      {...room, occupiedSeatCount: 3}, {...room, turnDurationMinutes: 11}]) {
      await test.step('invalid/mismatched RPC DTO', async () => {
        await reset({rpcResult})
        await fail(await post(), 500)
      })
    }
    await test.step('extra private RPC fields excluded', async () => {
      await reset({rpcResult: {...room, password_hash: 'Private', creator_id: userId}})
      const response = await post()
      assert.deepEqual(await response.json(), room)
    })
    for (const code of ['42501', 'XX000']) {
      await test.step('RPC diagnostic masked ' + code, async () => { await reset({rpcError: code}); await fail(await post(), 500) })
    }
    for (const authStatus of [401, 403, 503]) {
      await test.step('Auth failure ' + authStatus, async () => {
        await reset({authStatus})
        await fail(await post(), authStatus === 503 ? 503 : 401)
        assert.ok((await state()).calls.every((call: {path: string}) => call.path === '/auth/v1/user'))
      })
    }
    await test.step('preflight, methods, token required before RPC', async () => {
      await reset()
      const preflight = await send(endpoint, {method: 'OPTIONS'})
      assert.equal(preflight.status, 204)
      await preflight.text()
      await fail(await send(endpoint), 405)
      await fail(await send(endpoint, {method: 'POST'}), 401)
      assert.deepEqual((await state()).calls, [])
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
