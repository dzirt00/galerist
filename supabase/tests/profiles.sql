-- Executed after the real migration, in a disposable database.
-- Any failed assertion stops psql and fails the test command.
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.profiles) <> 2 THEN
    RAISE EXCEPTION 'Trigger must create one profile per new user';
  END IF;
  IF EXISTS (
    SELECT 1 FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL OR p.created_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Profiles must preserve user IDs and generate created_at';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass) THEN
    RAISE EXCEPTION 'RLS must be enabled';
  END IF;
END;
$$;
\echo PASS: migration and automatic profile creation

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles) THEN
    RAISE EXCEPTION 'Anonymous users must not read profiles';
  END IF;
END;
$$;
RESET ROLE;
\echo PASS: anonymous reads return no profiles

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.profiles) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = '11111111-1111-4111-8111-111111111111'
    ) THEN
    RAISE EXCEPTION 'First user must see exactly their own profile';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = '22222222-2222-4222-8222-222222222222') THEN
    RAISE EXCEPTION 'First user must not read second user profile by ID';
  END IF;
END;
$$;
\echo PASS: first user can read own profile but not another profile

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.profiles) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = '22222222-2222-4222-8222-222222222222'
    ) THEN
    RAISE EXCEPTION 'Second user must see exactly their own profile';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = '11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'Second user must not read first user profile by ID';
  END IF;
  BEGIN
    INSERT INTO public.profiles (id) VALUES ('33333333-3333-4333-8333-333333333333');
    RAISE EXCEPTION 'Authenticated user must not insert profiles';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;
\echo PASS: second user is isolated and cannot insert profiles

DO $$
BEGIN
  BEGIN
    DELETE FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'Existing profile must block user deletion (NO ACTION)';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END;
$$;
\echo PASS: foreign key preserves the confirmed NO ACTION behavior
