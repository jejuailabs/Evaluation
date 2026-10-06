CREATE TABLE value_lens.organization_join_keys (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES value_lens.organizations(id),
  token_hash text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('member','viewer')),
  max_uses integer NOT NULL CHECK (max_uses BETWEEN 1 AND 1000),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0 AND uses <= max_uses),
  expires_at text NOT NULL,
  revoked_at text,
  created_by text NOT NULL REFERENCES value_lens.users(id),
  created_at text NOT NULL
);
CREATE UNIQUE INDEX organization_one_join_key ON value_lens.organization_join_keys(org_id) WHERE revoked_at IS NULL;
CREATE TABLE value_lens.join_key_attempts (
  user_id text PRIMARY KEY REFERENCES value_lens.users(id),
  window_start text NOT NULL,
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 10)
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['organization_join_keys','join_key_attempts'] LOOP
    EXECUTE format('REVOKE ALL ON value_lens.%I FROM PUBLIC',t);
    EXECUTE format('ALTER TABLE value_lens.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.%I TO value_lens_app',t);
    EXECUTE format('CREATE POLICY server_access ON value_lens.%I TO value_lens_app USING (true) WITH CHECK (true)',t);
  END LOOP;
END $$;
