import assert from 'node:assert/strict'

type Handler = (request: Request) => Response | Promise<Response>
const user = '11111111-1111-4111-8111-111111111111'
const gameId = '22222222-2222-4222-8222-222222222222'
const room = {id: gameId, seat_count: 3, occupiedSeatCount: 2, hasPassword: false,
  turnDurationMinutes: 3, display_name: 'anna'}
const roster = [{user_id: user, is_ready: false, display_name: 'boris', seat_count: 3,
  turn_duration_minutes: 3, is_bot: false, seat_id: user}]
const modules = {
  'game-list': () => import('../game-list/index.ts'),
  'get-game-players': () => import('../get-game-players/index.ts'),
  'join-game': () => import('../join-game/index.ts'),
  'get-own-lobby': () => import('../get-own-lobby/index.ts'),
  'create-game': () => import('../create-game/index.ts'),
}

Deno.test('WEB-009: names survive real Edge handlers and SDK HTTP; invalid profile names are refused', async t => {
  const keys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
  const saved = keys.map(key => Deno.env.get(key))
  const client = Deno.createHttpClient({poolIdleTimeout: 0})
  const send = (url: string, init?: RequestInit) => fetch(url, {...init, client})
  try {
    for (const name of Object.keys(modules) as (keyof typeof modules)[]) {
      let handler: Handler | undefined
      const original = Deno.serve
      Deno.serve = ((value: Handler) => { handler = value }) as unknown as typeof Deno.serve
      try { await modules[name]() } finally { Deno.serve = original }
      assert.ok(handler)
      const server = Deno.serve({hostname: '127.0.0.1', port: 0, onListen() {}}, handler)
      const base = `http://127.0.0.1:${name === 'create-game' ? 4917 : 4919}/supabase`
      Deno.env.set('SUPABASE_URL', base)
      Deno.env.set('SUPABASE_ANON_KEY', 'fixture-anon-key')
      Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key')
      const reset = async (options: unknown) => {
        const response = await send(base + '/__test/reset', {method: 'POST',
          headers: {'Content-Type': 'application/json'}, body: JSON.stringify(options)})
        assert.equal(response.status, 200)
        await response.json()
      }
      const invoke = () => send(`http://127.0.0.1:${server.addr.port}`, {
        method: name === 'game-list' ? 'GET' : 'POST',
        headers: {Authorization: 'Bearer fixture-user-token', 'Content-Type': 'application/json'},
        ...(name === 'game-list' ? {} : {body: JSON.stringify(name === 'create-game'
          ? {seatCount: 3, turnDurationMinutes: 3, requestId: gameId}
          : {gameId})}),
      })
      const rpcResult = (display_name: unknown) => name === 'game-list'
        ? [{...room, display_name, email: 'private@example.invalid', password_hash: 'private'}]
        : name === 'get-game-players' ? [{...roster[0], display_name, email: 'private@example.invalid'}]
        : {...room, display_name, email: 'private@example.invalid'}
      try {
        await t.step(name + ': preserves safe names and the actual upstream path', async () => {
          await reset(name === 'create-game' ? {} : {rpcResult: rpcResult('anna')})
          const response = await invoke()
          assert.equal(response.status, 200)
          const body = await response.json()
          if (name === 'game-list') assert.deepEqual(body, [room])
          else if (name === 'get-game-players') assert.deepEqual(body,
            {gameId, seat_count: 3, turnDurationMinutes: 3,
              players: [{user_id: user, isReady: false, display_name: 'anna', is_bot: false, seat_id: user}]})
          else if (name === 'create-game') assert.equal(body.display_name, 'anna')
          else assert.deepEqual(body, room)
          assert.doesNotMatch(JSON.stringify(body), /email|password_hash|fixture-service-key/)
          const stateResponse = await send(base + '/__test/state')
          const state = await stateResponse.json()
          assert.equal(state.calls[0].path, '/auth/v1/user')
          if (name === 'create-game') {
            const read = state.calls.find((call: {path: string}) => call.path === '/rest/v1/profiles')
            assert.deepEqual(read.query, {select: 'display_name', id: 'eq.' + user})
            assert.equal(read.authorization, 'Bearer fixture-service-key')
          } else assert.ok(state.calls.some((call: {path: string}) =>
            call.path === '/rest/v1/rpc/' + (name === 'game-list' ? 'get_game_list' : name.replaceAll('-', '_'))))
        })
        for (const value of [undefined, null, '', ' ', 42]) {
          await t.step(name + ': refuses invalid name ' + String(value), async () => {
            await reset(name === 'create-game' ? {profileResult: {display_name: value}}
              : {rpcResult: rpcResult(value)})
            const response = await invoke()
            assert.equal(response.status, 500)
            const body = await response.json()
            assert.deepEqual(Object.keys(body), ['error'])
            assert.equal(typeof body.error, 'string')
          })
        }
        if (name === 'create-game') await t.step('profile read failure is safely reported', async () => {
          await reset({readError: 'profiles'})
          const response = await invoke()
          assert.equal(response.status, 500)
          assert.deepEqual(await response.json(), {error: 'Не удалось создать комнату'})
        })
      } finally { await server.shutdown() }
    }
  } finally {
    client.close()
    keys.forEach((key, index) => {
      const value = saved[index]
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    })
  }
})
