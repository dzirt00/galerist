-- auto-generated definition
create table leave_game_requests
(
  user_id    uuid  not null
    references profiles,
  game_id    uuid  not null
    references games,
  request_id uuid  not null,
  result     jsonb not null
    constraint leave_game_requests_result_check
      check (jsonb_typeof(result) = 'object'::text),
  primary key (user_id, game_id, request_id)
);
ALTER TABLE public.leave_game_requests
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.leave_game_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.leave_game_requests TO service_role;

CREATE FUNCTION public.leave_game(p_game_id uuid, p_user_id uuid, p_request_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER SET search_path = ''
AS
$$
DECLARE
  v_game   public.games%ROWTYPE;
  v_player public.game_players%ROWTYPE;
  v_result jsonb;
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

  -- Re-check current rights even when replaying an old request.
  IF v_game.status != 'OPEN_LOBBY' THEN
    RETURN jsonb_build_object('code', 'LOBBY_NOT_OPEN', 'gameId', v_game.id);
  end if;
  IF v_game.creator_id = p_user_id THEN
    RAISE EXCEPTION 'Создатель не может покинуть игру' USING ERRCODE = '42501';
  END IF;
  SELECT *
  INTO v_player
  FROM public.game_players
  WHERE p_game_id = game_id
    AND p_user_id = user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Юзера нет в комнате' USING ERRCODE = 'P1002';
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


CREATE OR REPLACE FUNCTION public.change_game_player()
  RETURNS trigger
  LANGUAGE plpgsql
AS
$$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM realtime.send(
      '{}':: jsonb,
      'data is changed',
      'lobby:' || NEW.game_id::text,
      true
            );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_ready IS DISTINCT FROM NEW.is_ready THEN
      PERFORM realtime.send(
        '{}':: jsonb,
        'data is changed',
        'lobby:' || NEW.game_id::text,
        true
              );
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    PERFORM realtime.send(
      '{}':: jsonb,
      'data is changed',
      'lobby:' || OLD.game_id::text,
      true
            );
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER change_game_player ON public.game_players;
CREATE TRIGGER change_game_player
  AFTER UPDATE OR INSERT OR DELETE
  ON public.game_players
  FOR EACH ROW
EXECUTE FUNCTION public.change_game_player();

GRANT DELETE ON TABLE public.game_players TO service_role;
