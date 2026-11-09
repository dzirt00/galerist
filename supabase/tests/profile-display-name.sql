-- Run after migrations inside a transaction; all fixtures are rolled back.
INSERT INTO auth.users (id, raw_user_meta_data) VALUES
  ('09000000-0000-4000-8000-000000000001', '{"display_name":" АнНа "}'),
  ('09000000-0000-4000-8000-000000000002', '{"display_name":"я"}'),
  ('09000000-0000-4000-8000-000000000003', jsonb_build_object('display_name', repeat('ю', 30)));

DO $$
DECLARE
  input jsonb;
  rejected boolean;
  failed_id uuid := '09000000-0000-4000-8000-000000000004';
BEGIN
  IF (SELECT display_name FROM public.profiles
      WHERE id = '09000000-0000-4000-8000-000000000001') IS DISTINCT FROM 'анна' THEN
    RAISE EXCEPTION 'Registration must normalize case and surrounding spaces';
  END IF;
  FOR input IN SELECT value FROM jsonb_array_elements(
    '[{}, {"display_name":null}, {"display_name":""}, {"display_name":"   "},
      {"display_name":123}, {"display_name":true}, {"display_name":[]}, {"display_name":{}}]'::jsonb)
    UNION ALL SELECT jsonb_build_object('display_name', repeat('я', 31))
  LOOP
    rejected := false;
    BEGIN
      INSERT INTO auth.users(id, raw_user_meta_data) VALUES (failed_id, input);
    EXCEPTION WHEN not_null_violation OR check_violation OR invalid_parameter_value OR raise_exception THEN
      rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'Invalid name accepted: %', input; END IF;
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = failed_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = failed_id) THEN
      RAISE EXCEPTION 'Rejected name left a partial registration';
    END IF;
  END LOOP;
  rejected := false;
  BEGIN
    INSERT INTO auth.users(id, raw_user_meta_data) VALUES (failed_id, '{"display_name":"АННА"}');
  EXCEPTION WHEN unique_violation THEN rejected := true;
  END;
  IF NOT rejected OR EXISTS (SELECT 1 FROM auth.users WHERE id = failed_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = failed_id) THEN
    RAISE EXCEPTION 'Duplicate normalized name must roll back Auth and profile';
  END IF;
END; $$;
\echo PASS: normalized names, 1/30-character boundaries, missing/empty/long names and atomic rejection

-- Even another valid name must not be writable by the authenticated owner.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '09000000-0000-4000-8000-000000000001', true);
DO $$
DECLARE affected integer;
BEGIN
  IF (SELECT display_name FROM public.profiles) IS DISTINCT FROM 'анна' THEN
    RAISE EXCEPTION 'Owner must read their own confirmed name only';
  END IF;
  UPDATE public.profiles SET display_name = 'другое';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Client renamed a profile'; END IF;
END; $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT display_name FROM public.profiles
      WHERE id = '09000000-0000-4000-8000-000000000001') IS DISTINCT FROM 'анна' THEN
    RAISE EXCEPTION 'Client changed the stored name';
  END IF;
END; $$;

-- Auth metadata can change without changing the immutable profile name.
UPDATE auth.users SET raw_user_meta_data = '{"display_name":"новое"}'
WHERE id = '09000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF (SELECT display_name FROM public.profiles
      WHERE id = '09000000-0000-4000-8000-000000000001') IS DISTINCT FROM 'анна' THEN
    RAISE EXCEPTION 'Metadata updates must not rename a profile';
  END IF;
END; $$;
\echo PASS: own-name RLS read, forbidden client rename and metadata independence
