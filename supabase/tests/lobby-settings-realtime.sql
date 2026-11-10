-- Real SQL commands and trigger; realtime.send captures messages in a SQL fixture.
DO $$
DECLARE
  owner_id uuid := '11111111-1111-4111-8111-111111111111';
  member_id uuid := '22222222-2222-4222-8222-222222222222';
  outsider_id uuid := '33333333-3333-4333-8333-333333333333';
  room_id uuid;
  room_topic text;
  baseline bigint;
  roster jsonb;
BEGIN
  room_id := (public.create_game(owner_id, gen_random_uuid(), 3, NULL, 3)->>'gameId')::uuid;
  PERFORM public.join_game(room_id, member_id);
  room_topic := 'lobby:' || room_id::text;
  SELECT count(*) INTO baseline FROM realtime.messages WHERE topic = room_topic;
  IF baseline <> 2 THEN
    RAISE EXCEPTION 'Creation/join must only send the two existing membership signals';
  END IF;
  PERFORM public.change_settings_game(room_id, owner_id, 4, 5);
  PERFORM public.change_settings_game(room_id, owner_id, 4, 5);
  IF (SELECT count(*) FROM realtime.messages WHERE topic = room_topic) <> baseline + 1 THEN
    RAISE EXCEPTION 'Combined settings change must send one signal; retry must send none';
  END IF;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.user_id) INTO roster
    FROM public.get_game_players(room_id, member_id) p;
  IF jsonb_array_length(roster) <> 2 OR EXISTS (
    SELECT FROM jsonb_array_elements(roster) row
    WHERE (row->>'seat_count')::integer IS DISTINCT FROM 4
      OR (row->>'turn_duration_minutes')::integer IS DISTINCT FROM 5
      OR row->>'display_name' IS NULL
  ) THEN
    RAISE EXCEPTION 'Another participant must read the saved settings with the full named roster';
  END IF;
  PERFORM public.change_settings_game(room_id, owner_id, 3, 5);
  PERFORM public.change_settings_game(room_id, owner_id, 3, 7);
  IF (SELECT count(*) FROM realtime.messages WHERE topic = room_topic) <> baseline + 3 THEN
    RAISE EXCEPTION 'Capacity-only and duration-only changes must each send a signal';
  END IF;
  IF EXISTS (SELECT FROM realtime.messages WHERE topic = room_topic
    AND (event IS DISTINCT FROM 'data is changed' OR payload IS DISTINCT FROM '{}'::jsonb
      OR private IS DISTINCT FROM true OR extension IS DISTINCT FROM 'broadcast')) THEN
    RAISE EXCEPTION 'Settings must use the existing empty private lobby signal';
  END IF;
  BEGIN
    PERFORM public.change_settings_game(room_id, member_id, 4, 9);
    RAISE EXCEPTION 'TEST: participant changed settings';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.get_game_players(room_id, outsider_id);
    RAISE EXCEPTION 'TEST: outsider read settings';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.change_settings_game(room_id, owner_id, 4, 9);
    RAISE EXCEPTION 'force rollback' USING ERRCODE = 'P0004';
  EXCEPTION WHEN assert_failure THEN NULL; END;
  IF (SELECT count(*) FROM realtime.messages WHERE topic = room_topic) <> baseline + 3
    OR EXISTS (SELECT FROM public.get_game_players(room_id, member_id)
      WHERE seat_count IS DISTINCT FROM 3 OR turn_duration_minutes IS DISTINCT FROM 7) THEN
    RAISE EXCEPTION 'Refusal/rollback must preserve saved settings and leave no signal';
  END IF;
END; $$;
\echo PASS: settings signal, retry, single-field changes, rollback and protected roster with saved settings (SQL fixture only)
