-- Unclassified files remain private to their uploader and organization managers.
ALTER TABLE value_lens.files ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE value_lens.file_uploads ALTER COLUMN project_id DROP NOT NULL;
CREATE TABLE value_lens.workspace_task_series (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_task_series_scope ON value_lens.workspace_task_series(org_id,project_id,position,id);
CREATE INDEX workspace_task_series_page ON value_lens.workspace_task_series(org_id,position,id);
ALTER TABLE value_lens.workspace_task_series ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_task_series FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_task_series TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_task_series TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_intake_items (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_intake_items_scope ON value_lens.workspace_intake_items(org_id,project_id,position,id);
CREATE INDEX workspace_intake_items_page ON value_lens.workspace_intake_items(org_id,position,id);
ALTER TABLE value_lens.workspace_intake_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_intake_items FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_intake_items TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_intake_items TO value_lens_app USING(true) WITH CHECK(true);

CREATE OR REPLACE FUNCTION value_lens.read_workspace(target_org text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=value_lens,pg_catalog AS $$
 SELECT CASE WHEN o.storage_version=1 THEN o.body ELSE (o.body::jsonb || jsonb_build_object(
 'projects',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_projects e WHERE e.org_id=o.id),'[]'::jsonb),
 'tasks',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_tasks e WHERE e.org_id=o.id),'[]'::jsonb),
 'documents',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_documents e WHERE e.org_id=o.id),'[]'::jsonb),
 'expenses',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_expenses e WHERE e.org_id=o.id),'[]'::jsonb),
 'indicators',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_indicators e WHERE e.org_id=o.id),'[]'::jsonb),
 'measurements',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_measurements e WHERE e.org_id=o.id),'[]'::jsonb),
 'reports',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_reports e WHERE e.org_id=o.id),'[]'::jsonb),
 'events',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_events e WHERE e.org_id=o.id),'[]'::jsonb),
 'annualPlans',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_annual_plans e WHERE e.org_id=o.id),'[]'::jsonb),
 'annualGoals',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_annual_goals e WHERE e.org_id=o.id),'[]'::jsonb),
 'annualReports',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_annual_reports e WHERE e.org_id=o.id),'[]'::jsonb),
 'activities',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_activities e WHERE e.org_id=o.id),'[]'::jsonb),
 'budgetLines',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_budget_lines e WHERE e.org_id=o.id),'[]'::jsonb),
 'taskSeries',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_task_series e WHERE e.org_id=o.id),'[]'::jsonb),
 'intakeItems',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_intake_items e WHERE e.org_id=o.id),'[]'::jsonb),
 'annualAllocations',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_annual_allocations e WHERE e.org_id=o.id),'[]'::jsonb)
 ))::text END FROM value_lens.organizations o WHERE o.id=target_org;
$$;
REVOKE ALL ON FUNCTION value_lens.read_workspace(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION value_lens.read_workspace(text) TO value_lens_app;
