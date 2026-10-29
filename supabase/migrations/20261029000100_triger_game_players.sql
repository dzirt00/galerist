CREATE OR REPLACE FUNCTION public.change_game_player()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER change_game_player ON public.game_players;
CREATE TRIGGER change_game_player
AFTER UPDATE OR INSERT ON public.game_players
FOR EACH ROW
EXECUTE FUNCTION public.change_game_player();
