import {randomUUID} from 'node:crypto'

export async function testRemoveBotConcurrency({execute, concurrentSql}) {
  const owner = randomUUID()
  const member = randomUUID()
  execute(`INSERT INTO auth.users(id) VALUES ('${owner}'), ('${member}');`)
  const seed = (capacity = 2) => {
    const room = randomUUID()
    const bot = randomUUID()
    execute(`INSERT INTO public.games(id, creator_id, seat_count) VALUES ('${room}', '${owner}', ${capacity});
      INSERT INTO public.game_players(game_id, user_id) VALUES ('${room}', '${owner}');
      INSERT INTO public.game_players(game_id, seat_id, is_bot, is_ready)
        VALUES ('${room}', '${bot}', true, true);`)
    return {room, bot}
  }
  const remove = (room, bot, req) => `public.remove_bot('${owner}', '${room}', '${req}', '${bot}')`
  const call = expression => `BEGIN; SET LOCAL ROLE service_role; SELECT ${expression}; COMMIT;`
  async function overlap(firstExpression, secondExpression) {
    const application = `remove-race-${randomUUID()}`
    let outcome
    const first = concurrentSql(`BEGIN; SET LOCAL ROLE service_role;
      SET LOCAL application_name = '${application}';
      SELECT ${firstExpression}; SELECT pg_sleep(2); COMMIT;`)
    first.then(() => { outcome = 'done' }, error => { outcome = error })
    let observed = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const output = execute(`SELECT EXISTS (SELECT FROM pg_stat_activity
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
      throw new Error('Could not establish overlapping removal commands')
    }
    return Promise.allSettled([first, concurrentSql(call(secondExpression))])
  }
  const requireSuccess = results => {
    for (const result of results) if (result.status === 'rejected') throw result.reason
  }
  const assertState = (room, bot, seats, signals) => execute(`DO $$ BEGIN
    IF EXISTS (SELECT FROM public.game_players WHERE seat_id = '${bot}')
      OR (SELECT count(*) FROM public.game_players WHERE game_id = '${room}') <> ${seats}
      OR (SELECT count(*) FROM public.bot_removal_requests WHERE game_id = '${room}') <> 1
      OR NOT EXISTS (SELECT FROM public.bot_removal_requests WHERE game_id = '${room}' AND seat_id = '${bot}')
      OR (SELECT count(*) FROM realtime.messages WHERE topic = 'lobby:${room}') <> ${signals} THEN
      RAISE EXCEPTION 'Concurrent removal violated target, seats, journal or signals';
    END IF;
  END; $$;`)
  {
    const {room, bot} = seed()
    const req = randomUUID()
    const results = await overlap(remove(room, bot, req), remove(room, bot, req))
    requireSuccess(results)
    const reply = output => JSON.parse(output.split('\n').map(line => line.trim()).find(line => line.startsWith('{')))
    if (JSON.stringify(reply(results[0].value)) !== JSON.stringify(reply(results[1].value))) {
      throw new Error('Concurrent repeats must return identical results')
    }
    assertState(room, bot, 1, 3)
  }
  {
    const {room, bot} = seed()
    const results = await overlap(remove(room, bot, randomUUID()), remove(room, bot, randomUUID()))
    if (results[0].status !== 'fulfilled' || results[1].status !== 'rejected'
      || !String(results[1].reason).includes('нет такого бота')) {
      throw new Error('Different request after removal must refuse without storing success')
    }
    assertState(room, bot, 1, 3)
  }
  // Removal of a full lobby's bot must serialize with a person taking its seat.
  {
    const {room, bot} = seed()
    const results = await overlap(remove(room, bot, randomUUID()), `public.join_game('${room}', '${member}')`)
    requireSuccess(results)
    assertState(room, bot, 2, 4)
    execute(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM public.game_players WHERE game_id = '${room}' AND user_id = '${member}') THEN
        RAISE EXCEPTION 'Join after removal must occupy freed place';
      END IF;
    END; $$;`)
  }
  // If an add obtains the room lock first, an old removal still targets only its original seat.
  {
    const {room, bot} = seed(3)
    requireSuccess(await overlap(`public.add_bot('${room}', '${owner}', '${randomUUID()}')`, remove(room, bot, randomUUID())))
    assertState(room, bot, 2, 4)
    execute(`DO $$ BEGIN
      IF (SELECT count(*) FROM public.game_players WHERE game_id = '${room}' AND is_bot) <> 1 THEN
        RAISE EXCEPTION 'Concurrent addition must preserve the new bot';
      END IF;
    END; $$;`)
  }
  console.log('PASS: overlapping removal repeats, distinct requests, join and bot addition preserve exact target/results/signals')
}
