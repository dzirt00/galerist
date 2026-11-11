ALTER TABLE public.game_players
  ADD COLUMN seat_id uuid;
UPDATE public.game_players
SET seat_id = gen_random_uuid()
WHERE seat_id IS NULL;

ALTER TABLE public.game_players
  ALTER COLUMN seat_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN seat_id SET NOT NULL;

ALTER TABLE public.game_players
  DROP CONSTRAINT game_players_pkey;

ALTER TABLE public.game_players
  ADD PRIMARY KEY (seat_id);

ALTER TABLE public.game_players
  ADD COLUMN is_bot boolean;
UPDATE public.game_players
SET is_bot = false
WHERE game_players.is_bot IS NULL;

ALTER TABLE public.game_players
  ALTER COLUMN is_bot SET DEFAULT false,
  ALTER COLUMN is_bot SET NOT NULL;

ALTER TABLE public.game_players
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.game_players
  ALTER COLUMN game_id SET NOT NULL;

ALTER TABLE public.game_players
  ADD CONSTRAINT game_players_participant_check
    CHECK (
      (game_players.is_bot = true AND user_id IS NULL AND game_id IS NOT NULL)
        OR
      (game_players.is_bot = false AND user_id IS NOT NULL AND game_id IS NOT NULL)
      );

ALTER TABLE public.game_players
  ADD CONSTRAINT game_players_human_id_key UNIQUE (game_id, user_id);

-- A request is independent of the generated seat and retains its original reply.
CREATE TABLE public.bot_addition_requests
(
  user_id    uuid  NOT NULL REFERENCES public.profiles (id),
  game_id    uuid  NOT NULL REFERENCES public.games (id),
  request_id uuid  NOT NULL,
  result     jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  PRIMARY KEY (user_id, game_id, request_id)
);
ALTER TABLE public.bot_addition_requests
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bot_addition_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.bot_addition_requests TO service_role;

CREATE FUNCTION public.add_bot(p_game_id uuid, p_user_id uuid, p_request_id uuid)
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
  INSERT INTO public.game_players(game_id, is_bot)
  VALUES (p_game_id, true)
  RETURNING seat_id INTO v_seat_id;
  v_result := jsonb_build_object('gameId', p_game_id, 'seat_id', v_seat_id);
  INSERT INTO public.bot_addition_requests(user_id, game_id, request_id, result)
  VALUES (p_user_id, p_game_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_bot(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_bot(uuid, uuid, uuid) TO service_role;


DROP FUNCTION public.get_game_players(p_game_id uuid, p_user_id uuid);
CREATE OR REPLACE FUNCTION public.get_game_players(p_game_id uuid, p_user_id uuid)
  RETURNS TABLE
          (
            user_id               uuid,
            is_ready              boolean,
            seat_count            integer,
            turn_duration_minutes integer,
            display_name          text,
            is_bot                boolean,
            seat_id               uuid
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
    SELECT gp.user_id,
           gp.is_ready,
           v_game.seat_count,
           v_game.turn_duration_minutes,
           p.display_name,
           gp.is_bot,
           gp.seat_id
    FROM public.game_players AS gp
           LEFT JOIN public.profiles AS p
                     ON gp.user_id = p.id
    WHERE (gp.game_id = p_game_id)
    ORDER BY gp.user_id, gp.seat_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_game_players(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_game_players(uuid, uuid) TO service_role;
