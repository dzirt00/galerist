CREATE FUNCTION public.get_game_players(p_game_id uuid, p_user_id uuid)
RETURNS TABLE (user_id uuid, is_ready boolean) LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_game public.games%ROWTYPE;
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
  SELECT gp.user_id, gp.is_ready
  FROM public.game_players AS gp
  WHERE gp.game_id = p_game_id
  ORDER BY gp.user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_game_players(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_game_players(uuid, uuid) TO service_role;

