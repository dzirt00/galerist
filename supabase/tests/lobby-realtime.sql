-- Execute the real command and trigger; realtime.send is only a SQL capture fixture.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  room uuid;
  other_room uuid;
  first_user uuid := '11111111-1111-4111-8111-111111111111';
  second_user uuid := '22222222-2222-4222-8222-222222222222';
BEGIN
  room := public.create_game(first_user, '73737373-7373-4373-8373-737373737373', 3, NULL, 3);
  other_room := public.create_game(second_user, '74747474-7474-4474-8474-747474747474', 3, NULL, 3);
  PERFORM public.join_game(room, second_user);
  PERFORM set_config('test.lobby.room', room::text, true);
  PERFORM set_config('test.lobby.other', other_room::text, true);
  PERFORM public.ready_to_game(room, first_user, true);
  PERFORM public.ready_to_game(room, first_user, true);
  PERFORM public.ready_to_game(room, first_user, false);
END; $$;
RESET ROLE;
DO $$
DECLARE
  v_topic text := 'lobby:' || current_setting('test.lobby.room');
  total integer;
BEGIN
  SELECT count(*) INTO total FROM realtime.messages m WHERE m.topic = v_topic;
  IF total <> 2 THEN RAISE EXCEPTION 'Readiness toggle must send twice, unchanged value must not send'; END IF;
  IF EXISTS (SELECT FROM realtime.messages m WHERE m.topic = v_topic
    AND (m.event IS DISTINCT FROM 'data is changed' OR m.payload IS DISTINCT FROM '{}'::jsonb
      OR m.private IS DISTINCT FROM true OR m.extension IS DISTINCT FROM 'broadcast')) THEN
    RAISE EXCEPTION 'Signal contract must match private lobby subscriber without roster data';
  END IF;
  BEGIN
    PERFORM public.ready_to_game(current_setting('test.lobby.room')::uuid,
      '11111111-1111-4111-8111-111111111111', true);
    RAISE EXCEPTION 'force rollback' USING ERRCODE = 'P0004';
  EXCEPTION WHEN assert_failure THEN NULL;
  END;
  IF (SELECT count(*) FROM realtime.messages m WHERE m.topic = v_topic) <> total THEN
    RAISE EXCEPTION 'Rolled-back readiness must not leave a notification';
  END IF;
END; $$;

-- Fixture messages exercise both topic isolation and extension restriction.
INSERT INTO realtime.messages VALUES
  ('lobby:' || current_setting('test.lobby.other'), 'broadcast', 'data is changed', '{}', true),
  ('lobby:' || current_setting('test.lobby.room'), 'presence', 'other', '{}', true);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('test.realtime.topic', 'lobby:' || current_setting('test.lobby.room'), true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF NOT public.has_user_id_and_game_id(realtime.topic()) THEN
    RAISE EXCEPTION 'Creator must be authorized for own room';
  END IF;
  -- Emulate the topic filter used by Realtime authorization.
  IF (SELECT count(*) FROM realtime.messages WHERE topic = realtime.topic()) <> 2 THEN
    RAISE EXCEPTION 'Member must receive broadcast, excluding presence';
  END IF;
  IF EXISTS (SELECT FROM public.game_players) THEN
    RAISE EXCEPTION 'Private channel must not open direct roster reads';
  END IF;
END; $$;
SELECT set_config('test.realtime.topic', 'lobby:' || current_setting('test.lobby.other'), true);
DO $$ BEGIN
  IF public.has_user_id_and_game_id(realtime.topic())
    OR EXISTS (SELECT FROM realtime.messages WHERE topic = realtime.topic()) THEN
    RAISE EXCEPTION 'Membership in another room must not grant access';
  END IF;
END; $$;
SELECT set_config('test.realtime.topic', 'lobby:' || current_setting('test.lobby.room'), true);
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
DO $$ BEGIN
  IF NOT public.has_user_id_and_game_id(realtime.topic()) THEN
    RAISE EXCEPTION 'Second participant must be authorized';
  END IF;
END; $$;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
DO $$ BEGIN
  IF EXISTS (SELECT FROM realtime.messages WHERE topic = realtime.topic()) THEN
    RAISE EXCEPTION 'Nonparticipant must not receive notifications';
  END IF;
  IF public.has_user_id_and_game_id(NULL) OR public.has_user_id_and_game_id('lobby:invalid') THEN
    RAISE EXCEPTION 'Null/invalid topics must be denied without casting errors';
  END IF;
END; $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF EXISTS (SELECT FROM realtime.messages) THEN RAISE EXCEPTION 'Anonymous reads must be denied'; END IF;
  BEGIN
    PERFORM public.has_user_id_and_game_id(realtime.topic());
    RAISE EXCEPTION 'TEST: anonymous function call allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END; $$;
RESET ROLE;
SELECT 'PASS: lobby signal contract, rollback, membership and Broadcast RLS (SQL fixture only)';
