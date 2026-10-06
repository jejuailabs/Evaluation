-- Private application schema. The browser never queries these tables directly.
CREATE SCHEMA IF NOT EXISTS value_lens;
REVOKE ALL ON SCHEMA value_lens FROM PUBLIC;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'value_lens_app') THEN
    CREATE ROLE value_lens_app NOLOGIN;
  END IF;
END $$;
GRANT value_lens_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA value_lens TO value_lens_app;
SET LOCAL search_path TO value_lens, pg_catalog;

CREATE TABLE users (id text PRIMARY KEY, email text NOT NULL, name text NOT NULL, created_at text NOT NULL);
CREATE TABLE organizations (id text PRIMARY KEY, name text NOT NULL, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')), revision integer NOT NULL DEFAULT 0 CHECK(revision>=0), body text NOT NULL, created_at text NOT NULL);
CREATE TABLE memberships (id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id), user_id text NOT NULL REFERENCES users(id), role text NOT NULL CHECK(role IN ('owner','admin','member','viewer')), active integer NOT NULL DEFAULT 1 CHECK(active IN (0,1)), UNIQUE(org_id,user_id));
CREATE TABLE project_members (org_id text NOT NULL REFERENCES organizations(id), project_id text NOT NULL, member_id text NOT NULL REFERENCES memberships(id), UNIQUE(org_id,project_id,member_id));
CREATE TABLE invitations (id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id), email text NOT NULL, role text NOT NULL CHECK(role IN ('admin','member','viewer')), token_hash text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'pending', expires_at text NOT NULL, created_by text NOT NULL, created_at text NOT NULL);
CREATE TABLE operations (id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id), actor_id text NOT NULL, action text NOT NULL, request_hash text NOT NULL, created_at text NOT NULL);
CREATE TABLE files (id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id), project_id text NOT NULL, uploader_id text NOT NULL, name text NOT NULL, size integer NOT NULL CHECK(size>0 AND size<=26214400), created_at text NOT NULL);
CREATE TABLE file_uploads (id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id), project_id text NOT NULL, uploader_id text NOT NULL, name text NOT NULL, size integer NOT NULL CHECK(size>0 AND size<=26214400), created_at text NOT NULL, expires_at text NOT NULL);
CREATE TABLE platform_audit (id text PRIMARY KEY, actor_id text NOT NULL, org_id text NOT NULL, action text NOT NULL, reason text NOT NULL, created_at text NOT NULL);
CREATE INDEX memberships_user_active ON memberships(user_id,active);
CREATE INDEX project_members_member ON project_members(org_id,member_id);
CREATE INDEX invitation_org ON invitations(org_id);
CREATE INDEX operations_org_action_created ON operations(org_id,action,created_at);
CREATE INDEX files_org_project ON files(org_id,project_id);
CREATE INDEX uploads_org_expiry ON file_uploads(org_id,expires_at);

-- Only the server role may access data; membership/project authorization is enforced by server/api.ts.
-- No anon/authenticated grants, no SECURITY DEFINER functions, no public-schema tables.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','organizations','memberships','project_members','invitations','operations','files','file_uploads','platform_audit'] LOOP
    EXECUTE format('REVOKE ALL ON value_lens.%I FROM PUBLIC',t);
    EXECUTE format('ALTER TABLE value_lens.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.%I TO value_lens_app',t);
    EXECUTE format('CREATE POLICY server_access ON value_lens.%I TO value_lens_app USING (true) WITH CHECK (true)',t);
  END LOOP;
END $$;
