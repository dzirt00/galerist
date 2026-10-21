CREATE TABLE public.games(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
creator_id uuid NOT NULL REFERENCES public.profiles(id),
seat_count integer NOT NULL CHECK (seat_count BETWEEN 2 AND 4)
);

CREATE TABLE public.game_players(
game_id uuid REFERENCES public.games(id),
user_id uuid  REFERENCES public.profiles(id),
PRIMARY KEY (game_id, user_id)
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.game_creation_requests(
user_id uuid REFERENCES public.profiles(id),
request_id uuid,
game_id uuid NOT NULL REFERENCES public.games(id),
PRIMARY KEY (user_id, request_id)
);

ALTER TABLE public.game_creation_requests ENABLE ROW LEVEL SECURITY;


CREATE TABLE public.game_passwords(
game_id uuid  NOT NULL PRIMARY KEY REFERENCES public.games(id),
password_hash text  NOT NULL
);

ALTER TABLE public.game_passwords ENABLE ROW LEVEL SECURITY;

create function public.create_game(
  p_creator_id  uuid,
  p_request_id  uuid,
  p_seat_count  integer,
  p_password_hash  text
)
returns uuid
language plpgsql
security invoker set search_path = ''
as $$
DECLARE
v_game_id uuid;
begin

IF p_creator_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Creator ID and request ID are required'; END IF;
PERFORM  pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((p_creator_id::text  ||':' || p_request_id::text)::text, 0));
SELECT game_id INTO v_game_id
FROM public.game_creation_requests
WHERE user_id = p_creator_id AND request_id = p_request_id;
IF v_game_id IS NOT NULL  THEN RETURN v_game_id; END IF;
INSERT INTO public.games (creator_id, seat_count)
VALUES (p_creator_id, p_seat_count)
RETURNING id INTO v_game_id;
INSERT INTO public.game_players (game_id, user_id)
VALUES (v_game_id,p_creator_id);
IF p_password_hash IS NOT NULL THEN INSERT INTO public.game_passwords(game_id,password_hash) VALUES (v_game_id,p_password_hash); END IF;
INSERT INTO public.game_creation_requests(user_id,request_id,game_id)
VALUES (p_creator_id,p_request_id,v_game_id);
RETURN v_game_id;
end; $$;
REVOKE EXECUTE ON FUNCTION public.create_game(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_game(uuid, uuid, integer, text)  TO service_role;
GRANT SELECT, INSERT ON TABLE public.games, public.game_players, public.game_creation_requests, public.game_passwords TO service_role;
