CREATE OR REPLACE FUNCTION public.leave_game(p_game_id uuid, p_user_id uuid, p_request_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER SET search_path = ''
AS
$$
DECLARE
  v_game        public.games%ROWTYPE;
  v_player      public.game_players%ROWTYPE;
  v_result      jsonb;
  v_new_creator public.game_players%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_game_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'ID комнаты, пользователя и запроса обязательны' USING ERRCODE = '22023';
  END IF;
  -- join_game and change_settings_game acquire this same room lock.
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Комната не найдена' USING ERRCODE = 'P0002';
  END IF;
  SELECT result
  INTO v_result
  FROM public.leave_game_requests
  WHERE user_id = p_user_id
    AND game_id = p_game_id
    AND request_id = p_request_id;
  IF FOUND THEN
    RETURN v_result;
  END IF;
  IF v_game.status != 'OPEN_LOBBY' THEN
    RETURN jsonb_build_object('code', 'LOBBY_NOT_OPEN', 'gameId', v_game.id);
  end if;
  SELECT *
  INTO v_player
  FROM public.game_players
  WHERE p_game_id = game_id
    AND p_user_id = user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Юзера нет в комнате' USING ERRCODE = 'P1002';
  END IF;
  IF v_game.creator_id = p_user_id THEN
    SELECT *
    INTO v_new_creator
    FROM public.game_players
    WHERE is_bot = false
      AND p_user_id != user_id
      AND user_id IS NOT NULL
      AND p_game_id = game_id
    ORDER BY user_id
    LIMIT 1;
    IF NOT FOUND THEN
      UPDATE public.games
      SET status = 'CLOSED'
      WHERE id = p_game_id;
    ELSE
      update public.games
      set creator_id = v_new_creator.user_id
      where p_game_id = id;
    END IF;
    DELETE FROM public.game_players WHERE p_game_id = game_id AND p_user_id = user_id;
    v_result := jsonb_build_object('gameId', p_game_id);
    INSERT INTO public.leave_game_requests(user_id, game_id, request_id, result)
    VALUES (p_user_id, p_game_id, p_request_id, v_result);
    RETURN v_result;
  END IF;

  DELETE FROM public.game_players WHERE p_game_id = game_id AND p_user_id = user_id;
  v_result := jsonb_build_object('gameId', p_game_id);
  INSERT INTO public.leave_game_requests(user_id, game_id, request_id, result)
  VALUES (p_user_id, p_game_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.leave_game(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_game(uuid, uuid, uuid) TO service_role;
