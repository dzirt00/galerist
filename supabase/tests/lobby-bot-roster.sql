-- Exercise the protected roster after real bot additions, with unrelated profiles present.
INSERT INTO auth.users(id, raw_user_meta_data) VALUES
  ('96000000-0000-4000-8000-000000000001', '{"display_name":"roster-owner"}'),
  ('96000000-0000-4000-8000-000000000002', '{"display_name":"roster-member"}'),
  ('96000000-0000-4000-8000-000000000003', '{"display_name":"roster-outsider"}');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  owner_id uuid := '96000000-0000-4000-8000-000000000001';
  member_id uuid := '96000000-0000-4000-8000-000000000002';
  outsider_id uuid := '96000000-0000-4000-8000-000000000003';
  room_id uuid;
  other_room uuid;
  bot_one uuid;
  bot_two uuid;
  actual jsonb;
  expected_seats uuid[];
  before_rows jsonb;
BEGIN
  room_id := (public.create_game(owner_id, gen_random_uuid(), 4, NULL, 7)->>'gameId')::uuid;
  PERFORM public.join_game(room_id, member_id);
  PERFORM public.ready_to_game(room_id, member_id, true);
  bot_one := (public.add_bot(room_id, owner_id, gen_random_uuid())->>'seat_id')::uuid;
  bot_two := (public.add_bot(room_id, owner_id, gen_random_uuid())->>'seat_id')::uuid;
  other_room := (public.create_game(outsider_id, gen_random_uuid(), 2, NULL, 3)->>'gameId')::uuid;
  PERFORM public.add_bot(other_room, outsider_id, gen_random_uuid());
  expected_seats := ARRAY[
    (SELECT seat_id FROM public.game_players WHERE game_id = room_id AND user_id = owner_id),
    (SELECT seat_id FROM public.game_players WHERE game_id = room_id AND user_id = member_id),
    LEAST(bot_one, bot_two), GREATEST(bot_one, bot_two)];
  SELECT jsonb_agg(to_jsonb(gp) ORDER BY gp.seat_id) INTO before_rows FROM public.game_players gp;

  SELECT jsonb_agg(to_jsonb(p) - 'ordinality' ORDER BY p.ordinality) INTO actual
    FROM public.get_game_players(room_id, owner_id) WITH ORDINALITY p;
  IF jsonb_array_length(actual) <> 4
    OR (SELECT array_agg(p.seat_id ORDER BY p.ordinality)
      FROM public.get_game_players(room_id, member_id) WITH ORDINALITY p) IS DISTINCT FROM expected_seats
    OR (SELECT count(DISTINCT seat_id) FROM public.get_game_players(room_id, owner_id)) <> 4 THEN
    RAISE EXCEPTION 'Both humans must read exactly four distinct seats, humans then bots in stable order';
  END IF;
  IF actual->0->>'display_name' <> 'roster-owner'
    OR actual->1->>'display_name' <> 'roster-member'
    OR actual->0->>'user_id' <> owner_id::text OR actual->1->>'user_id' <> member_id::text
    OR actual->0->'is_ready' <> 'false'::jsonb OR actual->1->'is_ready' <> 'true'::jsonb
    OR actual->0->'is_bot' <> 'false'::jsonb OR actual->1->'is_bot' <> 'false'::jsonb THEN
    RAISE EXCEPTION 'Human profiles and persisted readiness must be preserved';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(actual) WITH ORDINALITY AS e(row, position)
    WHERE (row->>'seat_count')::integer IS DISTINCT FROM 4
      OR (row->>'turn_duration_minutes')::integer IS DISTINCT FROM 7
      OR (SELECT count(*) FROM jsonb_object_keys(row)) <> 7
      OR (position > 2 AND (row->'user_id' IS DISTINCT FROM 'null'::jsonb
        OR row->'display_name' IS DISTINCT FROM 'null'::jsonb
        OR row->'is_bot' IS DISTINCT FROM 'true'::jsonb
        OR row->'is_ready' IS DISTINCT FROM 'false'::jsonb))) THEN
    RAISE EXCEPTION 'Bots must have null profile/name, with correct seat fields and saved room settings';
  END IF;
  IF (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.user_id, p.seat_id)
      FROM public.get_game_players(room_id, member_id) p) IS DISTINCT FROM actual THEN
    RAISE EXCEPTION 'Members and repeated reads must return the same full roster';
  END IF;
  BEGIN
    PERFORM public.get_game_players(room_id, outsider_id);
    RAISE EXCEPTION 'TEST: outsider read bot roster';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.get_game_players(room_id, bot_one);
    RAISE EXCEPTION 'TEST: seat ID granted access as a user';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.get_game_players(room_id, NULL);
    RAISE EXCEPTION 'TEST: null user read bot roster';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT jsonb_agg(to_jsonb(gp) ORDER BY gp.seat_id) FROM public.game_players gp)
    IS DISTINCT FROM before_rows THEN
    RAISE EXCEPTION 'Successful and rejected roster reads must not mutate seats';
  END IF;
END;
$$;
RESET ROLE;
SELECT 'PASS: protected mixed roster, null bot profiles, unique stable seats, room isolation and read-only access';
