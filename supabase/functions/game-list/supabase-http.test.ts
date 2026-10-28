import assert from 'node:assert/strict'

type Handler = (request: Request) => Response | Promise<Response>
type Call = { method: string; path: string; body?: unknown; query: Record<string, string>;
  authorization: string; apikey: string }

// Synthetic credentials; all HTTP calls stay on loopback.
const fixtureUrl = 'http://127.0.0.1:4918/supabase'
const environment = {
  SUPABASE_URL: fixtureUrl,
  SUPABASE_ANON_KEY: 'fixture-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
}
const rooms = [
  { id: '22222222-2222-4222-8222-222222222222', seat_count: 4, occupiedSeatCount: 2, hasPassword: true, turnDurationMinutes: 3 },
  { id: '33333333-3333-4333-8333-333333333333', seat_count: 3, occupiedSeatCount: 1, hasPassword: false, turnDurationMinutes: 3 },
  { id: '44444444-4444-4444-8444-444444444444', seat_count: 2, occupiedSeatCount: 2, hasPassword: false, turnDurationMinutes: 3 },
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
      assert.equal(captured.length, 2)
      assert.deepEqual(captured[0], { method: 'GET', path: '/auth/v1/user', query: {},
        authorization: 'Bearer fixture-user-token', apikey: 'fixture-anon-key' })
      assert.deepEqual(captured[1], {
        method: 'POST', path: '/rest/v1/rpc/get_game_list', body: {}, query: {},
        authorization: 'Bearer fixture-service-key', apikey: 'fixture-service-key',
      })
    })
    await test.step('Пустая БД: 200 и [], без запросов участников и паролей', async () => {
      await reset({ games: [] })
      const response = await get()
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), [])
      assert.deepEqual((await calls()).map((call) => call.path), ['/auth/v1/user', '/rest/v1/rpc/get_game_list'])
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
    await test.step('Ошибка RPC: 500 без частичного списка и приватной диагностики', async () => {
      await reset({rpcError: '42501'})
      await assertError(await get(), 500)
      assert.equal((await calls()).length, 2)
    })
    for (const rpcResult of [null, {},
      ...[undefined, null, '3', 0, 11, 2.5].map((minutes) => [{...rooms[0], turnDurationMinutes: minutes}]), [rooms[0], {id: 'broken'}],
      [{...rooms[0], occupiedSeatCount: 5}], [{...rooms[0], occupiedSeatCount: -1}],
      [{...rooms[0], occupiedSeatCount: 1.5}], [{...rooms[0], hasPassword: 'true'}],
      [{...rooms[0], seat_count: 5}], [{...rooms[0], id: 'invalid'}]]) {
      await test.step('Неверный RPC DTO отклоняется целиком: ' + JSON.stringify(rpcResult), async () => {
        await reset({rpcResult})
        await assertError(await get(), 500)
      })
    }
    await test.step('Приватные поля RPC не выходят в ответ', async () => {
      await reset({rpcResult: rooms.map(room => ({...room, password_hash: 'Private', creator_id: 'Private'}))})
      const response = await get()
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), rooms)
    })
    await test.step('Число обращений не растёт с числом комнат', async () => {
      const manyRooms = Array.from({length: 50}, (_, i) => ({...rooms[0],
        id: i.toString(16).padStart(8, '0') + '-2222-4222-8222-222222222222'}))
      await reset({games: manyRooms})
      const response = await get()
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), manyRooms)
      assert.equal((await calls()).length, 2)
    })
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
      await reset({ rpcError: '42501' })
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
