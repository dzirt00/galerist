-- Read the real lobby roster through the server-only SQL entry point.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  room_id uuid;
  other_room_id uuid;
  first_user uuid := '11111111-1111-4111-8111-111111111111';
  second_user uuid := '22222222-2222-4222-8222-222222222222';
  outsider uuid := '33333333-3333-4333-8333-333333333333';
  absent_room uuid := '97979797-9797-4797-8797-979797979797';
  expected jsonb;
  result jsonb;
  before_rows jsonb;
BEGIN
  room_id := public.create_game(first_user,
    '50505050-5050-4050-8050-505050505050', 3, NULL, 3);
  other_room_id := public.create_game(first_user,
    '60606060-6060-4060-8060-606060606060', 2, NULL, 3);
  PERFORM public.join_game(room_id, second_user);
  PERFORM public.ready_to_game(room_id, first_user, true);
  expected := jsonb_build_array(
    jsonb_build_object('user_id', first_user, 'is_ready', true),
    jsonb_build_object('user_id', second_user, 'is_ready', false));
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.game_id, p.user_id)
    INTO before_rows FROM public.game_players p;

  -- WITH ORDINALITY records the order actually returned by the function.
  SELECT jsonb_agg(jsonb_build_object('user_id', p.user_id, 'is_ready', p.is_ready)
    ORDER BY p.ordinality) INTO result
    FROM public.get_game_players(room_id, first_user) WITH ORDINALITY AS p;
  IF result IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Creator must read the full roster with persisted readiness in user ID order';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('user_id', p.user_id, 'is_ready', p.is_ready)
    ORDER BY p.ordinality) INTO result
    FROM public.get_game_players(room_id, second_user) WITH ORDINALITY AS p;
  IF result IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Another participant must read the same roster, not just their own row';
  END IF;
  SELECT jsonb_agg(to_jsonb(p)) INTO result
    FROM public.get_game_players(other_room_id, first_user) p;
  IF result IS DISTINCT FROM jsonb_build_array(
    jsonb_build_object('user_id', first_user, 'is_ready', false)) THEN
    RAISE EXCEPTION 'A single-member room must not include memberships or readiness from another room';
  END IF;
  IF (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.game_id, p.user_id)
    FROM public.game_players p) IS DISTINCT FROM before_rows THEN
    RAISE EXCEPTION 'Reading the roster must preserve participant rows';
  END IF;

  PERFORM public.ready_to_game(room_id, first_user, false);
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.user_id) INTO result
    FROM public.get_game_players(room_id, second_user) p;
  IF result IS DISTINCT FROM jsonb_build_array(
    jsonb_build_object('user_id', first_user, 'is_ready', false),
    jsonb_build_object('user_id', second_user, 'is_ready', false)) THEN
    RAISE EXCEPTION 'A fresh read by another member must see withdrawn readiness';
  END IF;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.game_id, p.user_id)
    INTO before_rows FROM public.game_players p;
  BEGIN
    PERFORM public.get_game_players(NULL, first_user);
    RAISE EXCEPTION 'TEST: null room accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.get_game_players(room_id, NULL);
    RAISE EXCEPTION 'TEST: null user accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.get_game_players(absent_room, first_user);
    RAISE EXCEPTION 'TEST: missing room accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.get_game_players(room_id, outsider);
    RAISE EXCEPTION 'TEST: outsider accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.get_game_players(other_room_id, second_user);
    RAISE EXCEPTION 'TEST: membership in another room granted access';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  IF (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.game_id, p.user_id)
    FROM public.game_players p) IS DISTINCT FROM before_rows THEN
    RAISE EXCEPTION 'Rejected roster reads must preserve participant rows';
  END IF;
END;
$$;
RESET ROLE;

-- Exercise actual denied calls for both client roles.
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM public.get_game_players('97979797-9797-4797-8797-979797979797',
    '11111111-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'TEST: anonymous client could call roster function';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END; $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.get_game_players('97979797-9797-4797-8797-979797979797',
    '11111111-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'TEST: authenticated client could call roster function';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END; $$;
RESET ROLE;
\echo PASS: lobby roster, persisted readiness and refresh, room isolation, order, rejected inputs, unchanged rows and client execution denied
