CREATE OR REPLACE FUNCTION public.add_bot(p_game_id uuid, p_user_id uuid, p_request_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER SET search_path = ''
AS
$$
DECLARE
  v_game                public.games%ROWTYPE;
  v_occupied_seat_count bigint;
  v_seat_id             uuid;
  v_result              jsonb;
BEGIN
  IF p_user_id IS NULL OR p_game_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'ID комнаты, пользователя и запроса обязательны' USING ERRCODE = '22023';
  END IF;
  -- join_game and change_settings_game acquire this same room lock.
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Комната не найдена' USING ERRCODE = 'P0002';
  END IF;
  -- Re-check current rights even when replaying an old request.
  IF v_game.creator_id != p_user_id OR NOT EXISTS (SELECT 1
                                                   FROM public.game_players
                                                   WHERE game_id = p_game_id
                                                     AND user_id = p_user_id
                                                     AND NOT is_bot) THEN
    RAISE EXCEPTION 'Добавлять ботов может только создатель — участник комнаты' USING ERRCODE = '42501';
  END IF;

  SELECT result
  INTO v_result
  FROM public.bot_addition_requests
  WHERE user_id = p_user_id
    AND game_id = p_game_id
    AND request_id = p_request_id;
  IF FOUND THEN
    RETURN v_result;
  END IF;

  IF v_game.status != 'OPEN_LOBBY' THEN
    RETURN jsonb_build_object('code', 'LOBBY_NOT_OPEN', 'gameId', v_game.id);
  END IF;
  SELECT count(*) INTO v_occupied_seat_count FROM public.game_players WHERE game_id = p_game_id;
  IF v_occupied_seat_count >= v_game.seat_count THEN
    RAISE EXCEPTION 'Свободных мест нет' USING ERRCODE = 'P1002';
  END IF;
  INSERT INTO public.game_players(game_id, is_bot, is_ready)
  VALUES (p_game_id, true, true)
  RETURNING seat_id INTO v_seat_id;
  v_result := jsonb_build_object('gameId', p_game_id, 'seat_id', v_seat_id);
  INSERT INTO public.bot_addition_requests(user_id, game_id, request_id, result)
  VALUES (p_user_id, p_game_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_bot(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_bot(uuid, uuid, uuid) TO service_role;
