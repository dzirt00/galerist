import assert from 'node:assert/strict'

type Handler = (request: Request) => Response | Promise<Response>

function assertCors(response: Response) {
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
  const allowedHeaders = response.headers.get('Access-Control-Allow-Headers')
    ?.toLowerCase().split(',').map((value) => value.trim()) ?? []
  for (const header of ['authorization', 'apikey', 'content-type', 'x-client-info']) {
    assert.ok(allowedHeaders.includes(header), `CORS должен разрешать ${header}`)
  }
  const allowedMethods = response.headers.get('Access-Control-Allow-Methods')
    ?.toUpperCase().split(',').map((value) => value.trim()) ?? []
  assert.ok(allowedMethods.includes('POST'))
  assert.ok(allowedMethods.includes('OPTIONS'))
}

Deno.test('HTTP-граница create-game до обращения к Auth и БД', async (test) => {
  // Перехватываем только регистрацию обработчика, не запускаем сервер.
  // Сам обработчик, Request и Response настоящие. Auth и БД не подменяются:
  // этим сценариям не разрешён доступ ни к сети, ни к окружению.
  let registeredHandler: Handler | undefined
  const originalServe = Deno.serve
  Deno.serve = ((handler: Handler) => {
    registeredHandler = handler
  }) as unknown as typeof Deno.serve
  try {
    await import('./index.ts')
  } finally {
    Deno.serve = originalServe
  }
  assert.ok(registeredHandler, 'index.ts должен зарегистрировать обработчик')
  const handle = registeredHandler
  const url = 'https://example.invalid/functions/v1/create-game'

  await test.step('OPTIONS без токена разрешает preflight и возвращает пустой 204', async () => {
    const response = await handle(new Request(url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://web.example.invalid',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, apikey, content-type, x-client-info',
      },
    }))
    assert.equal(response.status, 204)
    assert.equal(await response.text(), '')
    assertCors(response)
  })

  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    await test.step(`${method} возвращает 405, Allow и CORS до авторизации`, async () => {
      const response = await handle(new Request(url, { method }))
      assert.equal(response.status, 405)
      assert.equal(response.headers.get('Allow'), 'POST, OPTIONS')
      assertCors(response)
      const body = await response.json()
      assert.equal(typeof body.error, 'string')
      assert.ok(body.error.length > 0)
      assert.equal('headers' in body, false)
    })
  }

  const cases = [
    { name: 'без Authorization', authorization: undefined },
    { name: 'с неверной схемой', authorization: 'Basic invalid' },
    { name: 'с пустым Bearer', authorization: 'Bearer' },
    { name: 'с пробелами вместо токена', authorization: 'Bearer    ' },
  ]
  for (const { name, authorization } of cases) {
    await test.step(`POST ${name} возвращает 401 с CORS`, async () => {
      const headers = new Headers()
      if (authorization !== undefined) headers.set('Authorization', authorization)
      const response = await handle(new Request(url, { method: 'POST', headers }))
      assert.equal(response.status, 401)
      assertCors(response)
      const body = await response.json()
      assert.equal(typeof body.error, 'string')
      assert.ok(body.error.length > 0)
      assert.equal('id' in body, false)
    })
  }
})
