ALTER TABLE public.game_players
ADD COLUMN is_ready boolean NOT NULL DEFAULT false;


-- Only the trusted Edge Function supplies a verified hash.
-- Remove a previously installed draft signature, if present, to avoid overloads.

CREATE FUNCTION public.ready_to_game(p_game_id uuid, p_user_id uuid, p_is_ready boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_is_ready public.game_players%ROWTYPE;
BEGIN
  IF p_game_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'ID комнаты и пользователя обязательны' USING ERRCODE = '22023';
  END IF;
  IF p_is_ready IS NULL THEN
  RAISE EXCEPTION 'флаг готовности не может быть null' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Комната не найдена' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_is_ready FROM public.game_players WHERE game_id = p_game_id AND p_user_id = user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Комната не найдена' USING ERRCODE = 'P0002';
  END IF;
  IF v_is_ready.is_ready = p_is_ready THEN
    RETURN jsonb_build_object('isReady', p_is_ready);
  END IF;
  UPDATE public.game_players
  SET is_ready = p_is_ready
  WHERE game_id = p_game_id AND p_user_id = user_id;

  RETURN jsonb_build_object('isReady', p_is_ready);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ready_to_game(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ready_to_game(uuid, uuid, boolean) TO service_role;
GRANT UPDATE ON TABLE public.game_players TO service_role;
