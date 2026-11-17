import {randomUUID} from 'node:crypto'

export async function testLeaveGameConcurrency({execute, concurrentSql}) {
  const owner = randomUUID()
  const member = randomUUID()
  execute(`INSERT INTO auth.users(id) VALUES ('${owner}'), ('${member}');`)
  const seed = () => {
    const room = randomUUID()
    execute(`INSERT INTO public.games(id, creator_id, seat_count) VALUES ('${room}', '${owner}', 3);
      INSERT INTO public.game_players(game_id, user_id) VALUES
        ('${room}', '${owner}'), ('${room}', '${member}');`)
    return room
  }
  const leave = (room, req) => `public.leave_game('${room}', '${member}', '${req}')`
  const join = room => `public.join_game('${room}', '${member}')`
  const call = expression => `BEGIN; SET LOCAL ROLE service_role; SELECT ${expression}; COMMIT;`
  async function overlap(firstExpression, secondExpression) {
    const application = `leave-race-${randomUUID()}`
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
      throw new Error('Could not establish overlapping exit commands')
    }
    return Promise.allSettled([first, concurrentSql(call(secondExpression))])
  }
  const assertState = (room, members, signals) => execute(`DO $$ BEGIN
    IF (SELECT count(*) FROM public.game_players WHERE game_id = '${room}') <> ${members}
      OR NOT EXISTS (SELECT FROM public.game_players WHERE game_id = '${room}' AND user_id = '${owner}')
      OR (SELECT count(*) FROM public.leave_game_requests WHERE game_id = '${room}') <> 1
      OR (SELECT count(*) FROM realtime.messages WHERE topic = 'lobby:${room}') <> ${signals} THEN
      RAISE EXCEPTION 'Overlapping exit violated seats, durable reply or signal count';
    END IF;
  END; $$;`)
  const requireSuccess = results => {
    for (const result of results) if (result.status === 'rejected') throw result.reason
  }
  const room = seed()
  const req = randomUUID()
  const results = await overlap(leave(room, req), leave(room, req))
  requireSuccess(results)
  const reply = output => JSON.parse(output.split('\n').map(line => line.trim())
    .find(line => line.startsWith('{')))
  if (JSON.stringify(reply(results[0].value)) !== JSON.stringify(reply(results[1].value))) {
    throw new Error('Concurrent repeat must return identical replies')
  }
  assertState(room, 1, 3)
  const differentRoom = seed()
  const different = await overlap(leave(differentRoom, randomUUID()), leave(differentRoom, randomUUID()))
  if (different[0].status !== 'fulfilled' || different[1].status !== 'rejected'
    || !String(different[1].reason).includes('Юзера нет в комнате')) {
    throw new Error('A different exit request after deletion must fail without recording success')
  }
  assertState(differentRoom, 1, 3)
  for (const leaveFirst of [true, false]) {
    const raceRoom = seed()
    const exit = leave(raceRoom, randomUUID())
    requireSuccess(await overlap(leaveFirst ? exit : join(raceRoom), leaveFirst ? join(raceRoom) : exit))
    assertState(raceRoom, leaveFirst ? 2 : 1, leaveFirst ? 4 : 3)
  }
  console.log('PASS: concurrent exit repeats, distinct requests and join/exit in both orders preserve seats/results/signals')
}
