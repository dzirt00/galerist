-- Uses the real migration and privileges in disposable PostgreSQL.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  room_id uuid;
  protected_id uuid;
  result jsonb;
  repeated jsonb;
  invalid_user uuid;
BEGIN
  room_id := public.create_game('11111111-1111-4111-8111-111111111111',
    '10101010-1010-4010-8010-101010101010', 2, NULL, 3);
  result := public.join_game(room_id, '22222222-2222-4222-8222-222222222222');
  IF result IS DISTINCT FROM jsonb_build_object('id', room_id, 'seat_count', 2,
    'occupiedSeatCount', 2, 'hasPassword', false)
    OR (SELECT count(*) FROM public.game_players WHERE game_id = room_id) <> 2 THEN
    RAISE EXCEPTION 'Join must persist new member and return confirmed count';
  END IF;
  repeated := public.join_game(room_id, '22222222-2222-4222-8222-222222222222');
  IF repeated IS DISTINCT FROM result OR
    (SELECT count(*) FROM public.game_players WHERE game_id = room_id) <> 2 THEN
    RAISE EXCEPTION 'Retry in full room must succeed without inserting again';
  END IF;
  BEGIN
    PERFORM public.join_game(room_id, '33333333-3333-4333-8333-333333333333');
    RAISE EXCEPTION 'TEST: full room accepted';
  EXCEPTION WHEN SQLSTATE 'P1002' THEN NULL;
  END;
  BEGIN
    PERFORM public.join_game(room_id, NULL);
    RAISE EXCEPTION 'TEST: null user accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.join_game(NULL, '22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'TEST: null game accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.join_game('99999999-9999-4999-8999-999999999999',
      '22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'TEST: absent game accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  protected_id := public.create_game('11111111-1111-4111-8111-111111111111',
    '20202020-2020-4020-8020-202020202020', 3, 'opaque-test-hash', 3);
  result := public.join_game(protected_id, '11111111-1111-4111-8111-111111111111');
  IF result IS DISTINCT FROM jsonb_build_object('id', protected_id, 'seat_count', 3,
    'occupiedSeatCount', 1, 'hasPassword', true) THEN
    RAISE EXCEPTION 'Existing protected member must get boolean password flag';
  END IF;
  BEGIN
    PERFORM public.join_game(protected_id, '22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'TEST: missing proof accepted';
  EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL;
  END;
  BEGIN
    PERFORM public.join_game(protected_id, '22222222-2222-4222-8222-222222222222', 'stale-proof');
    RAISE EXCEPTION 'TEST: stale proof accepted';
  EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL;
  END;
  IF (SELECT count(*) FROM public.game_players WHERE game_id = protected_id) <> 1 THEN
    RAISE EXCEPTION 'Rejected join changed membership';
  END IF;
  -- Unknown profile fails at FK without leaving a partial member.
  BEGIN
    PERFORM public.join_game(protected_id, '99999999-9999-4999-8999-999999999999', 'opaque-test-hash');
    RAISE EXCEPTION 'TEST: unknown profile accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  result := public.join_game(protected_id, '22222222-2222-4222-8222-222222222222', 'opaque-test-hash');
  IF (result->>'occupiedSeatCount')::int <> 2 OR result ? 'password_hash' THEN
    RAISE EXCEPTION 'Verified protected join must add exactly one safe result';
  END IF;
END;
$$;
RESET ROLE;

-- Failure after INSERT must roll back the inserted membership.
CREATE FUNCTION public.fail_test_join() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'forced join failure'; END;
$$;
CREATE TRIGGER fail_test_join AFTER INSERT ON public.game_players
FOR EACH ROW EXECUTE FUNCTION public.fail_test_join();
SET LOCAL ROLE service_role;
DO $$
DECLARE room_id uuid; before_count bigint;
BEGIN
  SELECT game_id INTO room_id FROM public.game_creation_requests
  WHERE request_id = '20202020-2020-4020-8020-202020202020';
  SELECT count(*) INTO before_count FROM public.game_players WHERE game_id = room_id;
  BEGIN
    PERFORM public.join_game(room_id, '33333333-3333-4333-8333-333333333333', 'opaque-test-hash');
    RAISE EXCEPTION 'TEST: forced failure ignored';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forced join failure' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.game_players WHERE game_id = room_id) <> before_count THEN
    RAISE EXCEPTION 'Failure after insert left a partial member';
  END IF;
END;
$$;
RESET ROLE;
DROP TRIGGER fail_test_join ON public.game_players;
DROP FUNCTION public.fail_test_join();

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.join_game(uuid,uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.join_game(uuid,uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.join_game(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Join must be executable only by server role';
  END IF;
END;
$$;
\echo PASS: join, retries, full/missing rooms, password proof, rollback and server-only permissions