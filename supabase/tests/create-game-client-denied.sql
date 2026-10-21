DO $$
DECLARE
  table_name text;
  has_rows boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['games', 'game_players', 'game_passwords', 'game_creation_requests'] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', table_name) INTO STRICT has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'Client must not read creation rows';
    END IF;
  END LOOP;
  BEGIN
    INSERT INTO public.games (creator_id, seat_count)
    VALUES ('11111111-1111-4111-8111-111111111111', 2);
    RAISE EXCEPTION 'Client must not create rooms directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.create_game('11111111-1111-4111-8111-111111111111',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 2, NULL);
    RAISE EXCEPTION 'Client must not invoke creation';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
