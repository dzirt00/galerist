import {randomUUID} from 'node:crypto'

export async function testAddBotConcurrency({execute, concurrentSql}) {
  const owner = randomUUID()
  const guest = randomUUID()
  execute(`INSERT INTO auth.users(id) VALUES ('${owner}'), ('${guest}');`)
  const seed = (capacity = 2) => {
    const room = randomUUID()
    execute(`INSERT INTO public.games(id, creator_id, seat_count)
      VALUES ('${room}', '${owner}', ${capacity});
      INSERT INTO public.game_players(game_id, user_id) VALUES ('${room}', '${owner}');`)
    return room
  }
  const add = (room, request) => `public.add_bot('${room}', '${owner}', '${request}')`
  const join = (room) => `public.join_game('${room}', '${guest}')`
  const shrink = (room) => `public.change_settings_game('${room}', '${owner}', 2, 3)`
  const call = (expression) => `BEGIN; SET LOCAL ROLE service_role; SELECT ${expression}; COMMIT;`

  // Observe a completed first command holding its room lock before dispatching
  // the contender; do not assume which connection wins based on a guessed delay.
  async function overlap(firstExpression, secondExpression) {
    const application = `bot-race-${randomUUID()}`
    let outcome
    const first = concurrentSql(`BEGIN; SET LOCAL ROLE service_role;
      SET LOCAL application_name = '${application}';
      SELECT ${firstExpression}; SELECT pg_sleep(2); COMMIT;`)
    first.then(() => { outcome = 'done' }, error => { outcome = error })
    let observed = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const output = execute(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
        WHERE application_name = '${application}' AND wait_event = 'PgSleep');`)
      if (output.split('\n').some(line => line.trim() === 't')) {
        observed = true
        break
      }
      if (outcome !== undefined) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    if (!observed) {
      await first
      throw new Error('Could not establish overlapping bot commands')
    }
    return Promise.allSettled([first, concurrentSql(call(secondExpression))])
  }

  const assertCounts = (room, seats, requests) => execute(`DO $$ BEGIN
    IF (SELECT count(*) FROM public.game_players WHERE game_id = '${room}') <> ${seats}
      OR (SELECT count(*) FROM public.bot_addition_requests WHERE game_id = '${room}') <> ${requests}
      OR (SELECT count(*) FROM public.game_players WHERE game_id = '${room}') >
        (SELECT seat_count FROM public.games WHERE id = '${room}') THEN
      RAISE EXCEPTION 'Concurrent commands violated seats, request count or capacity';
    END IF;
  END; $$;`)
  const expectSecondFull = (results) => {
    if (results[0].status !== 'fulfilled') throw results[0].reason
    if (results[1].status !== 'rejected'
      || !String(results[1].reason).includes('Свободных мест нет')) {
      throw new Error('Second contender must be rejected because the room is full')
    }
  }

  const replayRoom = seed()
  const request = randomUUID()
  const replay = await overlap(add(replayRoom, request), add(replayRoom, request))
  for (const result of replay) if (result.status === 'rejected') throw result.reason
  // psql includes sleep output only in the first connection; compare the JSON lines.
  const reply = (output) => JSON.parse(output.split('\n').map(line => line.trim())
    .find(line => line.startsWith('{')))
  if (JSON.stringify(reply(replay[0].value)) !== JSON.stringify(reply(replay[1].value))) {
    throw new Error('Concurrent replay must return identical persisted results')
  }
  assertCounts(replayRoom, 2, 1)

  const differentRoom = seed()
  expectSecondFull(await overlap(add(differentRoom, randomUUID()), add(differentRoom, randomUUID())))
  assertCounts(differentRoom, 2, 1)
  console.log('PASS: overlapping same/different bot requests preserve one last seat and durable replay')

  for (const botFirst of [true, false]) {
    const room = seed()
    const bot = add(room, randomUUID())
    expectSecondFull(await overlap(botFirst ? bot : join(room), botFirst ? join(room) : bot))
    assertCounts(room, 2, botFirst ? 1 : 0)
  }
  console.log('PASS: bot addition and human join serialize in both orders without overfilling')

  for (const botFirst of [true, false]) {
    const room = seed(3)
    execute(`INSERT INTO public.game_players(game_id, user_id) VALUES ('${room}', '${guest}');`)
    const bot = add(room, randomUUID())
    const results = await overlap(botFirst ? bot : shrink(room), botFirst ? shrink(room) : bot)
    if (results[0].status !== 'fulfilled') throw results[0].reason
    const expectedError = botFirst ? 'данные некорректны' : 'Свободных мест нет'
    if (results[1].status !== 'rejected' || !String(results[1].reason).includes(expectedError)) {
      throw new Error('Exactly one of incompatible shrink and bot addition must succeed')
    }
    assertCounts(room, botFirst ? 3 : 2, botFirst ? 1 : 0)
  }
  console.log('PASS: bot addition and capacity shrink serialize in both orders')
}
