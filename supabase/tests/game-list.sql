SAVEPOINT game_list_test;
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.get_game_list()) THEN
    RAISE EXCEPTION 'Empty database must return no rooms';
  END IF;
END; $$;
RESET ROLE;

INSERT INTO auth.users VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
INSERT INTO public.games (id, creator_id, seat_count) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 2),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 3),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 4);
INSERT INTO public.game_players (game_id, user_id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222');
INSERT INTO public.game_passwords VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'private-hash-never-in-dto');

SET LOCAL ROLE service_role;
DO $$
DECLARE
  result jsonb;
  expected jsonb := '[
    {"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","seat_count":2,"occupiedSeatCount":2,"hasPassword":true,"turnDurationMinutes":3},
    {"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","seat_count":3,"occupiedSeatCount":0,"hasPassword":false,"turnDurationMinutes":3},
    {"id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","seat_count":4,"occupiedSeatCount":1,"hasPassword":false,"turnDurationMinutes":3}
  ]';
  before_rows jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(gp) ORDER BY gp.game_id, gp.user_id)
    INTO before_rows FROM public.game_players gp;
  SELECT jsonb_agg(to_jsonb(g) - 'ordinality' ORDER BY g.ordinality)
    INTO result FROM public.get_game_list() WITH ORDINALITY g;
  IF result IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Wrong list DTO, room counts, password flags or ordering: %', result;
  END IF;
  IF (SELECT jsonb_agg(to_jsonb(gp) ORDER BY gp.game_id, gp.user_id)
      FROM public.game_players gp) IS DISTINCT FROM before_rows THEN
    RAISE EXCEPTION 'List must not modify participants';
  END IF;
  -- A fresh read must reflect changed occupancy without losing the room.
  PERFORM public.join_game('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222');
  IF (SELECT "occupiedSeatCount" FROM public.get_game_list()
      WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') <> 1 THEN
    RAISE EXCEPTION 'List must reflect newly joined participants';
  END IF;
END; $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM public.get_game_list();
  RAISE EXCEPTION 'TEST: anonymous client could call server-only list';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END; $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.get_game_list();
  RAISE EXCEPTION 'TEST: authenticated client could call server-only list';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END; $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT game_list_test;
RELEASE SAVEPOINT game_list_test;
\echo PASS: single-call list, empty/full rooms, isolated counts, safe DTO, fresh occupancy and server-only execution
