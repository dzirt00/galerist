import assert from 'node:assert/strict'

type Handler = (request: Request) => Response | Promise<Response>
type Call = { method: string; path: string; query: Record<string, string>;
  authorization: string; apikey: string }

// Synthetic credentials; all HTTP calls stay on loopback.
const fixtureUrl = 'http://127.0.0.1:4918/supabase'
const environment = {
  SUPABASE_URL: fixtureUrl,
  SUPABASE_ANON_KEY: 'fixture-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
}
const rooms = [
  { id: '22222222-2222-4222-8222-222222222222', seat_count: 4, occupiedSeatCount: 2, hasPassword: true },
  { id: '33333333-3333-4333-8333-333333333333', seat_count: 3, occupiedSeatCount: 1, hasPassword: false },
  { id: '44444444-4444-4444-8444-444444444444', seat_count: 2, occupiedSeatCount: 2, hasPassword: false },
]

Deno.test('game-list: реальный обработчик и SDK через HTTP к локальной Postman simulation', async (test) => {
  const savedEnvironment = Object.fromEntries(Object.keys(environment).map((key) => [key, Deno.env.get(key)]))
  const originalServe = Deno.serve
  let handler: Handler | undefined
  Deno.serve = ((registered: Handler) => { handler = registered }) as unknown as typeof Deno.serve
  try {
    await import('./index.ts')
  } finally {
    Deno.serve = originalServe
  }
  assert.ok(handler)
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, handler)
  const endpoint = `http://127.0.0.1:${server.addr.port}`
  const client = Deno.createHttpClient({ poolIdleTimeout: 0 })
  const send = (url: string, init?: RequestInit) => fetch(url, { ...init, client })
  const resetEnvironment = () => {
    for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value)
  }
  const reset = async (options: Record<string, unknown> = {}) => {
    resetEnvironment()
    const response = await send(`${fixtureUrl}/__test/reset`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ games: rooms, ...options }) })
    assert.equal(response.status, 200, 'Запусти postman simulation run postman/simulations/web003.sim.yaml --port 4918')
    await response.json()
  }
  const calls = async (): Promise<Call[]> => {
    const response = await send(`${fixtureUrl}/__test/state`)
    assert.equal(response.status, 200)
    return (await response.json()).calls
  }
  const get = () => send(endpoint, { headers: { Authorization: 'Bearer fixture-user-token' } })
  const assertError = async (response: Response, status: number) => {
    assert.equal(response.status, status)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
    assert.match(response.headers.get('Content-Type') ?? '', /application\/json/)
    const body = await response.json()
    assert.deepEqual(Object.keys(body), ['error'])
    assert.equal(typeof body.error, 'string')
    assert.ok(body.error.length > 0)
    assert.doesNotMatch(JSON.stringify(body), /Private|fixture-service-key|fixture-user-token/)
  }

  try {
    await test.step('Комнаты 2/3/4: отдельные счётчики, пароль и заполненная комната', async () => {
      await reset()
      const response = await get()
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
      assert.deepEqual(await response.json(), rooms)
      const captured = await calls()
      assert.equal(captured.length, 8)
      assert.deepEqual(captured[0], { method: 'GET', path: '/auth/v1/user', query: {},
        authorization: 'Bearer fixture-user-token', apikey: 'fixture-anon-key' })
      assert.equal(captured[1].path, '/rest/v1/games')
      assert.deepEqual(captured[1].query, { select: 'id,seat_count' })
      for (const call of captured.slice(1)) {
        assert.equal(call.method, 'GET', 'Список ничего не записывает')
        assert.equal(call.authorization, 'Bearer fixture-service-key')
        assert.equal(call.apikey, 'fixture-service-key')
      }
      for (const [index, game] of rooms.entries()) {
        const pair = captured.slice(2 + index * 2, 4 + index * 2)
        assert.deepEqual(pair.map((call) => call.path), ['/rest/v1/game_players', '/rest/v1/game_passwords'])
        for (const call of pair) assert.deepEqual(call.query, { select: 'game_id', game_id: `eq.${game.id}` })
      }
    })
    await test.step('Пустая БД: 200 и [], без запросов участников и паролей', async () => {
      await reset({ games: [] })
      const response = await get()
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), [])
      assert.deepEqual((await calls()).map((call) => call.path), ['/auth/v1/user', '/rest/v1/games'])
    })
    await test.step('OPTIONS: preflight без Auth и БД', async () => {
      await reset()
      const response = await send(endpoint, { method: 'OPTIONS' })
      assert.equal(response.status, 204)
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
      assert.match(response.headers.get('Access-Control-Allow-Headers') ?? '', /authorization/i)
      assert.equal(await response.text(), '')
      assert.deepEqual(await calls(), [])
    })
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await test.step(`${method}: 405 до Auth и БД`, async () => {
        await reset()
        const response = await send(endpoint, { method })
        assert.equal(response.headers.get('Allow'), 'GET, OPTIONS')
        await assertError(response, 405)
        assert.deepEqual(await calls(), [])
      })
    }
    for (const authorization of [null, 'Basic abc', 'Bearer', 'Bearer   ']) {
      await test.step(`Неверный заголовок ${JSON.stringify(authorization)}: 401 до Auth`, async () => {
        await reset()
        await assertError(await send(endpoint, { headers: authorization === null ? {} : { Authorization: authorization } }), 401)
        assert.deepEqual(await calls(), [])
      })
    }
    for (const authStatus of [400, 401, 403, 503]) {
      await test.step(`Auth ${authStatus}: безопасный отказ без чтения БД`, async () => {
        await reset({ authStatus })
        await assertError(await get(), authStatus === 503 ? 503 : 401)
        const captured = await calls()
        assert.ok(captured.length > 0)
        assert.ok(captured.every((call) => call.path === '/auth/v1/user'))
      })
    }
    for (const table of ['games', 'game_players', 'game_passwords']) {
      await test.step(`Ошибка ${table}: 500, без частичного списка или утечки диагностики`, async () => {
        await reset({ readError: table, ...(table !== 'games' && { errorGameId: rooms[1].id }) })
        await assertError(await get(), 500)
        const captured = await calls()
        assert.ok(captured.some((call) => call.path === `/rest/v1/${table}`))
        assert.ok(captured.every((call) => call.query.game_id !== `eq.${rooms[2].id}`))
      })
    }
    for (const key of Object.keys(environment)) {
      await test.step(`Нет ${key}: 500 без чтения БД`, async () => {
        await reset()
        Deno.env.delete(key)
        await assertError(await get(), 500)
        assert.ok((await calls()).every((call) => call.path === '/auth/v1/user'))
      })
    }
    await test.step('Неверный URL: исключение createClient превращается в JSON 500 с CORS', async () => {
      await reset()
      Deno.env.set('SUPABASE_URL', 'invalid-url')
      await assertError(await get(), 500)
      assert.deepEqual(await calls(), [])
    })
    await test.step('После отказа новый запрос снова читает данные', async () => {
      await reset({ readError: 'games' })
      await assertError(await get(), 500)
      await reset()
      const response = await get()
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), rooms)
    })
  } finally {
    for (const [key, value] of Object.entries(savedEnvironment)) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
    client.close()
    await server.shutdown()
  }
})
