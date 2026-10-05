export type ID = string;
export type TaskStatus = 'todo' | 'doing' | 'done';
export type ExpenseStatus = 'planned' | 'confirmed' | 'paid';
export interface Scoped { id: ID; orgId: ID; projectId: ID }
export interface Member { id: ID; name: string; role: string }
export interface Project { id: ID; orgId: ID; name: string; purpose: string; start: string; end: string; ownerId: ID; budget: number; category: string; status?: 'planning'|'active'|'completed'|'archived'; closeNote?: string }
export interface Task extends Scoped { title: string; due: string; ownerId: ID; status: TaskStatus; priority?: 'normal'|'high'; note?: string; indicatorId?: ID; completedAt?: string }
export interface DocumentVersion { id: ID; name: string; size: number; createdAt: string; blobKey?: string; inlineText?: string }
export interface Document extends Scoped { title: string; versions: DocumentVersion[] }
export interface EvidenceRef { documentId: ID; versionId: ID }
export interface Expense extends Scoped { title: string; amount: number; date: string; ownerId: ID; status: ExpenseStatus; evidence?: EvidenceRef }
export interface Indicator extends Scoped {
  name: string; unit: string; target: number | null; forecast: number | null;
  forecastNote: string; definition: string; source: string; sourceUrl?: string;
  aggregation: 'cumulative-snapshot'|'period-sum'|'ratio'|'qualitative'; direction: 'higher'|'lower'; version: number;
  standardId?: string; baseline?: number; rubric?: string;
  revisions?: {at:string;target:number|null;forecast:number|null;forecastNote:string;reason:string;version:number}[];
}
export interface Measurement extends Scoped {
  indicatorId: ID; asOf: string; value: number; note: string; evidence: EvidenceRef;
  status: 'pending' | 'confirmed' | 'rejected'; createdAt: string; confirmedAt?: string;
  periodStart?: string; denominator?: number; assessment?: 'not-yet'|'partial'|'achieved'; supersedesId?: ID; reviewNote?: string;
}
export interface BudgetSummary { allocated: number; committed: number; spent: number; paid: number; available: number; unpaid: number }
export interface MetricSummary { id: ID; name: string; unit: string; target: number | null; forecast: number | null; actual: number | null; rate: number | null; asOf?: string; source: string; sourceUrl?: string; definition: string; definitionVersion: number; evidenceName?: string; evidenceVersionId?: ID; note?: string; evidenceVersionIds?:ID[]; aggregation?:Indicator['aggregation']; assessment?:Measurement['assessment']; records?:number; direction?:Indicator['direction']; warning?:string }
export interface Report extends Scoped {
  title: string; projectName: string; purpose: string; periodStart: string; asOf: string;
  createdAt: string; budget: BudgetSummary; metrics: MetricSummary[];
  completedTasks: number; totalTasks: number; pendingMeasurements: number;
  evidence: { title: string; versionId: ID; name: string }[]; note: string;
  activities?: {title:string;date:string;body:string}[];
}
export interface AnnualPlan {id:ID;orgId:ID;year:number;title:string;purpose:string;budget:number;status:'draft'|'active'|'closed';version:number;changes:{at:string;reason:string;previous:{title:string;purpose:string;budget:number}}[]}
export interface AnnualGoal {id:ID;orgId:ID;planId:ID;name:string;unit:string;target:number|null;definition:string;direction:'higher'|'lower';aggregation:'sum'|'separate';linkIds:ID[];deduplication:string;version:number;changes:{at:string;reason:string;previous:Omit<AnnualGoal,'changes'>}[]}
export interface Activity extends Scoped {title:string;body:string;date:string;ownerId:ID;taskId?:ID;indicatorIds:ID[];evidence:EvidenceRef[];documentId:ID;createdAt:string}
export interface GoalSummary {id:ID;name:string;unit:string;target:number|null;actual:number|null;forecast:number|null;rate:number|null;definition:string;warning:string;metrics:(MetricSummary & {projectName:string})[]}
export interface AnnualReport {id:ID;orgId:ID;planId:ID;title:string;year:number;start:string;end:string;createdAt:string;planVersion:number;purpose:string;note:string;goals:GoalSummary[];budget:number;allocated:number;spent:number;paid:number;pending:number;projects:{id:ID;name:string;owner:string;status:string;allocated:number;spent:number;paid:number;done:number;tasks:number}[];quarters:{label:string;spent:number;goals:{name:string;actual:number|null;unit:string}[]}[]}
export interface AuditEvent { id: ID; projectId: ID; action: string; at: string }
export interface Workspace {
  schemaVersion: 1; revision: number;
  organization: { id: ID; name: string }; members: Member[];
  projects: Project[]; tasks: Task[]; documents: Document[]; expenses: Expense[];
  indicators: Indicator[]; measurements: Measurement[]; reports: Report[]; events: AuditEvent[];
  annualPlans?:AnnualPlan[]; annualGoals?:AnnualGoal[]; annualReports?:AnnualReport[]; activities?:Activity[];
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
  | { type: 'report.create'; projectId: ID; asOf: string; note: string; periodStart?:string }
  | { type:'annual.plan.save'; plan:Pick<AnnualPlan,'id'|'orgId'|'year'|'title'|'purpose'|'budget'>; reason:string }
  | { type:'annual.plan.status'; planId:ID; status:AnnualPlan['status']; reason:string }
  | { type:'annual.goal.save'; goal:Omit<AnnualGoal,'version'|'changes'>; reason:string }
  | { type:'annual.report.create'; planId:ID; start:string; end:string; note:string }
  | { type:'project.update'; project:Project; reason:string }
  | { type:'task.update'; task:Task }
  | { type:'activity.add'; activity:Omit<Activity,'documentId'|'createdAt'> }
  | { type:'indicator.revise'; projectId:ID; indicatorId:ID; target:number|null; forecast:number|null; forecastNote:string; reason:string }
  | { type:'measurement.reject'; projectId:ID; measurementId:ID; reason:string };
