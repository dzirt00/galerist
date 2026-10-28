-- WEB-004: creation settings, actual PostgreSQL constraints and permissions.
DO $$
BEGIN
  IF to_regprocedure('public.create_game(uuid,uuid,integer,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Old creation signature must be removed';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.create_game(uuid,uuid,integer,text,integer)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.create_game(uuid,uuid,integer,text,integer)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.create_game(uuid,uuid,integer,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Only server role may invoke creation';
  END IF;
END; $$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  creator uuid := '11111111-1111-4111-8111-111111111111';
  request_id uuid := gen_random_uuid();
  room_id uuid;
  repeated_id uuid;
  minutes integer;
  before_counts bigint[];
BEGIN
  room_id := public.create_game(creator, request_id, 3, NULL, 7);
  repeated_id := public.create_game(creator, request_id, 4, NULL, 5);
  IF repeated_id <> room_id OR NOT EXISTS (
    SELECT 1 FROM public.games WHERE id = room_id AND turn_duration_minutes = 7 AND seat_count = 3
  ) THEN RAISE EXCEPTION 'Retry must retain original room and seven minutes'; END IF;
  FOREACH minutes IN ARRAY ARRAY[1, 10] LOOP
    room_id := public.create_game(creator, gen_random_uuid(), 2, NULL, minutes);
    IF (SELECT turn_duration_minutes FROM public.games WHERE id = room_id) <> minutes THEN
      RAISE EXCEPTION 'Boundary minutes must be saved';
    END IF;
  END LOOP;
  INSERT INTO public.games(creator_id, seat_count) VALUES (creator, 2) RETURNING id INTO room_id;
  IF (SELECT turn_duration_minutes FROM public.games WHERE id = room_id) <> 3 THEN
    RAISE EXCEPTION 'Default must be three minutes';
  END IF;
  before_counts := ARRAY[(SELECT count(*) FROM public.games),
    (SELECT count(*) FROM public.game_players), (SELECT count(*) FROM public.game_passwords),
    (SELECT count(*) FROM public.game_creation_requests)];
  FOREACH minutes IN ARRAY ARRAY[0, 11, NULL]::integer[] LOOP
    BEGIN
      PERFORM public.create_game(creator, gen_random_uuid(), 2, 'fixture-hash', minutes);
      RAISE EXCEPTION 'Invalid minutes accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'invalid turn_duration_minutes' THEN RAISE; END IF;
    WHEN not_null_violation THEN NULL;
    END;
    BEGIN
      INSERT INTO public.games(creator_id, seat_count, turn_duration_minutes) VALUES (creator, 2, minutes);
      RAISE EXCEPTION 'Table must reject invalid minutes';
    EXCEPTION WHEN check_violation OR not_null_violation THEN NULL;
    END;
    BEGIN
      UPDATE public.games SET turn_duration_minutes = minutes WHERE id = room_id;
      RAISE EXCEPTION 'Update must reject invalid minutes';
    EXCEPTION WHEN check_violation OR not_null_violation THEN NULL;
    END;
  END LOOP;
  IF before_counts IS DISTINCT FROM ARRAY[(SELECT count(*) FROM public.games),
    (SELECT count(*) FROM public.game_players), (SELECT count(*) FROM public.game_passwords),
    (SELECT count(*) FROM public.game_creation_requests)] THEN
    RAISE EXCEPTION 'Invalid minutes must leave all creation tables unchanged';
  END IF;
  IF (SELECT turn_duration_minutes FROM public.games WHERE id = room_id) <> 3 THEN
    RAISE EXCEPTION 'Rejected update must preserve setting';
  END IF;
END; $$;
RESET ROLE;
\echo PASS: timer defaults, boundaries, retry, constraints, rollback and server-only signature

-- Exercise the complete settings command, then read via both lobby paths.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  owner_id uuid := '11111111-1111-4111-8111-111111111111';
  member_id uuid := '22222222-2222-4222-8222-222222222222';
  room_id uuid;
  minutes integer;
  result jsonb;
  before_room jsonb;
  before_members jsonb;
BEGIN
  room_id := public.create_game(owner_id, gen_random_uuid(), 3, NULL, 3);
  PERFORM public.join_game(room_id, member_id);
  PERFORM public.ready_to_game(room_id, member_id, true);
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.user_id) INTO before_members
    FROM public.game_players p WHERE game_id = room_id;
  FOREACH minutes IN ARRAY ARRAY[7, 7, 1, 10] LOOP
    result := public.change_settings_game(room_id, owner_id, 3, minutes);
    IF result <> jsonb_build_object('seat_count', 3, 'turn_duration_minutes', minutes) THEN
      RAISE EXCEPTION 'Timer-only changes and repeats must return both settings';
    END IF;
    IF (public.join_game(room_id, member_id)->>'turnDurationMinutes')::integer <> minutes
      OR (SELECT "turnDurationMinutes" FROM public.get_game_list() WHERE id = room_id) <> minutes THEN
      RAISE EXCEPTION 'Join and list must return persisted timer';
    END IF;
  END LOOP;
  result := public.change_settings_game(room_id, owner_id, 4, 5);
  IF result <> jsonb_build_object('seat_count', 4, 'turn_duration_minutes', 5) THEN
    RAISE EXCEPTION 'Combined change must persist both settings';
  END IF;
  SELECT to_jsonb(g) INTO before_room FROM public.games g WHERE id = room_id;
  FOREACH minutes IN ARRAY ARRAY[NULL, 0, 11, -1]::integer[] LOOP
    BEGIN
      PERFORM public.change_settings_game(room_id, owner_id, 2, minutes);
      RAISE EXCEPTION 'TEST: invalid minutes accepted';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM public.change_settings_game(room_id, member_id, 4, 5);
    RAISE EXCEPTION 'TEST: nonowner no-op accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.change_settings_game(room_id, member_id, 2, 7);
    RAISE EXCEPTION 'TEST: nonowner change accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  IF (SELECT to_jsonb(g) FROM public.games g WHERE id = room_id) IS DISTINCT FROM before_room THEN
    RAISE EXCEPTION 'Rejected requests changed room settings';
  END IF;
  PERFORM public.join_game(room_id, '33333333-3333-4333-8333-333333333333');
  BEGIN
    PERFORM public.change_settings_game(room_id, owner_id, 2, 9);
    RAISE EXCEPTION 'TEST: overfilled capacity accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  IF (SELECT to_jsonb(g) FROM public.games g WHERE id = room_id) IS DISTINCT FROM before_room THEN
    RAISE EXCEPTION 'Rejected shrink must also preserve timer';
  END IF;
  IF (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.user_id) FROM public.game_players p
      WHERE game_id = room_id AND user_id IN (owner_id, member_id)) IS DISTINCT FROM before_members THEN
    RAISE EXCEPTION 'Settings must preserve readiness and memberships';
  END IF;
END; $$;
RESET ROLE;
\echo PASS: timer-only/combined settings, retry, join/list reads, owner checks and atomic refusals
