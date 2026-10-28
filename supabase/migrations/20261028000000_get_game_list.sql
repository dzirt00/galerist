-- One statement and one snapshot for the complete, safe lobby list.
CREATE FUNCTION public.get_game_list()
RETURNS TABLE (
  id uuid,
  seat_count integer,
  "occupiedSeatCount" bigint,
  "hasPassword" boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT g.id, g.seat_count,
    (SELECT count(*) FROM public.game_players AS gp WHERE gp.game_id = g.id),
    EXISTS (SELECT 1 FROM public.game_passwords AS pw WHERE pw.game_id = g.id)
  FROM public.games AS g
  ORDER BY g.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_game_list() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_game_list() TO service_role;
