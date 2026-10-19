-- Test fixture for PostgreSQL without the Supabase services.
-- auth.users is deliberately minimal: these tests exercise our migration, not Auth.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

-- Give both API roles table privileges so that visibility is decided by RLS,
-- rather than an unrelated permission-denied error. Supabase grants privileges
-- separately from row policies; this fixture is not a deployment migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated;
