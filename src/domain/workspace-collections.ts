// Names are fixed in code, never accepted as SQL identifiers from a request.
export const workspaceTables={projects:'workspace_projects',tasks:'workspace_tasks',documents:'workspace_documents',expenses:'workspace_expenses',indicators:'workspace_indicators',measurements:'workspace_measurements',reports:'workspace_reports',events:'workspace_events',annualPlans:'workspace_annual_plans',annualGoals:'workspace_annual_goals',annualReports:'workspace_annual_reports',activities:'workspace_activities',budgetLines:'workspace_budget_lines',annualAllocations:'workspace_annual_allocations'} as const;
export type Collection=keyof typeof workspaceTables;
export const collectionKeys=Object.keys(workspaceTables) as Collection[];
