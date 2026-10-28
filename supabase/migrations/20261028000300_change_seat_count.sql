-- Atomically save room capacity and turn duration; preserve server-only access.
DROP FUNCTION public.change_seat_count(uuid, uuid, integer);
CREATE FUNCTION public.change_settings_game(p_game_id uuid, p_user_id uuid, p_seat_count integer, p_turn_duration_minutes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
v_game public.games%ROWTYPE;
v_occupied_seat_count bigint;
BEGIN
  IF p_turn_duration_minutes IS NULL OR p_turn_duration_minutes NOT BETWEEN 1 AND 10 OR  p_game_id IS NULL OR p_user_id IS NULL OR p_seat_count IS NULL OR (p_seat_count != 3 AND p_seat_count != 2 AND p_seat_count != 4) THEN
      RAISE EXCEPTION 'данные некорректны' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Комната не найдена' USING ERRCODE = 'P0002';
  END IF;
  IF v_game.creator_id != p_user_id THEN
      RAISE EXCEPTION 'данные некорректны' USING ERRCODE = 'P0002';
    END IF;
  IF p_seat_count = v_game.seat_count AND p_turn_duration_minutes = v_game.turn_duration_minutes THEN
      RETURN jsonb_build_object('seat_count', p_seat_count,'turn_duration_minutes',p_turn_duration_minutes);
  END IF;
  SELECT count(*) INTO v_occupied_seat_count FROM public.game_players WHERE game_id = p_game_id;
  IF p_seat_count < v_occupied_seat_count THEN
     RAISE EXCEPTION 'данные некорректны' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.games
  SET seat_count = p_seat_count, turn_duration_minutes = p_turn_duration_minutes
  WHERE id = p_game_id;
  RETURN jsonb_build_object('seat_count', p_seat_count,'turn_duration_minutes',p_turn_duration_minutes);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.change_settings_game( uuid,  uuid,  integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_settings_game( uuid,  uuid,  integer, integer) TO service_role;
GRANT UPDATE ON TABLE public.games TO service_role;


-- Only the trusted Edge Function supplies a verified hash.
-- Return persisted duration without changing the join command inputs.
CREATE OR REPLACE FUNCTION public.join_game(p_game_id uuid, p_user_id uuid, p_verified_password_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_password_hash text;
  v_occupied_seat_count bigint;
BEGIN
  IF p_game_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'ID комнаты и пользователя обязательны' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Комната не найдена' USING ERRCODE = 'P0002';
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
    'occupiedSeatCount', v_occupied_seat_count, 'hasPassword', v_password_hash IS NOT NULL, 'turnDurationMinutes',v_game.turn_duration_minutes);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.join_game(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_game(uuid, uuid, text) TO service_role;
GRANT UPDATE ON TABLE public.games TO service_role;


-- The lobby list exposes only safe room settings.
DROP FUNCTION public.get_game_list();
CREATE FUNCTION public.get_game_list()
RETURNS TABLE (
  id uuid,
  seat_count integer,
  "occupiedSeatCount" bigint,
  "hasPassword" boolean,
  "turnDurationMinutes" integer
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT g.id, g.seat_count,
    (SELECT count(*) FROM public.game_players AS gp WHERE gp.game_id = g.id),
    EXISTS (SELECT 1 FROM public.game_passwords AS pw WHERE pw.game_id = g.id),
    g.turn_duration_minutes
  FROM public.games AS g
  ORDER BY g.id;
$$;
REVOKE EXECUTE ON FUNCTION public.get_game_list() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_game_list() TO service_role;
