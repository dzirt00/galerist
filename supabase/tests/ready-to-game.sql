-- Exercise the real SQL function as the trusted server role.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  room_id uuid;
  other_room_id uuid;
  first_user uuid := '11111111-1111-4111-8111-111111111111';
  second_user uuid := '22222222-2222-4222-8222-222222222222';
  outsider uuid := '33333333-3333-4333-8333-333333333333';
  absent_room uuid := '98989898-9898-4898-8898-989898989898';
  before_rows jsonb;
  result jsonb;
BEGIN
  room_id := public.create_game(first_user,
    '30303030-3030-4030-8030-303030303030', 3, NULL, 3);
  other_room_id := public.create_game(first_user,
    '40404040-4040-4040-8040-404040404040', 3, NULL, 3);
  PERFORM public.join_game(room_id, second_user);
  IF EXISTS (SELECT 1 FROM public.game_players
    WHERE game_id IN (room_id, other_room_id) AND is_ready IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'New participants must default to false';
  END IF;

  IF public.ready_to_game(room_id, first_user, true)
    IS DISTINCT FROM jsonb_build_object('isReady', true) THEN
    RAISE EXCEPTION 'Setting readiness must return confirmed JSON';
  END IF;
  IF (SELECT is_ready FROM public.game_players
      WHERE game_id = room_id AND user_id = first_user) IS DISTINCT FROM true
    OR (SELECT is_ready FROM public.game_players
      WHERE game_id = room_id AND user_id = second_user) IS DISTINCT FROM false
    OR (SELECT is_ready FROM public.game_players
      WHERE game_id = other_room_id AND user_id = first_user) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Readiness must update only the selected room/user pair';
  END IF;
  IF public.ready_to_game(room_id, first_user, true)
    IS DISTINCT FROM jsonb_build_object('isReady', true) THEN
    RAISE EXCEPTION 'Repeated readiness must return the same result';
  END IF;
  result := public.ready_to_game(room_id, first_user, false);
  IF result IS DISTINCT FROM jsonb_build_object('isReady', false)
    OR (SELECT is_ready FROM public.game_players
      WHERE game_id = room_id AND user_id = first_user) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'False must be accepted and persisted';
  END IF;

  SELECT jsonb_agg(to_jsonb(p) ORDER BY game_id, user_id)
    INTO before_rows FROM public.game_players p;
  BEGIN
    PERFORM public.ready_to_game(NULL, first_user, true);
    RAISE EXCEPTION 'TEST: null room accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.ready_to_game(room_id, NULL, true);
    RAISE EXCEPTION 'TEST: null user accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.ready_to_game(room_id, first_user, NULL);
    RAISE EXCEPTION 'TEST: null readiness accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.ready_to_game(absent_room, first_user, true);
    RAISE EXCEPTION 'TEST: missing room accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.ready_to_game(room_id, outsider, true);
    RAISE EXCEPTION 'TEST: nonmember accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  IF (SELECT jsonb_agg(to_jsonb(p) ORDER BY game_id, user_id)
    FROM public.game_players p) IS DISTINCT FROM before_rows THEN
    RAISE EXCEPTION 'Rejected calls must preserve participant rows';
  END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.ready_to_game(uuid,uuid,boolean)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.ready_to_game(uuid,uuid,boolean)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.ready_to_game(uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Readiness function must be executable only by server role';
  END IF;
END;
$$;
\echo PASS: readiness defaults, room/user isolation, true/false, retry, rejected inputs and server-only permissions
