-- Read-only restoration: identity is supplied by the authenticated Edge Function.
CREATE FUNCTION public.get_own_lobby(p_game_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_game public.games%ROWTYPE;
BEGIN
  IF p_game_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Room and user IDs are required' USING ERRCODE = '22023';
  END IF;
  -- Same lock order as create/join: user, then room.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.creator_id <> p_user_id OR v_game.status <> 'OPEN_LOBBY' THEN
    RAISE EXCEPTION 'Open owned lobby not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_players WHERE game_id = p_game_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Owner membership not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'id', v_game.id,
    'seat_count', v_game.seat_count,
    'occupiedSeatCount', (SELECT count(*) FROM public.game_players WHERE game_id = p_game_id),
    'hasPassword', EXISTS (SELECT 1 FROM public.game_passwords WHERE game_id = p_game_id),
    'turnDurationMinutes', v_game.turn_duration_minutes
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_own_lobby(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_own_lobby(uuid, uuid) TO service_role;

-- Closed rooms and started games are no longer joinable lobbies.
CREATE OR REPLACE FUNCTION public.get_game_list()
RETURNS TABLE(id uuid, seat_count integer, "occupiedSeatCount" bigint, "hasPassword" boolean, "turnDurationMinutes" integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT g.id, g.seat_count,
    (SELECT count(*) FROM public.game_players gp WHERE gp.game_id = g.id),
    EXISTS (SELECT 1 FROM public.game_passwords pw WHERE pw.game_id = g.id),
    g.turn_duration_minutes
  FROM public.games g
  WHERE g.status = 'OPEN_LOBBY'
  ORDER BY g.id;
$$;
