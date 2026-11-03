-- Focused WEB-018 SQL tests. All fixtures are rolled back before concurrency tests.
INSERT INTO auth.users VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444');

DO $$ BEGIN
  IF has_function_privilege('anon', 'public.create_game(uuid,uuid,integer,text,integer)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.create_game(uuid,uuid,integer,text,integer)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.join_game(uuid,uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.join_game(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Client roles must not execute room commands';
  END IF;
END; $$;

SAVEPOINT creation;
SET LOCAL ROLE service_role;
DO $$ DECLARE
  u uuid := '11111111-1111-4111-8111-111111111111';
  request_id uuid := gen_random_uuid();
  denied_request uuid := gen_random_uuid();
  result jsonb;
  room_id uuid;
BEGIN
  result := public.create_game(u, request_id, 3, 'fixture-hash', 7);
  IF result->>'code' IS DISTINCT FROM 'SUCCESS' THEN RAISE EXCEPTION 'First creation must succeed'; END IF;
  room_id := (result->>'gameId')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.games WHERE id = room_id AND status = 'OPEN_LOBBY'
    AND seat_count = 3 AND turn_duration_minutes = 7)
    OR NOT EXISTS (SELECT 1 FROM public.game_players WHERE game_id = room_id AND user_id = u)
    OR NOT EXISTS (SELECT 1 FROM public.game_passwords WHERE game_id = room_id AND password_hash = 'fixture-hash') THEN
    RAISE EXCEPTION 'Creation must preserve settings, owner seat and hash';
  END IF;
  IF public.create_game(u, request_id, 4, NULL, 5) IS DISTINCT FROM result THEN
    RAISE EXCEPTION 'Same request must return original success';
  END IF;
  result := public.create_game(u, denied_request, 2, NULL, 3);
  IF result IS DISTINCT FROM jsonb_build_object('code', 'OWN_LOBBY_EXISTS', 'gameId', room_id)
    OR (SELECT count(*) FROM public.games) <> 1
    OR (SELECT count(*) FROM public.game_players) <> 1
    OR (SELECT count(*) FROM public.game_passwords) <> 1
    OR (SELECT count(*) FROM public.game_creation_requests) <> 1 THEN
    RAISE EXCEPTION 'Different request must refuse without writes and report own lobby';
  END IF;
  UPDATE public.games SET status = 'CLOSED' WHERE id = room_id;
  IF public.create_game(u, request_id, 3, NULL, 3)->>'gameId' IS DISTINCT FROM room_id::text THEN
    RAISE EXCEPTION 'Closed history must retain original request result';
  END IF;
  IF public.create_game(u, denied_request, 2, NULL, 3)->>'code' IS DISTINCT FROM 'SUCCESS' THEN
    RAISE EXCEPTION 'Closed lobby must stop blocking a new request';
  END IF;
  BEGIN
    UPDATE public.games SET status = 'INVALID' WHERE id = room_id;
    RAISE EXCEPTION 'Invalid status accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END; $$;
ROLLBACK TO creation;

SAVEPOINT memberships;
DO $$ DECLARE
  u uuid := '11111111-1111-4111-8111-111111111111';
  other_user uuid := '22222222-2222-4222-8222-222222222222';
  room_id uuid;
  closed_room uuid;
  result jsonb;
BEGIN
  INSERT INTO public.games(creator_id, seat_count) VALUES (other_user, 3) RETURNING id INTO room_id;
  INSERT INTO public.games(creator_id, seat_count, status) VALUES (u, 2, 'CLOSED') RETURNING id INTO closed_room;
  INSERT INTO public.game_players(game_id, user_id) VALUES (closed_room, u);
  SET LOCAL ROLE service_role;
  result := public.create_game(u, gen_random_uuid(), 2, NULL, 3);
  IF result->>'code' IS DISTINCT FROM 'SUCCESS' THEN
    RAISE EXCEPTION 'Closed membership plus unrelated open lobby must not block creation';
  END IF;
  RESET ROLE;
  UPDATE public.games SET status = 'CLOSED' WHERE id = (result->>'gameId')::uuid;
  INSERT INTO public.game_players(game_id, user_id) VALUES (room_id, u);
  SET LOCAL ROLE service_role;
  result := public.create_game(u, gen_random_uuid(), 2, NULL, 3);
  IF result IS DISTINCT FROM jsonb_build_object('code', 'LOBBY_MEMBERSHIP_EXISTS', 'gameId', room_id) THEN
    RAISE EXCEPTION 'Foreign open membership must block creation with its room ID';
  END IF;
  UPDATE public.games SET status = 'GAME_STARTED' WHERE id = room_id;
  result := public.create_game(u, gen_random_uuid(), 2, NULL, 3);
  IF result IS DISTINCT FROM jsonb_build_object('code', 'GAME_IN_PROGRESS', 'gameId', room_id) THEN
    RAISE EXCEPTION 'Active membership must block creation';
  END IF;
  UPDATE public.games SET status = 'CLOSED' WHERE id = room_id;
  IF public.create_game(u, gen_random_uuid(), 2, NULL, 3)->>'code' IS DISTINCT FROM 'SUCCESS' THEN
    RAISE EXCEPTION 'Closed game membership must stop blocking';
  END IF;
END; $$;
ROLLBACK TO memberships;

SAVEPOINT joins;
DO $$ DECLARE
  u uuid := '11111111-1111-4111-8111-111111111111';
  owner_b uuid := '22222222-2222-4222-8222-222222222222';
  visitor uuid := '33333333-3333-4333-8333-333333333333';
  room_a uuid;
  room_b uuid;
  result jsonb;
  before_counts bigint[];
BEGIN
  SET LOCAL ROLE service_role;
  result := public.create_game(u, gen_random_uuid(), 3, 'fixture-hash', 7);
  room_a := (result->>'gameId')::uuid;
  result := public.create_game(owner_b, gen_random_uuid(), 3, NULL, 5);
  room_b := (result->>'gameId')::uuid;
  result := public.join_game(room_a, u);
  IF result->>'id' IS DISTINCT FROM room_a::text OR result->>'turnDurationMinutes' IS DISTINCT FROM '7'
    OR result->>'occupiedSeatCount' IS DISTINCT FROM '1' OR result->>'hasPassword' IS DISTINCT FROM 'true'
    OR result ? 'password_hash' THEN
    RAISE EXCEPTION 'Owner retry needs no password and must preserve safe lobby DTO';
  END IF;
  before_counts := ARRAY[(SELECT count(*) FROM public.game_players), (SELECT count(*) FROM public.game_creation_requests)];
  result := public.join_game(room_b, u);
  IF result IS DISTINCT FROM jsonb_build_object('code', 'OWN_LOBBY_EXISTS', 'gameId', room_a) THEN
    RAISE EXCEPTION 'Own lobby must block foreign join and report owned room';
  END IF;
  IF before_counts IS DISTINCT FROM ARRAY[(SELECT count(*) FROM public.game_players), (SELECT count(*) FROM public.game_creation_requests)] THEN
    RAISE EXCEPTION 'Refused join must not write membership or creation result';
  END IF;
  UPDATE public.games SET status = 'GAME_STARTED' WHERE id = room_a;
  IF public.join_game(room_b, u) IS DISTINCT FROM jsonb_build_object('code', 'GAME_IN_PROGRESS', 'gameId', room_a) THEN
    RAISE EXCEPTION 'Active player must not join another lobby';
  END IF;
  IF public.join_game(room_a, u) IS DISTINCT FROM jsonb_build_object('code', 'LOBBY_NOT_OPEN', 'gameId', room_a) THEN
    RAISE EXCEPTION 'Retry into started room must not reopen lobby';
  END IF;
  UPDATE public.games SET status = 'CLOSED' WHERE id = room_a;
  IF public.join_game(room_a, visitor) IS DISTINCT FROM jsonb_build_object('code', 'LOBBY_NOT_OPEN', 'gameId', room_a) THEN
    RAISE EXCEPTION 'Closed room must reject new join';
  END IF;
  result := public.join_game(room_b, u);
  IF result->>'id' IS DISTINCT FROM room_b::text OR result->>'occupiedSeatCount' IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'Closed history must allow foreign join';
  END IF;
  IF public.join_game(room_b, u) IS DISTINCT FROM result THEN
    RAISE EXCEPTION 'Member retry must return same lobby without duplicate seat';
  END IF;
  IF (SELECT count(*) FROM public.game_players WHERE game_id = room_b AND user_id = u) <> 1 THEN
    RAISE EXCEPTION 'Retry duplicated membership';
  END IF;
  BEGIN
    PERFORM public.join_game(gen_random_uuid(), visitor);
    RAISE EXCEPTION 'Missing room accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END; $$;
ROLLBACK TO joins;

SAVEPOINT rollback_creation;
CREATE FUNCTION public.fail_restriction_test_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'forced request failure'; END; $$;
CREATE TRIGGER fail_restriction_test_request BEFORE INSERT ON public.game_creation_requests
FOR EACH ROW EXECUTE FUNCTION public.fail_restriction_test_request();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  BEGIN
    PERFORM public.create_game('11111111-1111-4111-8111-111111111111', gen_random_uuid(), 3, 'hash', 3);
    RAISE EXCEPTION 'Forced failure did not fire';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forced request failure' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.games) OR EXISTS (SELECT 1 FROM public.game_players)
    OR EXISTS (SELECT 1 FROM public.game_passwords) OR EXISTS (SELECT 1 FROM public.game_creation_requests) THEN
    RAISE EXCEPTION 'Failed creation left partial records';
  END IF;
END; $$;
ROLLBACK TO rollback_creation;
