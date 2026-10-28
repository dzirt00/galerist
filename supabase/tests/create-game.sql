-- Run after profiles.sql, which supplies two users. Hashes below are opaque
-- fixtures: password validation and real hashing belong to the Edge Function.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  first_game uuid;
  second_game uuid;
  protected_game uuid;
  invalid_count integer;
  room_count bigint;
BEGIN
  first_game := public.create_game(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, NULL, 3);
  IF NOT EXISTS (SELECT 1 FROM public.games
    WHERE id = first_game AND seat_count = 2
      AND creator_id = '11111111-1111-4111-8111-111111111111')
    OR (SELECT count(*) FROM public.game_players WHERE game_id = first_game) <> 1
    OR NOT EXISTS (SELECT 1 FROM public.game_players WHERE game_id = first_game
      AND user_id = '11111111-1111-4111-8111-111111111111')
    OR EXISTS (SELECT 1 FROM public.game_passwords WHERE game_id = first_game)
    OR NOT EXISTS (SELECT 1 FROM public.game_creation_requests
      WHERE game_id = first_game AND request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        AND user_id = '11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'Creation must persist room, creator seat and request result without a password row';
  END IF;

  room_count := (SELECT count(*) FROM public.games);
  second_game := public.create_game(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, NULL, 3);
  IF second_game IS DISTINCT FROM first_game
    OR (SELECT count(*) FROM public.games) <> room_count THEN
    RAISE EXCEPTION 'Retry must return the original room without adding a room';
  END IF;

  second_game := public.create_game(
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3, NULL, 3);
  IF second_game IS NOT DISTINCT FROM first_game THEN
    RAISE EXCEPTION 'Request IDs must be scoped to each user';
  END IF;

  protected_game := public.create_game(
    '11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 4, 'test-hash-fixture', 3);
  IF NOT EXISTS (SELECT 1 FROM public.games WHERE id = protected_game AND seat_count = 4)
    OR NOT EXISTS (SELECT 1 FROM public.game_passwords
      WHERE game_id = protected_game AND password_hash = 'test-hash-fixture') THEN
    RAISE EXCEPTION 'Protected creation must preserve the server-supplied hash';
  END IF;

  FOREACH invalid_count IN ARRAY ARRAY[1, 5, NULL]::integer[] LOOP
    BEGIN
      PERFORM public.create_game('11111111-1111-4111-8111-111111111111',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc', invalid_count, NULL, 3);
      RAISE EXCEPTION 'Invalid seat count was accepted';
    EXCEPTION WHEN check_violation OR not_null_violation THEN
      NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM public.create_game(NULL, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2, NULL, 3);
    RAISE EXCEPTION 'Missing creator was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Creator ID and request ID are required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_game('11111111-1111-4111-8111-111111111111', NULL, 2, NULL, 3);
    RAISE EXCEPTION 'Missing request ID was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Creator ID and request ID are required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_game('33333333-3333-4333-8333-333333333333',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2, NULL, 3);
    RAISE EXCEPTION 'Unknown creator was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END;
$$;
RESET ROLE;
\echo PASS: room creation, creator seat, optional hash, retry and invalid inputs

-- Force failure at the last insert, after room, seat and hash were written.
CREATE FUNCTION public.reject_test_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Injected request persistence failure';
END;
$$;
CREATE TRIGGER reject_test_request BEFORE INSERT ON public.game_creation_requests
FOR EACH ROW EXECUTE FUNCTION public.reject_test_request();
SET LOCAL ROLE service_role;
DO $$
DECLARE before_counts bigint[];
BEGIN
  before_counts := ARRAY[(SELECT count(*) FROM public.games),
    (SELECT count(*) FROM public.game_players),
    (SELECT count(*) FROM public.game_passwords),
    (SELECT count(*) FROM public.game_creation_requests)];
  BEGIN
    PERFORM public.create_game('11111111-1111-4111-8111-111111111111',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 3, 'rollback-hash-fixture', 3);
    RAISE EXCEPTION 'Injected failure was ignored';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Injected request persistence failure' THEN RAISE; END IF;
  END;
  IF before_counts IS DISTINCT FROM ARRAY[(SELECT count(*) FROM public.games),
    (SELECT count(*) FROM public.game_players),
    (SELECT count(*) FROM public.game_passwords),
    (SELECT count(*) FROM public.game_creation_requests)] THEN
    RAISE EXCEPTION 'Failure must roll back every creation record';
  END IF;
END;
$$;
RESET ROLE;
DROP TRIGGER reject_test_request ON public.game_creation_requests;
DROP FUNCTION public.reject_test_request();
\echo PASS: failure at final insert rolls back room, seat and hash

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['games', 'game_players', 'game_passwords', 'game_creation_requests'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class
      WHERE oid = ('public.' || table_name)::regclass) THEN
      RAISE EXCEPTION 'RLS must be enabled on %', table_name;
    END IF;
  END LOOP;
  IF (SELECT prosecdef FROM pg_proc
    WHERE oid = 'public.create_game(uuid,uuid,integer,text,integer)'::regprocedure) THEN
    RAISE EXCEPTION 'Creation must execute with caller privileges';
  END IF;
END;
$$;

-- Both roles have table privileges from the fixture: RLS must hide the rows.
SET LOCAL ROLE anon;
\ir create-game-client-denied.sql
RESET ROLE;
SET LOCAL ROLE authenticated;
\ir create-game-client-denied.sql
RESET ROLE;
\echo PASS: anon and authenticated cannot read creation rows or invoke creation
