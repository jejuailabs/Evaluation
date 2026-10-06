CREATE TABLE value_lens.project_comments (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  org_id text NOT NULL REFERENCES value_lens.organizations(id),
  project_id text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('project','task','activity','document','measurement','expense')),
  target_id text NOT NULL,
  author_id text NOT NULL REFERENCES value_lens.users(id),
  body text NOT NULL CHECK (char_length(body) <= 3000),
  mentions text[] NOT NULL DEFAULT '{}',
  request_hash text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  edits jsonb NOT NULL DEFAULT '[]',
  created_at text NOT NULL,
  updated_at text,
  deleted_at text,
  deleted_by text REFERENCES value_lens.users(id)
);
CREATE INDEX comments_thread_cursor ON value_lens.project_comments(org_id,project_id,target_type,target_id,seq DESC);
CREATE INDEX comments_author_rate ON value_lens.project_comments(author_id,org_id,created_at DESC);
CREATE INDEX comments_deleted_by ON value_lens.project_comments(deleted_by) WHERE deleted_by IS NOT NULL;
CREATE TABLE value_lens.notifications (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  org_id text NOT NULL REFERENCES value_lens.organizations(id),
  project_id text NOT NULL,
  recipient_id text NOT NULL REFERENCES value_lens.memberships(id),
  event_id text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL CHECK (char_length(title) <= 240),
  target_type text NOT NULL CHECK (target_type IN ('project','task','activity','document','measurement','expense')),
  target_id text NOT NULL,
  created_at text NOT NULL,
  read_at text,
  UNIQUE(event_id,recipient_id,kind)
);
CREATE INDEX notifications_recipient_cursor ON value_lens.notifications(recipient_id,org_id,seq DESC);
CREATE INDEX notifications_org ON value_lens.notifications(org_id);
CREATE INDEX notifications_unread ON value_lens.notifications(recipient_id,project_id) WHERE read_at IS NULL;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['project_comments','notifications'] LOOP
    EXECUTE format('REVOKE ALL ON value_lens.%I FROM PUBLIC',t);
    EXECUTE format('ALTER TABLE value_lens.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.%I TO value_lens_app',t);
    EXECUTE format('CREATE POLICY server_access ON value_lens.%I TO value_lens_app USING (true) WITH CHECK (true)',t);
  END LOOP;
END $$;
REVOKE ALL ON SEQUENCE value_lens.project_comments_seq_seq, value_lens.notifications_seq_seq FROM PUBLIC;
GRANT USAGE,SELECT ON SEQUENCE value_lens.project_comments_seq_seq, value_lens.notifications_seq_seq TO value_lens_app;
