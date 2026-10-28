-- One statement and one snapshot for the complete, safe lobby list.
CREATE FUNCTION public.change_seat_count(p_game_id uuid, p_user_id uuid, p_seat_count integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
v_game public.games%ROWTYPE;
v_occupied_seat_count bigint;
BEGIN
  IF p_game_id IS NULL OR p_user_id IS NULL OR p_seat_count IS NULL OR (p_seat_count != 3 AND p_seat_count != 2 AND p_seat_count != 4) THEN
      RAISE EXCEPTION 'данные некорректны' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Комната не найдена' USING ERRCODE = 'P0002';
  END IF;
  IF v_game.creator_id != p_user_id THEN
      RAISE EXCEPTION 'данные некорректны' USING ERRCODE = 'P0002';
    END IF;
  IF p_seat_count = v_game.seat_count THEN
      RETURN jsonb_build_object('seat_count', p_seat_count);
  END IF;
  SELECT count(*) INTO v_occupied_seat_count FROM public.game_players WHERE game_id = p_game_id;
  IF p_seat_count < v_occupied_seat_count THEN
     RAISE EXCEPTION 'данные некорректны' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.games
  SET seat_count = p_seat_count
  WHERE id = p_game_id;
  RETURN jsonb_build_object('seat_count', p_seat_count);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.change_seat_count( uuid,  uuid,  integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_seat_count( uuid,  uuid,  integer) TO service_role;
GRANT UPDATE ON TABLE public.games TO service_role;
