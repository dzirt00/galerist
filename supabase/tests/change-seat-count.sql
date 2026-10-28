-- Exercise capacity changes through the server-only SQL entry point.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  room_id uuid;
  other_room_id uuid;
  first_user uuid := '11111111-1111-4111-8111-111111111111';
  second_user uuid := '22222222-2222-4222-8222-222222222222';
  outsider uuid := '33333333-3333-4333-8333-333333333333';
  absent_room uuid := '96969696-9696-4696-8696-969696969696';
  before_players jsonb;
  before_games jsonb;
  result jsonb;
  requested integer;
BEGIN
  room_id := public.create_game(first_user,
    '70707070-7070-4070-8070-707070707070', 3, NULL, 3);
  other_room_id := public.create_game(first_user,
    '80808080-8080-4080-8080-808080808080', 4, NULL, 3);
  PERFORM public.join_game(room_id, second_user);
  PERFORM public.ready_to_game(room_id, first_user, true);
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.game_id, p.user_id)
    INTO before_players FROM public.game_players p;

  -- Exact occupancy is allowed; increases and repeated values are safe.
  FOREACH requested IN ARRAY ARRAY[2, 2, 4, 3] LOOP
    result := public.change_settings_game(room_id, first_user, requested, 3);
    IF result IS DISTINCT FROM jsonb_build_object('seat_count', requested, 'turn_duration_minutes', 3)
      OR (SELECT seat_count FROM public.games WHERE id = room_id) IS DISTINCT FROM requested THEN
      RAISE EXCEPTION 'Capacity change must persist and return the requested total';
    END IF;
  END LOOP;
  IF (SELECT seat_count FROM public.games WHERE id = other_room_id) <> 4 THEN
    RAISE EXCEPTION 'Changing capacity must not affect another room';
  END IF;
  IF (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.game_id, p.user_id) FROM public.game_players p)
    IS DISTINCT FROM before_players THEN
    RAISE EXCEPTION 'Capacity changes and retries must preserve all participant rows';
  END IF;

  SELECT jsonb_agg(to_jsonb(g) ORDER BY g.id) INTO before_games FROM public.games g;
  -- A noncreator must be rejected even when requesting the current value.
  FOREACH requested IN ARRAY ARRAY[2, 3, 4] LOOP
    BEGIN
      PERFORM public.change_settings_game(room_id, second_user, requested, 3);
      RAISE EXCEPTION 'TEST: noncreator participant accepted';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM public.change_settings_game(room_id, outsider, 4, 3);
    RAISE EXCEPTION 'TEST: outsider accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.change_settings_game(NULL, first_user, 3, 3);
    RAISE EXCEPTION 'TEST: null room accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.change_settings_game(room_id, NULL, 3, 3);
    RAISE EXCEPTION 'TEST: null user accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.change_settings_game(absent_room, first_user, 3, 3);
    RAISE EXCEPTION 'TEST: missing room accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  FOREACH requested IN ARRAY ARRAY[NULL, -1, 0, 1, 5, 2147483647] LOOP
    BEGIN
      PERFORM public.change_settings_game(room_id, first_user, requested, 3);
      RAISE EXCEPTION 'TEST: invalid capacity accepted';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
  END LOOP;
  IF (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.id) FROM public.games g)
    IS DISTINCT FROM before_games THEN
    RAISE EXCEPTION 'Rejected requests must preserve all room rows';
  END IF;

  PERFORM public.join_game(room_id, outsider);
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.game_id, p.user_id)
    INTO before_players FROM public.game_players p;
  BEGIN
    PERFORM public.change_settings_game(room_id, first_user, 2, 3);
    RAISE EXCEPTION 'TEST: capacity below occupancy accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  IF (SELECT seat_count FROM public.games WHERE id = room_id) <> 3
    OR (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.game_id, p.user_id) FROM public.game_players p)
      IS DISTINCT FROM before_players THEN
    RAISE EXCEPTION 'Rejected shrink must preserve capacity, membership and readiness';
  END IF;
  PERFORM public.change_settings_game(room_id, first_user, 4, 3);
  IF (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.game_id, p.user_id) FROM public.game_players p)
    IS DISTINCT FROM before_players THEN
    RAISE EXCEPTION 'Successful changes must preserve membership and readiness';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM public.change_settings_game('96969696-9696-4696-8696-969696969696',
    '11111111-1111-4111-8111-111111111111', 3, 3);
  RAISE EXCEPTION 'TEST: anonymous client could change capacity';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END; $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.change_settings_game('96969696-9696-4696-8696-969696969696',
    '11111111-1111-4111-8111-111111111111', 3, 3);
  RAISE EXCEPTION 'TEST: authenticated client could change capacity';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END; $$;
RESET ROLE;
\echo PASS: capacity changes, exact occupancy, retries, owner checks, invalid inputs, isolation, unchanged memberships/readiness and client execution denied
