-- WEB-009: real public SQL responses must identify the creator and each member.
INSERT INTO auth.users(id, raw_user_meta_data) VALUES
  ('90909090-1111-4111-8111-111111111111', '{"display_name":" Anna "}'),
  ('90909090-2222-4222-8222-222222222222', '{"display_name":"BORIS"}'),
  ('90909090-3333-4333-8333-333333333333', '{"display_name":"abcdefghijklmnopqrstuvwxyz1234"}');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  owner_id uuid := '90909090-1111-4111-8111-111111111111';
  member_id uuid := '90909090-2222-4222-8222-222222222222';
  outsider_id uuid := '90909090-3333-4333-8333-333333333333';
  room_id uuid;
  other_id uuid;
  joined jsonb;
  roster jsonb;
  expected jsonb;
BEGIN
  room_id := (public.create_game(owner_id, gen_random_uuid(), 3, NULL, 3)->>'gameId')::uuid;
  joined := public.join_game(room_id, member_id);
  IF joined->>'display_name' IS DISTINCT FROM 'anna'
    OR public.join_game(room_id, member_id) IS DISTINCT FROM joined
    OR public.get_own_lobby(room_id, owner_id)->>'display_name' IS DISTINCT FROM 'anna' THEN
    RAISE EXCEPTION 'Join/retry/restoration must retain the creator name, not the caller name';
  END IF;
  IF (SELECT display_name FROM public.get_game_list() WHERE id = room_id) IS DISTINCT FROM 'anna' THEN
    RAISE EXCEPTION 'List must expose the normalized creator name';
  END IF;
  expected := jsonb_build_array(
    jsonb_build_object('user_id', owner_id, 'is_ready', false, 'display_name', 'anna'),
    jsonb_build_object('user_id', member_id, 'is_ready', false, 'display_name', 'boris'));
  SELECT jsonb_agg(jsonb_build_object('user_id', p.user_id, 'is_ready', p.is_ready,
    'display_name', p.display_name) ORDER BY p.user_id) INTO roster
    FROM public.get_game_players(room_id, member_id) p;
  IF roster IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Roster must retain each member ID, readiness and their own normalized name: %', roster;
  END IF;
  PERFORM public.ready_to_game(room_id, member_id, true);
  IF NOT EXISTS (SELECT 1 FROM public.get_game_players(room_id, owner_id)
    WHERE user_id = member_id AND is_ready AND display_name = 'boris') THEN
    RAISE EXCEPTION 'Refresh must preserve the member name with changed readiness';
  END IF;
  BEGIN
    PERFORM public.get_game_players(room_id, outsider_id);
    RAISE EXCEPTION 'TEST: outsider could read member names';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  IF (SELECT count(*) FROM public.game_players WHERE game_id = room_id) <> 2 THEN
    RAISE EXCEPTION 'Reads and retries must not change membership';
  END IF;
  other_id := (public.create_game(outsider_id, gen_random_uuid(), 2, NULL, 3)->>'gameId')::uuid;
  IF (SELECT display_name FROM public.get_game_list() WHERE id = other_id)
    IS DISTINCT FROM 'abcdefghijklmnopqrstuvwxyz1234' THEN
    RAISE EXCEPTION 'List must retain a 30-character name and isolate room creators';
  END IF;
END; $$;
RESET ROLE;
\echo PASS: WEB-009 normalized creator/member names, 30-character name, retry, refresh and outsider denial
