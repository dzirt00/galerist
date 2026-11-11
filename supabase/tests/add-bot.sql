-- Public SQL command: authorization, durable replay, atomicity and private signal.
INSERT INTO auth.users(id) VALUES
  ('94000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000002'),
  ('94000000-0000-4000-8000-000000000003');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  owner_id uuid := '94000000-0000-4000-8000-000000000001';
  member_id uuid := '94000000-0000-4000-8000-000000000002';
  outsider_id uuid := '94000000-0000-4000-8000-000000000003';
  request_one uuid := '95000000-0000-4000-8000-000000000001';
  request_two uuid := '95000000-0000-4000-8000-000000000002';
  room_id uuid;
  other_room uuid;
  reply jsonb;
  second_reply jsonb;
  human_seat uuid;
BEGIN
  room_id := (public.create_game(owner_id, gen_random_uuid(), 3, NULL, 3)->>'gameId')::uuid;
  PERFORM public.join_game(room_id, member_id);
  SELECT seat_id INTO human_seat FROM public.game_players
    WHERE game_id = room_id AND user_id = owner_id;

  BEGIN
    PERFORM public.add_bot(room_id, member_id, request_one);
    RAISE EXCEPTION 'TEST: ordinary member added bot';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.add_bot(room_id, outsider_id, request_one);
    RAISE EXCEPTION 'TEST: outsider added bot';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.add_bot(NULL, owner_id, request_one);
    RAISE EXCEPTION 'TEST: missing room ID accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.add_bot(room_id, NULL, request_one);
    RAISE EXCEPTION 'TEST: missing user ID accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.add_bot(room_id, owner_id, NULL);
    RAISE EXCEPTION 'TEST: missing request ID accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.add_bot(gen_random_uuid(), owner_id, request_one);
    RAISE EXCEPTION 'TEST: absent room accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  reply := public.add_bot(room_id, owner_id, request_one);
  IF reply->>'gameId' IS DISTINCT FROM room_id::text
    OR reply - 'gameId' - 'seat_id' <> '{}'::jsonb
    OR NOT EXISTS (SELECT 1 FROM public.game_players
      WHERE game_id = room_id AND seat_id = (reply->>'seat_id')::uuid
        AND is_bot AND user_id IS NULL)
    OR (SELECT count(*) FROM public.bot_addition_requests WHERE game_id = room_id) <> 1 THEN
    RAISE EXCEPTION 'Command must persist generated bot seat and safe result together';
  END IF;
  -- A full room must still replay success, including after settings have changed.
  PERFORM public.change_settings_game(room_id, owner_id, 3, 8);
  IF public.add_bot(room_id, owner_id, request_one) IS DISTINCT FROM reply THEN
    RAISE EXCEPTION 'Replay must return the original persisted reply';
  END IF;
  BEGIN
    PERFORM public.add_bot(room_id, owner_id, request_two);
    RAISE EXCEPTION 'TEST: full room accepted another bot';
  EXCEPTION WHEN SQLSTATE 'P1002' THEN NULL;
  END;
  IF (SELECT count(*) FROM public.game_players WHERE game_id = room_id) <> 3
    OR EXISTS (SELECT 1 FROM public.bot_addition_requests
      WHERE game_id = room_id AND request_id = request_two) THEN
    RAISE EXCEPTION 'Rejected full-room request must leave no changes';
  END IF;
  -- Seat IDs supplied as request IDs cannot masquerade as previous operations.
  PERFORM public.change_settings_game(room_id, owner_id, 4, 8);
  second_reply := public.add_bot(room_id, owner_id, human_seat);
  IF second_reply->>'seat_id' = human_seat::text
    OR second_reply = reply
    OR (SELECT count(*) FROM public.game_players WHERE game_id = room_id) <> 4 THEN
    RAISE EXCEPTION 'Request identity must be independent of human seat identity';
  END IF;
  UPDATE public.games SET status = 'GAME_STARTED' WHERE id = room_id;
  IF public.add_bot(room_id, owner_id, request_one) IS DISTINCT FROM reply THEN
    RAISE EXCEPTION 'Authorized replay must survive room status changes';
  END IF;
  IF public.add_bot(room_id, owner_id, request_two) IS DISTINCT FROM
    jsonb_build_object('code', 'LOBBY_NOT_OPEN', 'gameId', room_id) THEN
    RAISE EXCEPTION 'Started room must reject new additions';
  END IF;
  UPDATE public.games SET status = 'CLOSED' WHERE id = room_id;
  IF public.add_bot(room_id, owner_id, request_two)->>'code' <> 'LOBBY_NOT_OPEN' THEN
    RAISE EXCEPTION 'Closed room must reject new additions';
  END IF;

  INSERT INTO public.games(creator_id, seat_count) VALUES (owner_id, 2)
    RETURNING id INTO other_room;
  BEGIN
    PERFORM public.add_bot(other_room, owner_id, request_one);
    RAISE EXCEPTION 'TEST: nonmember owner accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO public.game_players(game_id, user_id) VALUES (other_room, owner_id);
  second_reply := public.add_bot(other_room, owner_id, request_one);
  IF second_reply->>'gameId' <> other_room::text OR second_reply = reply THEN
    RAISE EXCEPTION 'Request IDs must be isolated by room';
  END IF;
  UPDATE public.games SET creator_id = member_id WHERE id = room_id;
  BEGIN
    PERFORM public.add_bot(room_id, owner_id, request_one);
    RAISE EXCEPTION 'TEST: former owner replayed result';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

DO $$ BEGIN
  IF (SELECT count(*) FROM realtime.messages
      WHERE topic IN (SELECT 'lobby:' || game_id::text FROM public.bot_addition_requests)
        AND event = 'data is changed' AND private AND payload = '{}'::jsonb) < 3 THEN
    RAISE EXCEPTION 'Bot additions must use the existing private lobby signal';
  END IF;
END; $$;

-- Failure after the bot INSERT must roll back both the seat and its signal.
CREATE FUNCTION public.reject_bot_request_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'forced request persistence failure' USING ERRCODE = 'P9001'; END;
$$;
CREATE TRIGGER reject_bot_request_fixture BEFORE INSERT ON public.bot_addition_requests
  FOR EACH ROW EXECUTE FUNCTION public.reject_bot_request_fixture();
DO $$
DECLARE
  room_id uuid;
  before_seats bigint;
  before_signals bigint;
  before_requests bigint;
BEGIN
  INSERT INTO public.games(creator_id, seat_count)
    VALUES ('94000000-0000-4000-8000-000000000001', 4) RETURNING id INTO room_id;
  INSERT INTO public.game_players(game_id, user_id)
    VALUES (room_id, '94000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO before_seats FROM public.game_players;
  SELECT count(*) INTO before_signals FROM realtime.messages;
  SELECT count(*) INTO before_requests FROM public.bot_addition_requests;
  BEGIN
    PERFORM public.add_bot(room_id, '94000000-0000-4000-8000-000000000001', gen_random_uuid());
    RAISE EXCEPTION 'TEST: forced failure did not occur';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  IF (SELECT count(*) FROM public.game_players) <> before_seats
    OR (SELECT count(*) FROM realtime.messages) <> before_signals
    OR (SELECT count(*) FROM public.bot_addition_requests) <> before_requests THEN
    RAISE EXCEPTION 'Failure must roll back seat, result and signal together';
  END IF;
END;
$$;
DROP TRIGGER reject_bot_request_fixture ON public.bot_addition_requests;
DROP FUNCTION public.reject_bot_request_fixture();

DO $$
DECLARE client_role text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.bot_addition_requests'::regclass) THEN
    RAISE EXCEPTION 'Request result table must enable RLS';
  END IF;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(client_role, 'public.add_bot(uuid,uuid,uuid)', 'EXECUTE')
      OR has_table_privilege(client_role, 'public.bot_addition_requests', 'SELECT')
      OR has_table_privilege(client_role, 'public.bot_addition_requests', 'INSERT') THEN
      RAISE EXCEPTION 'Client roles must not execute command or access request results';
    END IF;
  END LOOP;
END;
$$;
SELECT 'PASS: add_bot rights, replay, isolation, capacity, private signal, atomic rollback and server-only access';
