DROP FUNCTION public.get_game_list();
DROP FUNCTION public.get_game_players(p_game_id uuid, p_user_id uuid);
DROP FUNCTION public.join_game(p_game_id uuid, p_user_id uuid, p_verified_password_hash text);
DROP FUNCTION public.get_own_lobby(p_game_id uuid, p_user_id uuid);

CREATE OR REPLACE FUNCTION public.get_game_list()
  RETURNS TABLE
          (
            id                    uuid,
            seat_count            integer,
            "occupiedSeatCount"   bigint,
            "hasPassword"         boolean,
            "turnDurationMinutes" integer,
            display_name          text
          )
  LANGUAGE sql
  STABLE SECURITY INVOKER SET search_path = ''
AS
$$
SELECT g.id,
       g.seat_count,
       (SELECT count(*) FROM public.game_players gp WHERE gp.game_id = g.id),
       EXISTS (SELECT 1 FROM public.game_passwords pw WHERE pw.game_id = g.id),
       g.turn_duration_minutes,
       (SELECT display_name FROM public.profiles WHERE g.creator_id = public.profiles.id)
FROM public.games g
WHERE g.status = 'OPEN_LOBBY'
ORDER BY g.id;
$$;
REVOKE EXECUTE ON FUNCTION public.get_game_list() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_game_list() TO service_role;

CREATE OR REPLACE FUNCTION public.get_game_players(p_game_id uuid, p_user_id uuid)
  RETURNS TABLE
          (
            user_id      uuid,
            is_ready     boolean,
            display_name text
          )
  LANGUAGE plpgsql
  SECURITY INVOKER SET search_path = ''
AS
$$
DECLARE
  v_game     public.games%ROWTYPE;
  v_is_ready public.game_players%ROWTYPE;
BEGIN
  IF p_game_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'ID комнаты и пользователя обязательны' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Комната не найдена' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_is_ready FROM public.game_players AS gp WHERE gp.game_id = p_game_id AND gp.user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Комната не найдена' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
    SELECT gp.user_id, gp.is_ready, p.display_name
    FROM public.game_players AS gp,
         public.profiles AS p
    WHERE gp.game_id = p_game_id
      AND p.id = gp.user_id
    ORDER BY gp.user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_game_players(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_game_players(uuid, uuid) TO service_role;


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
  v_display_name        text;
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
  SELECT profiles.display_name
  INTO v_display_name
  FROM public.profiles
  WHERE v_game.creator_id = id;

  RETURN jsonb_build_object('id', v_game.id, 'seat_count', v_game.seat_count,
                            'occupiedSeatCount', v_occupied_seat_count, 'hasPassword', v_password_hash IS NOT NULL,
                            'turnDurationMinutes', v_game.turn_duration_minutes, 'display_name', v_display_name);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.join_game(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_game(uuid, uuid, text) TO service_role;
GRANT UPDATE ON TABLE public.games TO service_role;


CREATE FUNCTION public.get_own_lobby(p_game_id uuid, p_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER SET search_path = ''
AS
$$
DECLARE
  v_game         public.games%ROWTYPE;
  v_display_name text;
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
  SELECT profiles.display_name
  INTO v_display_name
  FROM public.profiles
  WHERE p_user_id = id;
  RETURN jsonb_build_object(
    'id', v_game.id,
    'seat_count', v_game.seat_count,
    'occupiedSeatCount', (SELECT count(*) FROM public.game_players WHERE game_id = p_game_id),
    'hasPassword', EXISTS (SELECT 1 FROM public.game_passwords WHERE game_id = p_game_id),
    'turnDurationMinutes', v_game.turn_duration_minutes, 'display_name', v_display_name
         );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_own_lobby(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_own_lobby(uuid, uuid) TO service_role;
