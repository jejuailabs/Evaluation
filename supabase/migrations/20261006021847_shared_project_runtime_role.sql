-- Separate server credential when Value Lens shares a Supabase project.
-- Provision a random password separately; never place credentials in migrations.
CREATE ROLE value_lens_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT value_lens_app TO value_lens_runtime;
ALTER ROLE value_lens_runtime SET search_path = value_lens, pg_catalog;
ALTER ROLE value_lens_runtime SET statement_timeout = '20s';
ALTER ROLE value_lens_runtime SET idle_in_transaction_session_timeout = '30s';
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO value_lens_runtime', current_database());
END $$;
-- No membership in authenticated, service_role, postgres, or existing app roles.
