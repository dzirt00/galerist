-- Real SQL command/trigger; realtime.send captures arguments without socket delivery.
INSERT INTO auth.users(id) VALUES
  ('97000000-0000-4000-8000-000000000001'),
  ('97000000-0000-4000-8000-000000000002'),
  ('97000000-0000-4000-8000-000000000003');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  owner_id uuid := '97000000-0000-4000-8000-000000000001';
  member_id uuid := '97000000-0000-4000-8000-000000000002';
  outsider_id uuid := '97000000-0000-4000-8000-000000000003';
  room uuid;
  req uuid := gen_random_uuid();
  fresh_req uuid := gen_random_uuid();
  reply jsonb;
  new_seat uuid;
BEGIN
  room := (public.create_game(owner_id, gen_random_uuid(), 3, NULL, 3)->>'gameId')::uuid;
  PERFORM public.join_game(room, member_id);
  PERFORM public.ready_to_game(room, owner_id, true);
  PERFORM public.add_bot(room, owner_id, gen_random_uuid());
  PERFORM set_config('test.leave.room', room::text, true);
  PERFORM set_config('test.leave.request', req::text, true);
  BEGIN
    PERFORM public.leave_game(NULL, member_id, req);
    RAISE EXCEPTION 'TEST: NULL room accepted' USING ERRCODE = 'P9999';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.leave_game(room, NULL, req);
    RAISE EXCEPTION 'TEST: NULL user accepted' USING ERRCODE = 'P9999';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.leave_game(room, member_id, NULL);
    RAISE EXCEPTION 'TEST: NULL request accepted' USING ERRCODE = 'P9999';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.leave_game(gen_random_uuid(), member_id, req);
    RAISE EXCEPTION 'TEST: missing room accepted' USING ERRCODE = 'P9999';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.leave_game(room, owner_id, req);
    RAISE EXCEPTION 'TEST: creator left' USING ERRCODE = 'P9999';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.leave_game(room, outsider_id, req);
    RAISE EXCEPTION 'TEST: outsider succeeded' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P1002' THEN NULL; END;
  IF EXISTS (SELECT FROM public.leave_game_requests WHERE game_id = room)
    OR (SELECT count(*) FROM public.game_players WHERE game_id = room) <> 3 THEN
    RAISE EXCEPTION 'Rejected commands changed seats or stored success';
  END IF;
  reply := public.leave_game(room, member_id, req);
  IF reply IS DISTINCT FROM jsonb_build_object('gameId', room)
    OR (SELECT count(*) FROM public.game_players WHERE game_id = room) <> 2
    OR EXISTS (SELECT FROM public.game_players WHERE game_id = room AND user_id = member_id)
    OR NOT EXISTS (SELECT FROM public.game_players WHERE game_id = room AND user_id = owner_id AND is_ready)
    OR NOT EXISTS (SELECT FROM public.game_players WHERE game_id = room AND is_bot AND is_ready)
    OR (SELECT count(*) FROM public.leave_game_requests WHERE game_id = room) <> 1
    OR NOT EXISTS (SELECT FROM public.leave_game_requests WHERE game_id = room
      AND user_id = member_id AND request_id = req AND result = reply) THEN
    RAISE EXCEPTION 'Exit must delete only the caller and persist its exact safe reply';
  END IF;
  IF public.leave_game(room, member_id, req) IS DISTINCT FROM reply THEN
    RAISE EXCEPTION 'Replay after deletion must return original success';
  END IF;
  BEGIN
    PERFORM public.get_game_players(room, member_id);
    RAISE EXCEPTION 'TEST: departed member read roster' USING ERRCODE = 'P9999';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.ready_to_game(room, member_id, true);
    RAISE EXCEPTION 'TEST: departed member changed readiness' USING ERRCODE = 'P9999';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  PERFORM public.join_game(room, member_id);
  SELECT seat_id INTO new_seat FROM public.game_players WHERE game_id = room AND user_id = member_id;
  PERFORM public.leave_game(room, member_id, req);
  IF NOT EXISTS (SELECT FROM public.game_players WHERE seat_id = new_seat) THEN
    RAISE EXCEPTION 'Old replay deleted a newly joined seat';
  END IF;
  UPDATE public.games SET status = 'GAME_STARTED' WHERE id = room;
  IF public.leave_game(room, member_id, req) IS DISTINCT FROM reply
    OR public.leave_game(room, member_id, fresh_req) IS DISTINCT FROM
      jsonb_build_object('code', 'LOBBY_NOT_OPEN', 'gameId', room) THEN
    RAISE EXCEPTION 'Started room must replay old success but reject new exit';
  END IF;
  UPDATE public.games SET status = 'CLOSED' WHERE id = room;
  IF public.leave_game(room, member_id, fresh_req)->>'code' IS DISTINCT FROM 'LOBBY_NOT_OPEN'
    OR NOT EXISTS (SELECT FROM public.game_players WHERE seat_id = new_seat)
    OR EXISTS (SELECT FROM public.leave_game_requests WHERE game_id = room AND request_id = fresh_req) THEN
    RAISE EXCEPTION 'Rejected exit must preserve seat and request journal';
  END IF;
END; $$;
RESET ROLE;
DO $$ BEGIN
  -- Initial owner/member/bot INSERTs, owner readiness, one DELETE, one rejoin.
  IF (SELECT count(*) FROM realtime.messages
      WHERE topic = 'lobby:' || current_setting('test.leave.room')) <> 6
    OR EXISTS (SELECT FROM realtime.messages
      WHERE topic = 'lobby:' || current_setting('test.leave.room')
      AND (payload IS DISTINCT FROM '{}'::jsonb OR private IS DISTINCT FROM true
        OR event IS DISTINCT FROM 'data is changed')) THEN
    RAISE EXCEPTION 'Exit sends exactly one empty private signal; retries/refusals send none';
  END IF;
END; $$;
-- Fail result persistence after deletion: seat and signal must roll back too.
CREATE FUNCTION public.reject_leave_result_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'forced journal failure' USING ERRCODE = 'P9001'; END; $$;
CREATE TRIGGER reject_leave_result_fixture BEFORE INSERT ON public.leave_game_requests
  FOR EACH ROW EXECUTE FUNCTION public.reject_leave_result_fixture();
DO $$
DECLARE
  room uuid := current_setting('test.leave.room')::uuid;
  before_signals bigint;
BEGIN
  UPDATE public.games SET status = 'OPEN_LOBBY' WHERE id = room;
  SELECT count(*) INTO before_signals FROM realtime.messages;
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.leave_game(room, '97000000-0000-4000-8000-000000000002', gen_random_uuid());
    RAISE EXCEPTION 'TEST: forced failure not reached' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL; END;
  RESET ROLE;
  IF NOT EXISTS (SELECT FROM public.game_players WHERE game_id = room
      AND user_id = '97000000-0000-4000-8000-000000000002')
    OR (SELECT count(*) FROM realtime.messages) <> before_signals
    OR (SELECT count(*) FROM public.leave_game_requests WHERE game_id = room) <> 1 THEN
    RAISE EXCEPTION 'Journal failure must roll back deletion and signal';
  END IF;
END; $$;
DROP TRIGGER reject_leave_result_fixture ON public.leave_game_requests;
DROP FUNCTION public.reject_leave_result_fixture();
DO $$
DECLARE client_role text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.leave_game_requests'::regclass) THEN
    RAISE EXCEPTION 'Exit journal needs RLS';
  END IF;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(client_role, 'public.leave_game(uuid,uuid,uuid)', 'EXECUTE')
      OR has_table_privilege(client_role, 'public.leave_game_requests', 'SELECT')
      OR has_table_privilege(client_role, 'public.leave_game_requests', 'INSERT')
      OR has_table_privilege(client_role, 'public.leave_game_requests', 'UPDATE')
      OR has_table_privilege(client_role, 'public.leave_game_requests', 'DELETE') THEN
      RAISE EXCEPTION 'Client access to exit command/journal must be closed';
    END IF;
  END LOOP;
END; $$;
SELECT 'PASS: leave_game authorization, replay/rejoin, statuses, atomic rollback, private signal and server-only journal';
