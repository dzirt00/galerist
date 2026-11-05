SAVEPOINT own_lobby;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  u uuid := '11111111-1111-4111-8111-111111111111';
  visitor uuid := '22222222-2222-4222-8222-222222222222';
  room_id uuid;
  before_count bigint;
  result jsonb;
BEGIN
  room_id := (public.create_game(u, gen_random_uuid(), 2, 'private-hash', 7)->>'gameId')::uuid;
  PERFORM public.join_game(room_id, visitor, 'private-hash');
  SELECT count(*) INTO before_count FROM public.game_players;
  result := public.get_own_lobby(room_id, u);
  IF result IS DISTINCT FROM jsonb_build_object('id', room_id, 'seat_count', 2,
    'occupiedSeatCount', 2, 'hasPassword', true, 'turnDurationMinutes', 7) THEN
    RAISE EXCEPTION 'Restoration must expose only the safe current lobby DTO: %', result;
  END IF;
  IF public.get_own_lobby(room_id, u) IS DISTINCT FROM result
    OR (SELECT count(*) FROM public.game_players) <> before_count THEN
    RAISE EXCEPTION 'Restoration/retry must not add participation';
  END IF;
  BEGIN
    PERFORM public.get_own_lobby(room_id, visitor);
    RAISE EXCEPTION 'TEST: another participant restored owner lobby';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.get_own_lobby(gen_random_uuid(), u);
    RAISE EXCEPTION 'TEST: missing lobby restored';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  UPDATE public.games SET status = 'GAME_STARTED' WHERE id = room_id;
  BEGIN
    PERFORM public.get_own_lobby(room_id, u);
    RAISE EXCEPTION 'TEST: started lobby restored';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.get_game_list() WHERE id = room_id) THEN
    RAISE EXCEPTION 'Started games must not be listed as lobbies';
  END IF;
  UPDATE public.games SET status = 'CLOSED' WHERE id = room_id;
  BEGIN
    PERFORM public.get_own_lobby(room_id, u);
    RAISE EXCEPTION 'TEST: closed lobby restored';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.get_game_list() WHERE id = room_id) THEN
    RAISE EXCEPTION 'Closed rooms must not be listed as lobbies';
  END IF;
  UPDATE public.games SET status = 'OPEN_LOBBY', creator_id = visitor WHERE id = room_id;
  BEGIN
    PERFORM public.get_own_lobby(room_id, u);
    RAISE EXCEPTION 'TEST: former owner restored lobby';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  IF public.get_own_lobby(room_id, visitor)->>'id' IS DISTINCT FROM room_id::text THEN
    RAISE EXCEPTION 'Current owner cannot restore lobby';
  END IF;
END; $$;
RESET ROLE;
-- Privileges and missing membership are tested without granting clients table access.
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.get_own_lobby(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.get_own_lobby(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Own-lobby RPC is server-only';
  END IF;
  DELETE FROM public.game_players;
END; $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE room_id uuid; BEGIN
  SELECT id INTO room_id FROM public.games LIMIT 1;
  BEGIN
    PERFORM public.get_own_lobby(room_id, '22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'TEST: missing membership restored';
  EXCEPTION WHEN no_data_found THEN NULL; END;
END; $$;
ROLLBACK TO own_lobby;
