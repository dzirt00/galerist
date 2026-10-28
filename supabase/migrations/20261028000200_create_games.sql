ALTER TABLE public.games
ADD COLUMN turn_duration_minutes integer NOT NULL DEFAULT 3
CHECK (turn_duration_minutes BETWEEN 1 AND 10);

DROP FUNCTION public.create_game(uuid, uuid, integer, text);
create function public.create_game(
  p_creator_id  uuid,
  p_request_id  uuid,
  p_seat_count  integer,
  p_password_hash  text,
  p_turn_duration_minutes  integer
)
returns uuid
language plpgsql
security invoker set search_path = ''
as $$
DECLARE
v_game_id uuid;
begin

IF p_creator_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Creator ID and request ID are required'; END IF;
IF NOT (p_turn_duration_minutes BETWEEN 1 AND 10) THEN
    RAISE EXCEPTION 'invalid turn_duration_minutes';
END IF;
PERFORM  pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((p_creator_id::text  ||':' || p_request_id::text)::text, 0));
SELECT game_id INTO v_game_id
FROM public.game_creation_requests
WHERE user_id = p_creator_id AND request_id = p_request_id;
IF v_game_id IS NOT NULL  THEN RETURN v_game_id; END IF;
INSERT INTO public.games (creator_id, seat_count, turn_duration_minutes)
VALUES (p_creator_id, p_seat_count, p_turn_duration_minutes)
RETURNING id INTO v_game_id;
INSERT INTO public.game_players (game_id, user_id)
VALUES (v_game_id,p_creator_id);
IF p_password_hash IS NOT NULL THEN INSERT INTO public.game_passwords(game_id,password_hash) VALUES (v_game_id,p_password_hash); END IF;
INSERT INTO public.game_creation_requests(user_id,request_id,game_id)
VALUES (p_creator_id,p_request_id,v_game_id);
RETURN v_game_id;
end; $$;
REVOKE EXECUTE ON FUNCTION public.create_game(uuid, uuid, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_game(uuid, uuid, integer, text, integer)  TO service_role;
GRANT SELECT, INSERT ON TABLE public.games, public.game_players, public.game_creation_requests, public.game_passwords TO service_role;
