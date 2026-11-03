import { readFileSync } from 'node:fs'

// Reuses the main runner's disposable PostgreSQL container and migration setup.
export async function testRoomRestrictions({ setup, execute, concurrentSql }) {
  execute(`BEGIN;\n${setup}\n${readFileSync(new URL('./room-restrictions.sql', import.meta.url), 'utf8')}\nROLLBACK;`)
  console.log('PASS: room status, request replay, creation/join restrictions, safe DTO, permissions and rollback')

  execute(`${setup}
    INSERT INTO auth.users VALUES
      ('11111111-1111-4111-8111-111111111111'),
      ('22222222-2222-4222-8222-222222222222');
    CREATE TABLE public.restriction_test_results(label text PRIMARY KEY, result jsonb);
    GRANT INSERT ON public.restriction_test_results TO service_role;
  `)
  const user = '11111111-1111-4111-8111-111111111111'
  const other = '22222222-2222-4222-8222-222222222222'
  const room = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const r1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const r2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const create = (request) => `public.create_game('${user}', '${request}', 3, NULL, 3)`
  const join = `public.join_game('${room}', '${user}')`
  const resultCall = (label, expression) => `BEGIN; SET LOCAL ROLE service_role;
    INSERT INTO public.restriction_test_results VALUES ('${label}', ${expression}); COMMIT;`
  const reset = () => execute(`TRUNCATE public.games, public.game_players,
    public.game_passwords, public.game_creation_requests, public.restriction_test_results;`)
  const seedOtherRoom = () => execute(`INSERT INTO public.games(id, creator_id, seat_count)
    VALUES ('${room}', '${other}', 3);
    INSERT INTO public.game_players(game_id, user_id) VALUES ('${room}', '${other}');`)

  // Observe the transaction's actual advisory lock, rather than relying on a
  // guessed sleep to decide which of the two operations obtains it first.
  async function waitUntilLocked(operation) {
    let outcome
    const tracked = operation.then(() => { outcome = 'done' }, (error) => { outcome = error })
    for (let attempt = 0; attempt < 100; attempt++) {
      const locked = execute(`SELECT EXISTS (SELECT 1 FROM pg_locks l JOIN pg_stat_activity a USING (pid)
        WHERE l.locktype = 'advisory' AND l.granted AND a.application_name = 'web018-first');`)
      if (locked.split('\n').some((line) => line.trim() === 't')) return
      if (outcome instanceof Error) throw outcome
      if (outcome === 'done') throw new Error('First operation finished before overlap was established')
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    await tracked
    throw new Error('Could not observe first operation advisory lock')
  }
  const firstCall = (expression) => `BEGIN; SET LOCAL ROLE service_role;
    SET LOCAL application_name = 'web018-first';
    INSERT INTO public.restriction_test_results VALUES ('first', ${expression});
    SELECT pg_sleep(3); COMMIT;`

  // Different request IDs: exactly one success, no second creation result.
  await Promise.all([concurrentSql(resultCall('one', create(r1))), concurrentSql(resultCall('two', create(r2)))])
  execute(`DO $$ BEGIN
    IF (SELECT count(*) FROM public.games) <> 1
      OR (SELECT count(*) FROM public.game_creation_requests) <> 1
      OR (SELECT count(*) FROM public.restriction_test_results WHERE result->>'code' = 'SUCCESS') <> 1
      OR (SELECT count(*) FROM public.restriction_test_results WHERE result->>'code' = 'OWN_LOBBY_EXISTS') <> 1 THEN
      RAISE EXCEPTION 'Concurrent different requests bypassed owned-room restriction';
    END IF;
  END; $$;`)
  console.log('PASS: concurrent different creation request IDs produce one room')
  reset()

  await Promise.all([concurrentSql(resultCall('one', create(r1))), concurrentSql(resultCall('two', create(r1)))])
  execute(`DO $$ BEGIN
    IF (SELECT count(*) FROM public.games) <> 1 OR (SELECT count(*) FROM public.game_creation_requests) <> 1
      OR (SELECT result FROM public.restriction_test_results WHERE label = 'one') IS DISTINCT FROM
         (SELECT result FROM public.restriction_test_results WHERE label = 'two') THEN
      RAISE EXCEPTION 'Concurrent repeat did not preserve a single success';
    END IF;
  END; $$;`)
  console.log('PASS: concurrent same-request replay returns identical success')
  reset()

  for (const createFirst of [true, false]) {
    seedOtherRoom()
    const first = concurrentSql(firstCall(createFirst ? create(r1) : join))
    // Issue the rival while the first transaction still owns the observed lock.
    await waitUntilLocked(first)
    await Promise.all([first, concurrentSql(resultCall('second', createFirst ? join : create(r1)))])
    execute(`DO $$ DECLARE second_result jsonb; BEGIN
      SELECT result INTO second_result FROM public.restriction_test_results WHERE label = 'second';
      IF second_result->>'code' IS DISTINCT FROM '${createFirst ? 'OWN_LOBBY_EXISTS' : 'LOBBY_MEMBERSHIP_EXISTS'}'
        OR (SELECT count(*) FROM public.games WHERE creator_id = '${user}') <> ${createFirst ? 1 : 0}
        OR (SELECT count(*) FROM public.game_players WHERE game_id = '${room}' AND user_id = '${user}') <> ${createFirst ? 0 : 1} THEN
        RAISE EXCEPTION 'Create/join race violated the ownership-membership invariant';
      END IF;
    END; $$;`)
    console.log(`PASS: overlapping ${createFirst ? 'create then join' : 'join then create'} preserves restriction`)
    reset()
  }
}
