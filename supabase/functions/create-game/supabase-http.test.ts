import assert from 'node:assert/strict'
import { pbkdf2Sync } from 'node:crypto'

type Handler = (request: Request) => Response | Promise<Response>
type FixtureState = {
  calls: { method: string; path: string; query: Record<string, string>;
    authorization: string; apikey: string; body: Record<string, unknown> }[]
  games: Record<string, { password_hash: string | null }>
}

// Only synthetic credentials. The upstream URL is fixed to loopback, never cloud.
const fixtureUrl = 'http://127.0.0.1:4917/supabase'
const userId = '11111111-1111-4111-8111-111111111111'
const requestId = '22222222-2222-4222-8222-222222222222'
const validPayload = { seatCount: 3, requestId }
const environment = {
  SUPABASE_URL: fixtureUrl,
  SUPABASE_ANON_KEY: 'fixture-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
}

Deno.test('create-game через настоящий SDK и HTTP к локальной симуляции Supabase', async (test) => {
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
    const response = await send(`${fixtureUrl}/__test/reset`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options),
    })
    assert.equal(response.status, 200, 'Запусти локальную Postman simulation перед тестом')
    await response.json()
  }
  const state = async (): Promise<FixtureState> => {
    const response = await send(`${fixtureUrl}/__test/state`)
    assert.equal(response.status, 200)
    return response.json()
  }
  const post = (payload: unknown = validPayload, raw = false) => send(endpoint, {
    method: 'POST', headers: { Authorization: 'Bearer fixture-user-token', 'Content-Type': 'application/json' },
    body: raw ? String(payload) : JSON.stringify(payload),
  })
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
  const assertOnlyAuth = async () => {
    assert.deepEqual((await state()).calls.map((call) => call.path), ['/auth/v1/user'])
  }

  try {
    for (const seatCount of [2, 3, 4]) {
      await test.step(`Создание без пароля на ${seatCount} места, серверный создатель и безопасный DTO`, async () => {
        await reset()
        const response = await post({ ...validPayload, seatCount, creator_id: 'untrusted-browser-user' })
        assert.equal(response.status, 200)
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
        const dto = await response.json()
        assert.match(dto.id, /^[0-9a-f-]{36}$/)
        assert.deepEqual(dto, { id: dto.id, creator_id: userId, seat_count: seatCount,
          hasPassword: false, occupiedSeats: [{ user_id: userId }] })
        const captured = await state()
        assert.deepEqual(captured.calls.map((call) => call.path), [
          '/auth/v1/user', '/rest/v1/rpc/create_game', '/rest/v1/games',
          '/rest/v1/game_players', '/rest/v1/game_passwords',
        ])
        assert.equal(captured.calls[0].authorization, 'Bearer fixture-user-token')
        assert.equal(captured.calls[0].apikey, 'fixture-anon-key')
        for (const call of captured.calls.slice(1)) {
          assert.equal(call.authorization, 'Bearer fixture-service-key')
          assert.equal(call.apikey, 'fixture-service-key')
        }
        assert.deepEqual(captured.calls[1].body, { p_creator_id: userId, p_request_id: requestId,
          p_seat_count: seatCount, p_password_hash: null })
        assert.deepEqual(captured.calls[2].query, { select: 'id,creator_id,seat_count', id: `eq.${dto.id}` })
        assert.deepEqual(captured.calls[3].query, { select: 'user_id', game_id: `eq.${dto.id}` })
        assert.deepEqual(captured.calls[4].query, { select: 'game_id', game_id: `eq.${dto.id}` })
      })
    }

    await test.step('Пароль хешируется, а повтор возвращает сохранённые настройки', async () => {
      await reset()
      const password = '  пароль 🎨  '
      const response = await post({ ...validPayload, password })
      assert.equal(response.status, 200)
      const first = await response.json()
      assert.equal(first.hasPassword, true)
      const captured = await state()
      const hash = captured.calls[1].body.p_password_hash
      assert.equal(typeof hash, 'string')
      const parts = /^pbkdf2-sha256\$600000\$([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(String(hash))
      assert.ok(parts)
      assert.equal(parts[2], pbkdf2Sync(password, Buffer.from(parts[1], 'hex'), 600_000, 32, 'sha256').toString('hex'))
      assert.equal(JSON.stringify(captured.calls).includes(password), false)
      assert.equal(JSON.stringify(first).includes(String(hash)), false)
      const repeated = await post({ ...validPayload, seatCount: 4, password: '' })
      assert.equal(repeated.status, 200)
      assert.deepEqual(await repeated.json(), first)
      assert.equal(Object.keys((await state()).games).length, 1)
    })

    await test.step('Пустой пароль передаётся в SQL как null', async () => {
      await reset()
      const response = await post({ ...validPayload, password: '' })
      assert.equal(response.status, 200)
      assert.equal((await response.json()).hasPassword, false)
      assert.equal((await state()).calls[1].body.p_password_hash, null)
    })

    for (const authStatus of [400, 401, 403, 503]) {
      await test.step(`Auth ${authStatus}: отказ до RPC с безопасным ответом`, async () => {
        await reset({ authStatus })
        await assertError(await post(), authStatus === 503 ? 503 : 401)
        // SDK may retry the unavailable Auth service, but must never call REST.
        assert.ok((await state()).calls.every((call) => call.path === '/auth/v1/user'))
      })
    }
    await test.step('Auth не нашёл сессию: 401 без RPC', async () => {
      await reset({ noUser: true })
      await assertError(await post(), 401)
      await assertOnlyAuth()
    })

    const invalidPayloads: [string, unknown][] = [
      ['null', null], ['массив', []], ['строка', 'settings'],
      ['нет вместимости', { requestId }], ['одно место', { ...validPayload, seatCount: 1 }],
      ['пять мест', { ...validPayload, seatCount: 5 }], ['дробь', { ...validPayload, seatCount: 2.5 }],
      ['строковая вместимость', { ...validPayload, seatCount: '3' }],
      ['нет requestId', { seatCount: 3 }], ['не UUID', { ...validPayload, requestId: 'invalid' }],
      ['requestId другого типа', { ...validPayload, requestId: 123 }],
      ['пароль null', { ...validPayload, password: null }],
      ['пароль другого типа', { ...validPayload, password: 12345678 }],
      ['короткий пароль', { ...validPayload, password: '1234567' }],
    ]
    for (const [name, payload] of invalidPayloads) {
      await test.step(`Неверный payload (${name}): 400 без RPC`, async () => {
        await reset()
        await assertError(await post(payload), 400)
        await assertOnlyAuth()
      })
    }
    await test.step('Невалидный JSON: 400 без RPC', async () => {
      await reset()
      await assertError(await post('{', true), 400)
      await assertOnlyAuth()
    })

    for (const key of Object.keys(environment)) {
      await test.step(`Нет ${key}: контролируемый 500 без RPC`, async () => {
        await reset()
        Deno.env.delete(key)
        try {
          await assertError(await post(), 500)
          assert.ok((await state()).calls.every((call) => call.path === '/auth/v1/user'))
        } finally {
          resetEnvironment()
        }
      })
    }

    const failedResults: [string, Record<string, unknown>][] = [
      ['ошибка RPC', { rpcError: true }], ['RPC null', { rpcResult: null }],
      ['RPC объект', { rpcResult: { id: userId } }], ['RPC не UUID', { rpcResult: 'invalid' }],
      ['комната не найдена', { noGame: true }],
      ...['games', 'game_players', 'game_passwords'].map((table): [string, Record<string, unknown>] =>
        [`ошибка чтения ${table}`, { readError: table }]),
    ]
    for (const [name, options] of failedResults) {
      await test.step(`${name}: общий 500 без утечки диагностики`, async () => {
        await reset(options)
        await assertError(await post(), 500)
      })
    }

    await test.step('Ошибка Web Crypto: 500 без RPC', async () => {
      await reset()
      const originalDeriveBits = crypto.subtle.deriveBits
      crypto.subtle.deriveBits = () => Promise.reject(new Error('Private hash diagnostic'))
      try {
        await assertError(await post({ ...validPayload, password: '12345678' }), 500)
        await assertOnlyAuth()
      } finally {
        crypto.subtle.deriveBits = originalDeriveBits
      }
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
