-- One-time WEB-018 rollout for the 20 test rooms confirmed on 2026-11-05.
-- Generated from the two migrations below. Run the WHOLE file on the confirmed cloud connection.
-- Do not rerun after success. Stop frontend requests until Edge Functions are updated.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.games IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'status') THEN
    RAISE EXCEPTION 'WEB-018 status already exists; stop and inspect, do not rerun';
  END IF;
  IF (SELECT count(*) FROM public.games) <> 20
    OR (SELECT count(*) FROM public.games WHERE creator_id = '5897773f-ab47-4422-9106-18f7feccd9a3') <> 16
    OR (SELECT count(*) FROM public.games WHERE creator_id = '9c6aa7ae-6ad6-4ff9-b414-a9ec7e8192b5') <> 4 THEN
    RAISE EXCEPTION 'Existing rooms differ from the 20 confirmed test rooms; stop and inspect';
  END IF;
END; $$;

-- Source: supabase/migrations/20261103000000_edit_tables.sql
ALTER TABLE public.games
  ADD COLUMN status text NOT NULL DEFAULT 'OPEN_LOBBY'
    CHECK (status IN ('GAME_STARTED', 'OPEN_LOBBY', 'CLOSED'));


DROP FUNCTION public.create_game(p_creator_id uuid, p_request_id uuid, p_seat_count integer, p_password_hash text,
                                 p_turn_duration_minutes integer);
CREATE OR REPLACE FUNCTION public.create_game(
  p_creator_id uuid,
  p_request_id uuid,
  p_seat_count integer,
  p_password_hash text,
  p_turn_duration_minutes integer
)
  returns jsonb
  language plpgsql
  security invoker set search_path = ''
as
$$
DECLARE
  v_game_id          uuid;
  v_existing_game_id uuid;
begin

  IF p_creator_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Creator ID and request ID are required'; END IF;
  IF NOT (p_turn_duration_minutes BETWEEN 1 AND 10) THEN
    RAISE EXCEPTION 'invalid turn_duration_minutes';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    (p_creator_id::text)::text, 0));
  SELECT game_id
  INTO v_game_id
  FROM public.game_creation_requests
  WHERE user_id = p_creator_id
    AND request_id = p_request_id;
  IF v_game_id IS NOT NULL THEN RETURN jsonb_build_object('code', 'SUCCESS', 'gameId', v_game_id); END IF;
  SELECT id
  INTO v_existing_game_id
  FROM public.games
  WHERE creator_id = p_creator_id
    AND status = 'OPEN_LOBBY';
  IF v_existing_game_id IS NOT NULL THEN
    RETURN jsonb_build_object('code', 'OWN_LOBBY_EXISTS', 'gameId', v_existing_game_id);
  END IF;
  SELECT public.games.id
  INTO v_existing_game_id
  FROM public.games,
       public.game_players
  WHERE game_players.user_id = p_creator_id
    AND public.games.id = public.game_players.game_id
    AND games.status = 'GAME_STARTED';
  IF v_existing_game_id IS NOT NULL THEN
    RETURN jsonb_build_object('code', 'GAME_IN_PROGRESS', 'gameId', v_existing_game_id);
  END IF;
  SELECT public.games.id
  INTO v_existing_game_id
  FROM public.games,
       public.game_players
  WHERE public.game_players.user_id = p_creator_id
    AND public.games.id = public.game_players.game_id
    AND public.games.status = 'OPEN_LOBBY'
    AND public.games.creator_id != p_creator_id;
  IF v_existing_game_id IS NOT NULL THEN
    RETURN jsonb_build_object('code', 'LOBBY_MEMBERSHIP_EXISTS', 'gameId', v_existing_game_id);
  END IF;

  INSERT INTO public.games (creator_id, seat_count, turn_duration_minutes)
  VALUES (p_creator_id, p_seat_count, p_turn_duration_minutes)
  RETURNING id INTO v_game_id;
  INSERT INTO public.game_players (game_id, user_id)
  VALUES (v_game_id, p_creator_id);
  IF p_password_hash IS NOT NULL THEN
    INSERT INTO public.game_passwords(game_id, password_hash) VALUES (v_game_id, p_password_hash);
  END IF;
  INSERT INTO public.game_creation_requests(user_id, request_id, game_id)
  VALUES (p_creator_id, p_request_id, v_game_id);
  RETURN jsonb_build_object('code', 'SUCCESS', 'gameId', v_game_id);
end;
$$;
REVOKE EXECUTE ON FUNCTION public.create_game(uuid, uuid, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_game(uuid, uuid, integer, text, integer) TO service_role;
GRANT SELECT, INSERT ON TABLE public.games, public.game_players, public.game_creation_requests, public.game_passwords TO service_role;


CREATE OR REPLACE FUNCTION public.join_game(p_game_id uuid, p_user_id uuid, p_verified_password_hash text DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER SET search_path = ''
AS
$$
DECLARE
  v_game                public.games%ROWTYPE;
  v_password_hash       text;
  v_occupied_seat_count bigint;
  v_existing_game_id    uuid;
BEGIN
  IF p_game_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'ID комнаты и пользователя обязательны' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    (p_user_id::text)::text, 0));
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Комната не найдена' USING ERRCODE = 'P0002';
  END IF;
  IF v_game.status != 'OPEN_LOBBY' THEN
    RETURN jsonb_build_object('code', 'LOBBY_NOT_OPEN', 'gameId', v_game.id);
  END IF;
  SELECT public.games.id
  INTO v_existing_game_id
  FROM public.games
  WHERE public.games.creator_id = p_user_id
    AND public.games.status = 'OPEN_LOBBY'
    AND public.games.id != p_game_id;
  IF v_existing_game_id IS NOT NULL THEN
    RETURN jsonb_build_object('code', 'OWN_LOBBY_EXISTS', 'gameId', v_existing_game_id);
  END IF;
  SELECT public.games.id
  INTO v_existing_game_id
  FROM public.games,
       public.game_players
  WHERE public.games.id = public.game_players.game_id
    AND public.games.status = 'GAME_STARTED'
    AND public.game_players.user_id = p_user_id;
  IF v_existing_game_id IS NOT NULL THEN
    RETURN jsonb_build_object('code', 'GAME_IN_PROGRESS', 'gameId', v_existing_game_id);
  END IF;


  SELECT password_hash INTO v_password_hash FROM public.game_passwords WHERE game_id = p_game_id;
  -- Lock before membership/capacity checks; membership makes retries idempotent.
  IF NOT EXISTS (SELECT 1 FROM public.game_players WHERE game_id = p_game_id AND user_id = p_user_id) THEN
    IF v_password_hash IS NOT NULL AND p_verified_password_hash IS DISTINCT FROM v_password_hash THEN
      RAISE EXCEPTION 'Неверный пароль' USING ERRCODE = 'P1001';
    END IF;
    SELECT count(*) INTO v_occupied_seat_count FROM public.game_players WHERE game_id = p_game_id;
    IF v_occupied_seat_count >= v_game.seat_count THEN
      RAISE EXCEPTION 'Свободных мест нет' USING ERRCODE = 'P1002';
    END IF;
    INSERT INTO public.game_players(game_id, user_id) VALUES (p_game_id, p_user_id);
  END IF;
  SELECT count(*) INTO v_occupied_seat_count FROM public.game_players WHERE game_id = p_game_id;
  RETURN jsonb_build_object('id', v_game.id, 'seat_count', v_game.seat_count,
                            'occupiedSeatCount', v_occupied_seat_count, 'hasPassword', v_password_hash IS NOT NULL,
                            'turnDurationMinutes', v_game.turn_duration_minutes);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.join_game(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_game(uuid, uuid, text) TO service_role;
GRANT UPDATE ON TABLE public.games TO service_role;

-- Source: supabase/migrations/20261105000000_get_own_lobby.sql
-- Read-only restoration: identity is supplied by the authenticated Edge Function.
CREATE FUNCTION public.get_own_lobby(p_game_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_game public.games%ROWTYPE;
BEGIN
  IF p_game_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Room and user IDs are required' USING ERRCODE = '22023';
  END IF;
  -- Same lock order as create/join: user, then room.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.creator_id <> p_user_id OR v_game.status <> 'OPEN_LOBBY' THEN
    RAISE EXCEPTION 'Open owned lobby not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_players WHERE game_id = p_game_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Owner membership not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'id', v_game.id,
    'seat_count', v_game.seat_count,
    'occupiedSeatCount', (SELECT count(*) FROM public.game_players WHERE game_id = p_game_id),
    'hasPassword', EXISTS (SELECT 1 FROM public.game_passwords WHERE game_id = p_game_id),
    'turnDurationMinutes', v_game.turn_duration_minutes
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_own_lobby(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_own_lobby(uuid, uuid) TO service_role;

-- Closed rooms and started games are no longer joinable lobbies.
CREATE OR REPLACE FUNCTION public.get_game_list()
RETURNS TABLE(id uuid, seat_count integer, "occupiedSeatCount" bigint, "hasPassword" boolean, "turnDurationMinutes" integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT g.id, g.seat_count,
    (SELECT count(*) FROM public.game_players gp WHERE gp.game_id = g.id),
    EXISTS (SELECT 1 FROM public.game_passwords pw WHERE pw.game_id = g.id),
    g.turn_duration_minutes
  FROM public.games g
  WHERE g.status = 'OPEN_LOBBY'
  ORDER BY g.id;
$$;

-- All existing rooms are confirmed test fixtures; retain rooms and memberships.
UPDATE public.games SET status = 'CLOSED'
WHERE status = 'OPEN_LOBBY'
  AND creator_id IN (
    '5897773f-ab47-4422-9106-18f7feccd9a3',
    '9c6aa7ae-6ad6-4ff9-b414-a9ec7e8192b5'
  );
DO $$ BEGIN
  IF (SELECT count(*) FROM public.games WHERE status = 'CLOSED') <> 20
    OR EXISTS (SELECT 1 FROM public.get_game_list()) THEN
    RAISE EXCEPTION 'Unexpected room status/list after rollout';
  END IF;
END; $$;
COMMIT;

SELECT status, count(*) AS room_count FROM public.games GROUP BY status;
SELECT p.proname AS function_name, pg_get_function_result(p.oid) AS result_type
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('create_game', 'get_own_lobby')
ORDER BY p.proname;
