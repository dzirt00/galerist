-- Real SQL command and DELETE trigger; no real Realtime socket delivery.
INSERT INTO auth.users(id) VALUES
  ('98000000-0000-4000-8000-000000000001'),
  ('98000000-0000-4000-8000-000000000002'),
  ('98000000-0000-4000-8000-000000000003');
CREATE FUNCTION public.expect_remove_error_fixture(command text, expected_state text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
  BEGIN
    EXECUTE command;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
  END;
  IF actual_state IS DISTINCT FROM expected_state THEN
    RAISE EXCEPTION 'Expected SQLSTATE %, got % for %', expected_state, actual_state, command;
  END IF;
END; $$;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  owner_id uuid := '98000000-0000-4000-8000-000000000001';
  member_id uuid := '98000000-0000-4000-8000-000000000002';
  outsider_id uuid := '98000000-0000-4000-8000-000000000003';
  room uuid;
  foreign_room uuid;
  bot_b uuid;
  bot_c uuid;
  bot_d uuid;
  foreign_bot uuid;
  human_seat uuid;
  req uuid := gen_random_uuid();
  reply jsonb;
  args uuid[];
  i integer;
BEGIN
  room := (public.create_game(owner_id, gen_random_uuid(), 4, NULL, 3)->>'gameId')::uuid;
  PERFORM public.join_game(room, member_id);
  PERFORM public.ready_to_game(room, owner_id, true);
  bot_b := (public.add_bot(room, owner_id, gen_random_uuid())->>'seat_id')::uuid;
  bot_c := (public.add_bot(room, owner_id, gen_random_uuid())->>'seat_id')::uuid;
  foreign_room := (public.create_game(outsider_id, gen_random_uuid(), 2, NULL, 3)->>'gameId')::uuid;
  foreign_bot := (public.add_bot(foreign_room, outsider_id, gen_random_uuid())->>'seat_id')::uuid;
  SELECT seat_id INTO human_seat FROM public.game_players WHERE game_id = room AND user_id = member_id;
  PERFORM set_config('test.remove.room', room::text, true);
  PERFORM set_config('test.remove.bot', bot_c::text, true);
  FOR i IN 1..4 LOOP
    args := ARRAY[owner_id, room, req, bot_b];
    args[i] := NULL;
    PERFORM public.expect_remove_error_fixture(format('SELECT public.remove_player(%L,%L,%L,%L)',
      args[1], args[2], args[3], args[4]), '22023');
  END LOOP;
  PERFORM public.expect_remove_error_fixture(format('SELECT public.remove_player(%L,%L,%L,%L)',
    owner_id, gen_random_uuid(), req, bot_b), 'P0002');
  PERFORM public.expect_remove_error_fixture(format('SELECT public.remove_player(%L,%L,%L,%L)',
    member_id, room, req, bot_b), '42501');
  PERFORM public.expect_remove_error_fixture(format('SELECT public.remove_player(%L,%L,%L,%L)',
    outsider_id, room, req, bot_b), '42501');
  FOREACH human_seat IN ARRAY ARRAY[(SELECT seat_id FROM public.game_players WHERE game_id = room AND user_id = owner_id), foreign_bot, gen_random_uuid()] LOOP
    PERFORM public.expect_remove_error_fixture(format('SELECT public.remove_player(%L,%L,%L,%L)',
      owner_id, room, req, human_seat), 'P1002');
  END LOOP;
  IF (SELECT count(*) FROM public.game_players WHERE game_id = room) <> 4
    OR EXISTS (SELECT FROM public.player_removal_requests WHERE game_id = room) THEN
    RAISE EXCEPTION 'Rejected removals changed seats or persisted success';
  END IF;
  reply := public.remove_player(owner_id, room, req, bot_b);
  IF reply IS DISTINCT FROM jsonb_build_object('gameId', room)
    OR EXISTS (SELECT FROM public.game_players WHERE seat_id = bot_b)
    OR NOT EXISTS (SELECT FROM public.game_players WHERE seat_id = bot_c AND is_ready)
    OR NOT EXISTS (SELECT FROM public.game_players WHERE game_id = room AND user_id = owner_id AND is_ready)
    OR NOT EXISTS (SELECT FROM public.game_players WHERE game_id = room AND user_id = member_id)
    OR NOT EXISTS (SELECT FROM public.game_players WHERE seat_id = foreign_bot)
    OR (SELECT seat_count FROM public.games WHERE id = room) <> 4
    OR NOT EXISTS (SELECT FROM public.player_removal_requests WHERE game_id = room AND request_id = req
      AND user_id = owner_id AND seat_id = bot_b AND result = reply) THEN
    RAISE EXCEPTION 'Removal must persist exact reply/target and preserve other seats, readiness and capacity';
  END IF;
  bot_d := (public.add_bot(room, owner_id, gen_random_uuid())->>'seat_id')::uuid;
  IF public.remove_player(owner_id, room, req, bot_b) IS DISTINCT FROM reply THEN
    RAISE EXCEPTION 'Replay must return original result';
  END IF;
  PERFORM public.expect_remove_error_fixture(format('SELECT public.remove_player(%L,%L,%L,%L)',
    owner_id, room, req, bot_c), 'P1002');
  PERFORM public.expect_remove_error_fixture(format('SELECT public.remove_player(%L,%L,%L,%L)',
    owner_id, room, gen_random_uuid(), bot_b), 'P1002');
  -- Rights precede replay, including after the future transfer of ownership.
  UPDATE public.games SET creator_id = member_id WHERE id = room;
  PERFORM public.expect_remove_error_fixture(format('SELECT public.remove_player(%L,%L,%L,%L)',
    owner_id, room, req, bot_b), '42501');
  UPDATE public.games SET creator_id = owner_id WHERE id = room;
  FOREACH human_seat IN ARRAY ARRAY[bot_c, bot_d] LOOP
    IF NOT EXISTS (SELECT FROM public.game_players WHERE seat_id = human_seat) THEN
      RAISE EXCEPTION 'Old/mismatched request deleted another bot';
    END IF;
  END LOOP;
  UPDATE public.games SET status = 'GAME_STARTED' WHERE id = room;
  IF public.remove_player(owner_id, room, req, bot_b) IS DISTINCT FROM reply
    OR public.remove_player(owner_id, room, gen_random_uuid(), bot_c) IS DISTINCT FROM
      jsonb_build_object('code', 'LOBBY_NOT_OPEN', 'gameId', room) THEN
    RAISE EXCEPTION 'Started room must replay old result and reject new removal';
  END IF;
  UPDATE public.games SET status = 'CLOSED' WHERE id = room;
  IF public.remove_player(owner_id, room, gen_random_uuid(), bot_c)->>'code' IS DISTINCT FROM 'LOBBY_NOT_OPEN'
    OR (SELECT count(*) FROM public.player_removal_requests WHERE game_id = room) <> 1
    OR (SELECT count(*) FROM public.game_players WHERE game_id = room) <> 4 THEN
    RAISE EXCEPTION 'Closed room refusal must preserve seats/journal';
  END IF;
END; $$;
RESET ROLE;
DO $$ BEGIN
  -- Four initial seats, one readiness change, one removal, one replacement.
  IF (SELECT count(*) FROM realtime.messages WHERE topic = 'lobby:' || current_setting('test.remove.room')) <> 7
    OR EXISTS (SELECT FROM realtime.messages WHERE topic = 'lobby:' || current_setting('test.remove.room')
      AND (payload IS DISTINCT FROM '{}'::jsonb OR private IS DISTINCT FROM true
        OR event IS DISTINCT FROM 'data is changed')) THEN
    RAISE EXCEPTION 'Removal must send one empty private signal; retries/refusals send none';
  END IF;
END; $$;
CREATE FUNCTION public.reject_remove_result_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'forced journal failure' USING ERRCODE = 'P9001'; END; $$;
CREATE TRIGGER reject_remove_result_fixture BEFORE INSERT ON public.player_removal_requests
FOR EACH ROW EXECUTE FUNCTION public.reject_remove_result_fixture();
DO $$
DECLARE signals_before bigint; room uuid := current_setting('test.remove.room')::uuid;
BEGIN
  UPDATE public.games SET status = 'OPEN_LOBBY' WHERE id = room;
  SELECT count(*) INTO signals_before FROM realtime.messages;
  SET LOCAL ROLE service_role;
  PERFORM public.expect_remove_error_fixture(format('SELECT public.remove_player(%L,%L,%L,%L)',
    '98000000-0000-4000-8000-000000000001', room, gen_random_uuid(), current_setting('test.remove.bot')), 'P9001');
  RESET ROLE;
  IF NOT EXISTS (SELECT FROM public.game_players WHERE seat_id = current_setting('test.remove.bot')::uuid)
    OR (SELECT count(*) FROM realtime.messages) <> signals_before
    OR (SELECT count(*) FROM public.player_removal_requests WHERE game_id = room) <> 1 THEN
    RAISE EXCEPTION 'Journal failure must roll back bot deletion and signal';
  END IF;
END; $$;
DROP TRIGGER reject_remove_result_fixture ON public.player_removal_requests;
DROP FUNCTION public.reject_remove_result_fixture();
DO $$
DECLARE
  owner_id uuid := '98000000-0000-4000-8000-000000000001';
  member_id uuid := '98000000-0000-4000-8000-000000000002';
  room uuid := current_setting('test.remove.room')::uuid;
  old_seat uuid;
  new_seat uuid;
  req uuid := gen_random_uuid();
  reply jsonb;
  signals_before bigint;
BEGIN
  SELECT seat_id INTO STRICT old_seat FROM public.game_players WHERE game_id = room AND user_id = member_id;
  SELECT count(*) INTO signals_before FROM realtime.messages;
  SET LOCAL ROLE service_role;
  reply := public.remove_player(owner_id, room, req, old_seat);
  IF reply IS DISTINCT FROM jsonb_build_object('gameId', room)
    OR EXISTS (SELECT FROM public.game_players WHERE seat_id = old_seat)
    OR NOT EXISTS (SELECT FROM public.game_players WHERE game_id = room AND user_id = owner_id AND is_ready) THEN
    RAISE EXCEPTION 'Human removal must remove exact member and preserve owner';
  END IF;
  PERFORM public.expect_remove_error_fixture(format('SELECT public.get_game_players(%L,%L)', room, member_id), 'P0002');
  PERFORM public.expect_remove_error_fixture(format('SELECT public.ready_to_game(%L,%L,true)', room, member_id), 'P0002');
  PERFORM public.join_game(room, member_id);
  SELECT seat_id INTO STRICT new_seat FROM public.game_players WHERE game_id = room AND user_id = member_id;
  IF new_seat = old_seat OR public.remove_player(owner_id, room, req, old_seat) IS DISTINCT FROM reply
    OR NOT EXISTS (SELECT FROM public.game_players WHERE seat_id = new_seat) THEN
    RAISE EXCEPTION 'Replay after rejoin must preserve new human seat';
  END IF;
  PERFORM public.expect_remove_error_fixture(format('SELECT public.remove_player(%L,%L,%L,%L)', owner_id, room, req, new_seat), 'P1002');
  RESET ROLE;
  IF (SELECT count(*) FROM realtime.messages) <> signals_before + 2 THEN
    RAISE EXCEPTION 'Human removal and rejoin must each signal once; replay must not signal';
  END IF;
END; $$;
DROP FUNCTION public.expect_remove_error_fixture(text,text);
DO $$
DECLARE client_role text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.player_removal_requests'::regclass)
    OR NOT has_function_privilege('service_role', 'public.remove_player(uuid,uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Removal journal needs RLS and server must have command access';
  END IF;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(client_role, 'public.remove_player(uuid,uuid,uuid,uuid)', 'EXECUTE')
      OR has_table_privilege(client_role, 'public.player_removal_requests', 'SELECT')
      OR has_table_privilege(client_role, 'public.player_removal_requests', 'INSERT')
      OR has_table_privilege(client_role, 'public.player_removal_requests', 'UPDATE')
      OR has_table_privilege(client_role, 'public.player_removal_requests', 'DELETE') THEN
      RAISE EXCEPTION 'Client access to removal command/journal must be closed';
    END IF;
  END LOOP;
END; $$;
SELECT 'PASS: remove_player human/bot targets, owner protection, access revocation, replay/rejoin, statuses, rollback, private signal and server-only journal';
