export type ID = string;
export type TaskStatus = 'todo' | 'doing' | 'done';
export type ExpenseStatus = 'planned' | 'confirmed' | 'paid';
export interface Scoped { id: ID; orgId: ID; projectId: ID }
export interface Member { id: ID; name: string; role: string }
export interface Project { id: ID; orgId: ID; name: string; purpose: string; start: string; end: string; ownerId: ID; budget: number; category: string }
export interface Task extends Scoped { title: string; due: string; ownerId: ID; status: TaskStatus }
export interface DocumentVersion { id: ID; name: string; size: number; createdAt: string; blobKey?: string; inlineText?: string }
export interface Document extends Scoped { title: string; versions: DocumentVersion[] }
export interface EvidenceRef { documentId: ID; versionId: ID }
export interface Expense extends Scoped { title: string; amount: number; date: string; ownerId: ID; status: ExpenseStatus; evidence?: EvidenceRef }
export interface Indicator extends Scoped {
  name: string; unit: string; target: number | null; forecast: number | null;
  forecastNote: string; definition: string; source: string; sourceUrl?: string;
  aggregation: 'cumulative-snapshot'; direction: 'higher'; version: number;
}
export interface Measurement extends Scoped {
  indicatorId: ID; asOf: string; value: number; note: string; evidence: EvidenceRef;
  status: 'pending' | 'confirmed'; createdAt: string; confirmedAt?: string;
}
export interface BudgetSummary { allocated: number; committed: number; spent: number; paid: number; available: number; unpaid: number }
export interface MetricSummary { id: ID; name: string; unit: string; target: number | null; forecast: number | null; actual: number | null; rate: number | null; asOf?: string; source: string; sourceUrl?: string; definition: string; definitionVersion: number; evidenceName?: string; evidenceVersionId?: ID; note?: string }
export interface Report extends Scoped {
  title: string; projectName: string; purpose: string; periodStart: string; asOf: string;
  createdAt: string; budget: BudgetSummary; metrics: MetricSummary[];
  completedTasks: number; totalTasks: number; pendingMeasurements: number;
  evidence: { title: string; versionId: ID; name: string }[]; note: string;
}
export interface AuditEvent { id: ID; projectId: ID; action: string; at: string }
export interface Workspace {
  schemaVersion: 1; revision: number;
  organization: { id: ID; name: string }; members: Member[];
  projects: Project[]; tasks: Task[]; documents: Document[]; expenses: Expense[];
  indicators: Indicator[]; measurements: Measurement[]; reports: Report[]; events: AuditEvent[];
}
export type Command =
  | { type: 'project.add'; project: Project }
  | { type: 'task.add'; task: Task }
  | { type: 'task.status'; projectId: ID; taskId: ID; status: TaskStatus }
  | { type: 'document.add'; document: Document }
  | { type: 'document.version'; projectId: ID; documentId: ID; version: DocumentVersion }
  | { type: 'expense.add'; expense: Expense }
  | { type: 'expense.status'; projectId: ID; expenseId: ID; status: ExpenseStatus }
  | { type: 'expense.evidence'; projectId: ID; expenseId: ID; evidence: EvidenceRef }
  | { type: 'indicator.add'; indicator: Indicator }
  | { type: 'measurement.add'; measurement: Measurement }
  | { type: 'measurement.confirm'; projectId: ID; measurementId: ID }
  | { type: 'report.create'; projectId: ID; asOf: string; note: string };
