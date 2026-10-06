-- Existing organizations stay readable by the previous release until their first successful new write.
ALTER TABLE value_lens.organizations ADD COLUMN storage_version integer NOT NULL DEFAULT 1 CHECK(storage_version IN (1,2));
CREATE TABLE value_lens.workspace_checkpoints (
 org_id text PRIMARY KEY REFERENCES value_lens.organizations(id), revision integer NOT NULL,
 body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE value_lens.workspace_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_checkpoints FROM PUBLIC;
GRANT SELECT,INSERT ON value_lens.workspace_checkpoints TO value_lens_app;
CREATE POLICY server_read ON value_lens.workspace_checkpoints FOR SELECT TO value_lens_app USING(true);
CREATE POLICY server_checkpoint ON value_lens.workspace_checkpoints FOR INSERT TO value_lens_app WITH CHECK(true);

CREATE TABLE value_lens.workspace_projects (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_projects_scope ON value_lens.workspace_projects(org_id,project_id,position,id);
CREATE INDEX workspace_projects_page ON value_lens.workspace_projects(org_id,position,id);
ALTER TABLE value_lens.workspace_projects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_projects FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_projects TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_projects TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_tasks (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_tasks_scope ON value_lens.workspace_tasks(org_id,project_id,position,id);
CREATE INDEX workspace_tasks_page ON value_lens.workspace_tasks(org_id,position,id);
ALTER TABLE value_lens.workspace_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_tasks FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_tasks TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_tasks TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_documents (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_documents_scope ON value_lens.workspace_documents(org_id,project_id,position,id);
CREATE INDEX workspace_documents_page ON value_lens.workspace_documents(org_id,position,id);
ALTER TABLE value_lens.workspace_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_documents FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_documents TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_documents TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_expenses (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_expenses_scope ON value_lens.workspace_expenses(org_id,project_id,position,id);
CREATE INDEX workspace_expenses_page ON value_lens.workspace_expenses(org_id,position,id);
ALTER TABLE value_lens.workspace_expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_expenses FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_expenses TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_expenses TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_indicators (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_indicators_scope ON value_lens.workspace_indicators(org_id,project_id,position,id);
CREATE INDEX workspace_indicators_page ON value_lens.workspace_indicators(org_id,position,id);
ALTER TABLE value_lens.workspace_indicators ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_indicators FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_indicators TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_indicators TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_measurements (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_measurements_scope ON value_lens.workspace_measurements(org_id,project_id,position,id);
CREATE INDEX workspace_measurements_page ON value_lens.workspace_measurements(org_id,position,id);
ALTER TABLE value_lens.workspace_measurements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_measurements FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_measurements TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_measurements TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_reports (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_reports_scope ON value_lens.workspace_reports(org_id,project_id,position,id);
CREATE INDEX workspace_reports_page ON value_lens.workspace_reports(org_id,position,id);
ALTER TABLE value_lens.workspace_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_reports FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_reports TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_reports TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_events (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_events_scope ON value_lens.workspace_events(org_id,project_id,position,id);
CREATE INDEX workspace_events_page ON value_lens.workspace_events(org_id,position,id);
ALTER TABLE value_lens.workspace_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_events FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_events TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_events TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_annual_plans (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_annual_plans_scope ON value_lens.workspace_annual_plans(org_id,project_id,position,id);
CREATE INDEX workspace_annual_plans_page ON value_lens.workspace_annual_plans(org_id,position,id);
ALTER TABLE value_lens.workspace_annual_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_annual_plans FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_annual_plans TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_annual_plans TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_annual_goals (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_annual_goals_scope ON value_lens.workspace_annual_goals(org_id,project_id,position,id);
CREATE INDEX workspace_annual_goals_page ON value_lens.workspace_annual_goals(org_id,position,id);
ALTER TABLE value_lens.workspace_annual_goals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_annual_goals FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_annual_goals TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_annual_goals TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_annual_reports (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_annual_reports_scope ON value_lens.workspace_annual_reports(org_id,project_id,position,id);
CREATE INDEX workspace_annual_reports_page ON value_lens.workspace_annual_reports(org_id,position,id);
ALTER TABLE value_lens.workspace_annual_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_annual_reports FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_annual_reports TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_annual_reports TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_activities (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_activities_scope ON value_lens.workspace_activities(org_id,project_id,position,id);
CREATE INDEX workspace_activities_page ON value_lens.workspace_activities(org_id,position,id);
ALTER TABLE value_lens.workspace_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_activities FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_activities TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_activities TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_budget_lines (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_budget_lines_scope ON value_lens.workspace_budget_lines(org_id,project_id,position,id);
CREATE INDEX workspace_budget_lines_page ON value_lens.workspace_budget_lines(org_id,position,id);
ALTER TABLE value_lens.workspace_budget_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_budget_lines FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_budget_lines TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_budget_lines TO value_lens_app USING(true) WITH CHECK(true);

CREATE TABLE value_lens.workspace_annual_allocations (
 org_id text NOT NULL REFERENCES value_lens.organizations(id),id text NOT NULL,project_id text,
 position bigint NOT NULL,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX workspace_annual_allocations_scope ON value_lens.workspace_annual_allocations(org_id,project_id,position,id);
CREATE INDEX workspace_annual_allocations_page ON value_lens.workspace_annual_allocations(org_id,position,id);
ALTER TABLE value_lens.workspace_annual_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON value_lens.workspace_annual_allocations FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON value_lens.workspace_annual_allocations TO value_lens_app;
CREATE POLICY server_access ON value_lens.workspace_annual_allocations TO value_lens_app USING(true) WITH CHECK(true);

CREATE FUNCTION value_lens.read_workspace(target_org text) RETURNS text
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
 'annualAllocations',COALESCE((SELECT jsonb_agg(e.data ORDER BY e.position,e.id) FROM value_lens.workspace_annual_allocations e WHERE e.org_id=o.id),'[]'::jsonb)
 ))::text END FROM value_lens.organizations o WHERE o.id=target_org;
$$;
REVOKE ALL ON FUNCTION value_lens.read_workspace(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION value_lens.read_workspace(text) TO value_lens_app;
