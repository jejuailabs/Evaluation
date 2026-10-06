-- Preserve the same uniqueness while adding a proper row identity and FK lookup.
ALTER TABLE value_lens.project_members
  DROP CONSTRAINT project_members_org_id_project_id_member_id_key,
  ADD CONSTRAINT project_members_pkey PRIMARY KEY (org_id, project_id, member_id);
CREATE INDEX project_members_member_id ON value_lens.project_members(member_id);
