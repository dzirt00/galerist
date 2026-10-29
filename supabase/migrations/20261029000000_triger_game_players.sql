CREATE FUNCTION public.change_game_player()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_ready IS DISTINCT FROM NEW.is_ready THEN
    PERFORM realtime.send(
    '{}':: jsonb,
    'data is changed',
    'lobby:' || NEW.game_id::text,
    true
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER change_game_player
AFTER UPDATE ON public.game_players
FOR EACH ROW
EXECUTE FUNCTION public.change_game_player();


CREATE FUNCTION public.has_user_id_and_game_id(p_topic text)
RETURNS boolean SECURITY DEFINER SET search_path = ''
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.game_players
    WHERE user_id = auth.uid()   AND ('lobby:' || game_id::text) = p_topic

  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_user_id_and_game_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_user_id_and_game_id(text) TO authenticated;

CREATE POLICY change_game_player ON realtime.messages
FOR SELECT TO authenticated USING (extension = 'broadcast' AND public.has_user_id_and_game_id(realtime.topic()));
