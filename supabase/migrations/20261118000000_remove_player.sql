ALTER TABLE public.bot_removal_requests
  RENAME TO player_removal_requests;

DROP FUNCTION public.remove_bot(p_user_id uuid, p_game_id uuid, p_request_id uuid, p_seat_id uuid);

CREATE FUNCTION public.remove_player(p_user_id uuid, p_game_id uuid, p_request_id uuid, p_seat_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER SET search_path = ''
AS
$$
DECLARE
  v_game                    public.games%ROWTYPE;
  v_player                  public.game_players%ROWTYPE;
  v_player_removal_requests public.player_removal_requests%ROWTYPE;
  v_result                  jsonb;
BEGIN
  IF p_user_id IS NULL OR p_game_id IS NULL OR p_request_id IS NULL OR p_seat_id IS NULL THEN
    RAISE EXCEPTION 'ID комнаты, пользователя и запроса обязательны' USING ERRCODE = '22023';
  END IF;
  -- join_game and change_settings_game acquire this same room lock.
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Комната не найдена' USING ERRCODE = 'P0002';
  END IF;
  IF v_game.creator_id != p_user_id THEN
    RAISE EXCEPTION 'Только создатель может удалить бота' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_player_removal_requests
  FROM public.player_removal_requests
  WHERE user_id = p_user_id
    AND game_id = p_game_id
    AND request_id = p_request_id;
  IF FOUND THEN
    IF v_player_removal_requests.seat_id = p_seat_id THEN
      return v_player_removal_requests.result;
    ELSE
      RAISE EXCEPTION 'нет такого игрока в комнате' USING ERRCODE = 'P1002';
    end if;
  END IF;
  IF v_game.status != 'OPEN_LOBBY' THEN
    RETURN jsonb_build_object('code', 'LOBBY_NOT_OPEN', 'gameId', v_game.id);
  end if;
  SELECT *
  INTO v_player
  FROM public.game_players
  WHERE p_game_id = game_id
    AND p_seat_id = seat_id
    AND ((is_bot = true AND user_id IS NULL) OR
         (is_bot = false AND user_id IS NOT NULL AND game_players.user_id != v_game.creator_id));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'нет такого игрока в комнате' USING ERRCODE = 'P1002';
  END IF;

  DELETE
  FROM public.game_players
  WHERE p_game_id = game_id
    AND p_seat_id = seat_id
    AND ((is_bot = true AND user_id IS NULL) OR
         (is_bot = false AND user_id IS NOT NULL AND game_players.user_id != v_game.creator_id));
  v_result := jsonb_build_object('gameId', p_game_id);
  INSERT INTO public.player_removal_requests(user_id, game_id, request_id, seat_id, result)
  VALUES (p_user_id, p_game_id, p_request_id, p_seat_id, v_result);
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.remove_player(uuid, uuid, uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_player(uuid, uuid, uuid,uuid) TO service_role;

