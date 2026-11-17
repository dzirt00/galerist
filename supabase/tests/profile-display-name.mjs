import {readFileSync} from 'node:fs'

export async function testProfileDisplayName({setup, execute, concurrentSql}) {
  execute(`BEGIN;\n${setup}\n${readFileSync(new URL('./profile-display-name.sql', import.meta.url), 'utf8')}\nROLLBACK;`)
  console.log('PASS: WEB-009 profile constraints, normalization, rollback and RLS')

  // Separate connections need committed schema; still only in the disposable DB.
  execute(setup)
  const firstId = '09000000-0000-4000-8000-000000000011'
  const secondId = '09000000-0000-4000-8000-000000000012'
  let firstOutcome
  const first = concurrentSql(`BEGIN;
    SET LOCAL application_name = 'web009-first';
    INSERT INTO auth.users(id, raw_user_meta_data)
      VALUES ('${firstId}', '{"display_name":" RaceName "}');
    SELECT pg_sleep(2);
    COMMIT;`)
  // Attach the rejection handler immediately while observing the first connection.
  first.then(() => { firstOutcome = 'done' }, (error) => { firstOutcome = error })
  let observed = false
  for (let attempt = 0; attempt < 100; attempt++) {
    const output = execute(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
      WHERE application_name = 'web009-first' AND wait_event = 'PgSleep');`)
    if (output.split('\n').some((line) => line.trim() === 't')) {
      observed = true
      break
    }
    if (firstOutcome instanceof Error) throw firstOutcome
    if (firstOutcome === 'done') break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  if (!observed) {
    await first
    throw new Error('Could not establish overlapping profile registrations')
  }
  const results = await Promise.allSettled([first, concurrentSql(`BEGIN;
    INSERT INTO auth.users(id, raw_user_meta_data)
      VALUES ('${secondId}', '{"display_name":"racename"}');
    COMMIT;`)])
  if (results[0].status !== 'fulfilled' || results[1].status !== 'rejected'
    || !String(results[1].reason).includes('profiles_display_name_key')) {
    throw new Error(`Concurrent names must have exactly one unique-constraint rejection: ${JSON.stringify(results)}`)
  }
  execute(`DO $$ BEGIN
    IF (SELECT count(*) FROM public.profiles WHERE display_name = 'racename') <> 1
      OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '${firstId}')
      OR EXISTS (SELECT 1 FROM auth.users WHERE id = '${secondId}')
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = '${secondId}') THEN
      RAISE EXCEPTION 'Concurrent duplicate left a missing or partial registration';
    END IF;
  END; $$;`)
  console.log('PASS: overlapping normalized-name registrations persist one Auth user and profile')
  // The runner reuses this disposable DB for older scenarios.
  execute(`TRUNCATE auth.users, public.profiles, public.games, public.game_players,
    public.game_passwords, public.game_creation_requests, public.bot_addition_requests, public.leave_game_requests, public.bot_removal_requests, realtime.messages;`)
}
