CREATE TABLE value_lens.document_text (
 org_id text NOT NULL REFERENCES value_lens.organizations(id), version_id text NOT NULL,
 content text NOT NULL CHECK(length(content)<=1000000), warnings jsonb NOT NULL DEFAULT '[]',
 indexed_at text NOT NULL, PRIMARY KEY(org_id,version_id)
);
CREATE INDEX document_text_org ON value_lens.document_text(org_id);
CREATE TABLE value_lens.file_checks (
 file_id text PRIMARY KEY, org_id text NOT NULL REFERENCES value_lens.organizations(id),
 sha256 text NOT NULL, status text NOT NULL CHECK(status IN ('passed','blocked')), details jsonb NOT NULL,
 checked_at text NOT NULL
);
CREATE INDEX file_checks_org ON value_lens.file_checks(org_id);
CREATE TABLE value_lens.background_jobs (
 id text PRIMARY KEY, org_id text NOT NULL REFERENCES value_lens.organizations(id),
 user_id text NOT NULL REFERENCES value_lens.users(id), project_id text,
 kind text NOT NULL CHECK(kind IN ('tts','transcribe','convert','analyze','narrative')),
 payload jsonb NOT NULL CHECK(octet_length(payload::text)<=1500000),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','succeeded','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 lease_token text, lease_until timestamptz, result jsonb, error text, created_at text NOT NULL, updated_at text NOT NULL
);
CREATE INDEX background_jobs_claim ON value_lens.background_jobs(available_at) WHERE state IN ('queued','running');
CREATE INDEX background_jobs_org_user ON value_lens.background_jobs(org_id,user_id,created_at DESC);
CREATE TABLE value_lens.report_assets (
 id text PRIMARY KEY, org_id text NOT NULL REFERENCES value_lens.organizations(id), report_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('project','annual')), file_id text NOT NULL REFERENCES value_lens.files(id),
 digest text NOT NULL, report_version integer NOT NULL, created_by text NOT NULL REFERENCES value_lens.users(id),
 created_at text NOT NULL, UNIQUE(org_id,report_id,report_version,file_id)
);
CREATE INDEX report_assets_report ON value_lens.report_assets(org_id,report_id);
CREATE TABLE value_lens.report_templates (
 id text PRIMARY KEY, org_id text NOT NULL REFERENCES value_lens.organizations(id),
 name text NOT NULL, version integer NOT NULL, file_id text NOT NULL REFERENCES value_lens.files(id),
 mapping jsonb NOT NULL, created_by text NOT NULL REFERENCES value_lens.users(id), created_at text NOT NULL,
 UNIQUE(org_id,name,version)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['document_text','file_checks','background_jobs','report_assets','report_templates'] LOOP
  EXECUTE format('REVOKE ALL ON value_lens.%I FROM PUBLIC',t);
  EXECUTE format('ALTER TABLE value_lens.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.%I TO value_lens_app',t);
  EXECUTE format('CREATE POLICY server_access ON value_lens.%I TO value_lens_app USING (true) WITH CHECK (true)',t);
 END LOOP;
END $$;
-- Frozen submission bytes and template versions are append-only, including for the application role.
REVOKE UPDATE,DELETE ON value_lens.report_assets,value_lens.report_templates FROM value_lens_app;
-- Hosted PostgreSQL supports pg_net; local PGlite verification omits this hosted-only extension.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_net') THEN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
 END IF;
END $$;
