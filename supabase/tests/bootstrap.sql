-- Test fixture for PostgreSQL without the Supabase services.
-- auth.users is deliberately minimal: these tests exercise our migration, not Auth.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
-- Local stand-in for Supabase's server role; never a production migration.
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
-- Older lobby fixtures supply only an ID. Give those test users distinct names;
-- profile-specific tests pass metadata explicitly, including missing/invalid names.
CREATE SEQUENCE auth.fixture_profile_name;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  raw_user_meta_data jsonb DEFAULT jsonb_build_object(
    'display_name', 'fixture-' || nextval('auth.fixture_profile_name'))
);

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

-- Give both API roles table privileges so that visibility is decided by RLS,
-- rather than an unrelated permission-denied error. Supabase grants privileges
-- separately from row policies; this fixture is not a deployment migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated;
-- Supabase's server role can read profiles; BYPASSRLS alone grants no table access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO service_role;
