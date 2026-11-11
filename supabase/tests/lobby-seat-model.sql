-- Model preparation only: bot commands and roster projection are not implemented yet.
INSERT INTO auth.users(id) VALUES ('92929292-9292-4292-8292-929292929292');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  human_id uuid := '92929292-9292-4292-8292-929292929292';
  room_id uuid;
  other_room_id uuid;
  human_seat uuid;
  first_bot uuid;
  second_bot uuid;
BEGIN
  INSERT INTO public.games(creator_id, seat_count)
    VALUES (human_id, 4) RETURNING id INTO room_id;
  INSERT INTO public.games(creator_id, seat_count)
    VALUES (human_id, 4) RETURNING id INTO other_room_id;

  -- Existing commands supply only these two columns.
  INSERT INTO public.game_players(game_id, user_id)
    VALUES (room_id, human_id) RETURNING seat_id INTO human_seat;
  IF human_seat IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.game_players
    WHERE seat_id = human_seat AND is_bot IS FALSE AND is_ready IS FALSE
  ) THEN
    RAISE EXCEPTION 'Human insert must generate a seat and preserve readiness/default kind';
  END IF;
  INSERT INTO public.game_players(game_id, user_id)
    VALUES (other_room_id, human_id);

  INSERT INTO public.game_players(game_id, is_bot)
    VALUES (room_id, true) RETURNING seat_id INTO first_bot;
  INSERT INTO public.game_players(game_id, is_bot)
    VALUES (room_id, true) RETURNING seat_id INTO second_bot;
  IF first_bot IS NULL OR second_bot IS NULL OR first_bot = second_bot
    OR (SELECT count(*) FROM public.game_players WHERE game_id = room_id) <> 3 THEN
    RAISE EXCEPTION 'Two profile-free bots must have distinct seats and count toward occupancy';
  END IF;

  BEGIN
    INSERT INTO public.game_players(game_id, user_id) VALUES (room_id, human_id);
    RAISE EXCEPTION 'TEST: duplicate human accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.game_players(game_id, is_bot) VALUES (room_id, false);
    RAISE EXCEPTION 'TEST: human without profile accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.game_players(game_id, user_id, is_bot)
      VALUES (room_id, human_id, true);
    RAISE EXCEPTION 'TEST: bot with profile accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.game_players(game_id, is_bot) VALUES (room_id, NULL);
    RAISE EXCEPTION 'TEST: unknown participant kind accepted';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.game_players(game_id, is_bot) VALUES (NULL, true);
    RAISE EXCEPTION 'TEST: room-free seat accepted';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.game_players(game_id, user_id)
      VALUES (room_id, '93939393-9393-4393-8393-939393939393');
    RAISE EXCEPTION 'TEST: nonexistent profile accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.game_players(game_id, seat_id, is_bot)
      VALUES (room_id, first_bot, true);
    RAISE EXCEPTION 'TEST: duplicate seat ID accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.game_players SET is_bot = false WHERE seat_id = first_bot;
    RAISE EXCEPTION 'TEST: bot converted to profile-free human';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.game_players WHERE game_id = room_id) <> 3
    OR NOT EXISTS (SELECT 1 FROM public.game_players
      WHERE seat_id = first_bot AND is_bot IS TRUE AND user_id IS NULL) THEN
    RAISE EXCEPTION 'Rejected writes must preserve seats';
  END IF;
  RAISE NOTICE 'PASS: seat defaults, human uniqueness, two bots, profile FK and rejected inconsistent writes';
END;
$$;
RESET ROLE;
