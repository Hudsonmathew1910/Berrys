-- Supabase's public roles (anon, authenticated) never get to run database
-- functions this app creates. The app uses none today; this covers the future.
-- Skipped on plain PostgreSQL (tests), where those roles don't exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
