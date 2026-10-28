import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

const testRoot = new URL('./', import.meta.url)
const migrationRoot = new URL('../migrations/', import.meta.url)
const name = `galerist-db-test-${randomUUID()}`
const image = 'postgres:17-alpine'

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`docker ${args[0]} failed: ${result.error?.message ?? result.stderr}`)
  }
  return result.stdout.trim()
}

let containerId
const psqlArgs = ['psql', '-X', '-q', '-U', 'postgres',
  '-d', 'postgres', '--set', 'ON_ERROR_STOP=1']

function concurrentSql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', containerId, ...psqlArgs], {
      timeout: 30_000,
    })
    let output = ''
    let errorOutput = ''
    child.stdout.on('data', (data) => { output += data })
    child.stderr.on('data', (data) => { errorOutput += data })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`Concurrent SQL failed: ${errorOutput}`))
      else resolve(output)
    })
    child.stdin.on('error', reject)
    child.stdin.end(sql)
  })
}

try {
  // No exposed port, bind mounts, persistent volumes or access to cloud credentials.
  containerId = docker([
    'run', '--detach', '--rm', '--network', 'none', '--name', name,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image,
  ])
  if (!/^[a-f0-9]{64}$/.test(containerId)) {
    throw new Error('Docker did not return a valid container ID')
  }
  let ready = false
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = spawnSync('docker', ['exec', containerId, 'pg_isready', '-U', 'postgres'], {
      encoding: 'utf8', timeout: 5_000,
    })
    if (result.status === 0) {
      ready = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  if (!ready) throw new Error('Test PostgreSQL was not ready within 30 attempts')

  const migrations = readdirSync(migrationRoot).filter((file) => file.endsWith('.sql')).sort()
  if (migrations.length === 0) throw new Error('No migrations found')
  const setup = [
    readFileSync(new URL('bootstrap.sql', testRoot), 'utf8'),
    ...migrations.map((file) => readFileSync(new URL(file, migrationRoot), 'utf8')),
  ].join('\n')
  const creationTests = readFileSync(new URL('create-game.sql', testRoot), 'utf8')
    .replaceAll('\\ir create-game-client-denied.sql',
      () => readFileSync(new URL('create-game-client-denied.sql', testRoot), 'utf8'))
  const sql = [
    'BEGIN;',
    setup,
    readFileSync(new URL('game-list.sql', testRoot), 'utf8'),
    readFileSync(new URL('profiles.sql', testRoot), 'utf8'),
    creationTests,
    readFileSync(new URL('turn-duration.sql', testRoot), 'utf8'),
    "INSERT INTO auth.users VALUES ('33333333-3333-4333-8333-333333333333');",
    readFileSync(new URL('join-game.sql', testRoot), 'utf8'),
    readFileSync(new URL('ready-to-game.sql', testRoot), 'utf8'),
    readFileSync(new URL('get-game-players.sql', testRoot), 'utf8'),
    readFileSync(new URL('change-seat-count.sql', testRoot), 'utf8'),
    'ROLLBACK;',
  ].join('\n')
  const output = docker([
    'exec', '-i', containerId, ...psqlArgs,
  ], { input: sql })
  console.log(output)

  // Independent sessions require committed fixtures, still only in this container.
  docker(['exec', '-i', containerId, ...psqlArgs], { input: `
    BEGIN;
    ${setup}
    INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111');
    CREATE FUNCTION public.pause_test_creation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM pg_sleep(1);
      RETURN NEW;
    END; $$;
    CREATE TRIGGER pause_test_creation BEFORE INSERT ON public.games
    FOR EACH ROW EXECUTE FUNCTION public.pause_test_creation();
    COMMIT;
  ` })
  const call = `
    BEGIN;
    SET LOCAL ROLE service_role;
    SELECT public.create_game('11111111-1111-4111-8111-111111111111',
      'ffffffff-ffff-4fff-8fff-ffffffffffff', 3, 'concurrent-hash-fixture', 3);
    COMMIT;
  `
  const concurrentResults = await Promise.allSettled([concurrentSql(call), concurrentSql(call)])
  for (const result of concurrentResults) {
    if (result.status === 'rejected') throw result.reason
  }
  const returnedIds = concurrentResults.map((result) =>
    result.value.match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/g))
  if (returnedIds.some((ids) => ids?.length !== 1)
    || returnedIds[0][0] !== returnedIds[1][0]) {
    throw new Error('Concurrent retries must return the same room ID')
  }
  docker(['exec', '-i', containerId, ...psqlArgs], { input: `
    DO $$
    BEGIN
      IF (SELECT count(*) FROM public.games) <> 1
        OR (SELECT count(*) FROM public.game_players) <> 1
        OR (SELECT count(*) FROM public.game_passwords) <> 1
        OR (SELECT count(*) FROM public.game_creation_requests) <> 1 THEN
        RAISE EXCEPTION 'Concurrent retries must persist exactly one set of creation records';
      END IF;
    END; $$;
  ` })
  console.log('PASS: concurrent retries return one room and persist exactly one set of records')
  // Both contenders hold a transaction open after obtaining the same room lock.
  docker(['exec', '-i', containerId, ...psqlArgs], { input: `
    INSERT INTO auth.users VALUES
      ('22222222-2222-4222-8222-222222222222'),
      ('33333333-3333-4333-8333-333333333333');
    INSERT INTO public.games(id, creator_id, seat_count) VALUES
      ('abababab-abab-4bab-8bab-abababababab', '11111111-1111-4111-8111-111111111111', 2);
    INSERT INTO public.game_players VALUES
      ('abababab-abab-4bab-8bab-abababababab', '11111111-1111-4111-8111-111111111111');
  ` })
  const joinCall = (userId) => `BEGIN; SET LOCAL ROLE service_role;
    SELECT public.join_game('abababab-abab-4bab-8bab-abababababab', '${userId}');
    SELECT pg_sleep(0.5); COMMIT;`
  const contenders = await Promise.allSettled([
    concurrentSql(joinCall('22222222-2222-4222-8222-222222222222')),
    concurrentSql(joinCall('33333333-3333-4333-8333-333333333333')),
  ])
  if (contenders.filter((result) => result.status === 'fulfilled').length !== 1
    || !String(contenders.find((result) => result.status === 'rejected')?.reason).includes('Свободных мест нет')) {
    throw new Error('Exactly one contender must take the last seat')
  }
  // Two concurrent retries by the same existing participant both succeed.
  const creatorRetry = joinCall('11111111-1111-4111-8111-111111111111')
  await Promise.all([concurrentSql(creatorRetry), concurrentSql(creatorRetry)])
  docker(['exec', '-i', containerId, ...psqlArgs], { input: `DO $$ BEGIN
    IF (SELECT count(*) FROM public.game_players WHERE game_id = 'abababab-abab-4bab-8bab-abababababab') <> 2 THEN
      RAISE EXCEPTION 'Concurrent joins/retries violated capacity';
    END IF;
  END; $$;` })
  console.log('PASS: concurrent last-seat joins and concurrent member retries preserve capacity')
  docker(['exec', '-i', containerId, ...psqlArgs], { input: `
    INSERT INTO public.games(id, creator_id, seat_count) VALUES
      ('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd', '11111111-1111-4111-8111-111111111111', 3);
    INSERT INTO public.game_players VALUES
      ('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd', '11111111-1111-4111-8111-111111111111');
  ` })
  const newMemberCall = joinCall('22222222-2222-4222-8222-222222222222')
    .replaceAll('abababab-abab-4bab-8bab-abababababab', 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd')
  await Promise.all([concurrentSql(newMemberCall), concurrentSql(newMemberCall)])
  docker(['exec', '-i', containerId, ...psqlArgs], { input: `DO $$ BEGIN
    IF (SELECT count(*) FROM public.game_players WHERE game_id = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd') <> 2 THEN
      RAISE EXCEPTION 'Concurrent retries of a new participant inserted twice';
    END IF;
  END; $$;` })
  console.log('PASS: concurrent retries of a new participant persist exactly one membership')
  // Both commands lock the same room; exactly one can win the last free seat.
  docker(['exec', '-i', containerId, ...psqlArgs], { input: `
    INSERT INTO public.games(id, creator_id, seat_count) VALUES
      ('dededede-dede-4ede-8ede-dededededede', '11111111-1111-4111-8111-111111111111', 3);
    INSERT INTO public.game_players(game_id, user_id) VALUES
      ('dededede-dede-4ede-8ede-dededededede', '11111111-1111-4111-8111-111111111111'),
      ('dededede-dede-4ede-8ede-dededededede', '22222222-2222-4222-8222-222222222222');
  ` })
  const shrinkCall = `BEGIN; SET LOCAL ROLE service_role;
    SELECT public.change_seat_count('dededede-dede-4ede-8ede-dededededede',
      '11111111-1111-4111-8111-111111111111', 2);
    SELECT pg_sleep(0.5); COMMIT;`
  const racingJoin = joinCall('33333333-3333-4333-8333-333333333333')
    .replaceAll('abababab-abab-4bab-8bab-abababababab', 'dededede-dede-4ede-8ede-dededededede')
  const capacityRace = await Promise.allSettled([concurrentSql(shrinkCall), concurrentSql(racingJoin)])
  if (capacityRace.filter((result) => result.status === 'fulfilled').length !== 1) {
    throw new Error('Exactly one of shrinking to occupancy and joining must succeed')
  }
  const loser = capacityRace.find((result) => result.status === 'rejected')
  const expectedError = capacityRace[0].status === 'fulfilled' ? 'Свободных мест нет' : 'данные некорректны'
  if (!String(loser.reason).includes(expectedError)) throw loser.reason
  docker(['exec', '-i', containerId, ...psqlArgs], { input: `DO $$ DECLARE
    capacity integer;
    occupied bigint;
    BEGIN
      SELECT seat_count INTO capacity FROM public.games
        WHERE id = 'dededede-dede-4ede-8ede-dededededede';
      SELECT count(*) INTO occupied FROM public.game_players
        WHERE game_id = 'dededede-dede-4ede-8ede-dededededede';
      IF NOT ((capacity = 2 AND occupied = 2) OR (capacity = 3 AND occupied = 3)) THEN
        RAISE EXCEPTION 'Concurrent shrink/join violated capacity or lost a successful change';
      END IF;
    END; $$;` })
  console.log('PASS: concurrent capacity shrink and join preserve capacity and reject exactly one request')
  console.log('WEB-001/002/003/004 database tests passed (local PostgreSQL fixture).')
} finally {
  // Remove only the disposable container created by this run.
  if (containerId && /^[a-f0-9]{64}$/.test(containerId)) {
    docker(['rm', '--force', '--volumes', containerId])
  }
}
