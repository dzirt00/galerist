-- Only the trusted Edge Function supplies a verified hash.
-- Remove a previously installed draft signature, if present, to avoid overloads.
DROP FUNCTION IF EXISTS public.join_game(uuid, uuid);
CREATE FUNCTION public.join_game(p_game_id uuid, p_user_id uuid, p_verified_password_hash text DEFAULT NULL)
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
    'occupiedSeatCount', v_occupied_seat_count, 'hasPassword', v_password_hash IS NOT NULL);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.join_game(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_game(uuid, uuid, text) TO service_role;
GRANT UPDATE ON TABLE public.games TO service_role;
