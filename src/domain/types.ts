import type { OutcomeSource } from './outcome-analysis';
export type ID = string;
export type TaskStatus = 'todo' | 'doing' | 'done';
export type ExpenseStatus = 'planned' | 'submitted' | 'returned' | 'confirmed' | 'paid' | 'cancelled';
export interface Scoped { id: ID; orgId: ID; projectId: ID }
export interface Member { id: ID; name: string; role: string }
export interface Project { id: ID; orgId: ID; name: string; purpose: string; start: string; end: string; ownerId: ID; budget: number; category: string; status?: 'planning'|'active'|'completed'|'archived'; closeNote?: string }
export interface Task extends Scoped { title: string; due: string; ownerId: ID; status: TaskStatus; priority?: 'normal'|'high'; note?: string; indicatorId?: ID; completedAt?: string; seriesId?:ID; occurrence?:string; cancelled?:{at:string;actorId:ID;reason:string} }
export type TaskTemplate = Pick<Task,'title'|'ownerId'|'priority'|'note'|'indicatorId'>;
export interface TaskSeries extends Scoped, TaskTemplate { start:string;end:string;frequency:'daily'|'weekly'|'monthly';interval:number;status:'active'|'stopped';createdAt:string;createdById:ID;version:number;changes:{at:string;actorId:ID;reason:string;effectiveFrom:string;previous:TaskTemplate;action:'update'|'stop'}[] }
export interface IntakeItem {id:ID;orgId:ID;projectId?:ID;title:string;note:string;version:DocumentVersion;createdById:ID;createdAt:string;status:'pending'|'linked'|'archived';documentId?:ID;activityId?:ID;history:{at:string;actorId:ID;action:string;reason:string}[]}
export interface DocumentVersion { id: ID; name: string; size: number; createdAt: string; blobKey?: string; inlineText?: string }
export interface Document extends Scoped { title: string; versions: DocumentVersion[] }
export interface EvidenceRef { documentId: ID; versionId: ID }
export interface PlanningSource { evidence: EvidenceRef; documentName: string; location: string; quote: string; method: 'manual'|'ai'; reviewedAt: string }
export interface BudgetLine extends Scoped { name:string; fundingSource:string; allocated:number; changes:{at:string;actorId:ID;reason:string;previous:{name:string;fundingSource:string;allocated:number}}[] }
export interface ExpensePayment {id:ID;amount:number;date:string;note:string;evidence:EvidenceRef;recordedAt:string;actorId:ID;voided?:{at:string;actorId:ID;reason:string}}
export interface ExpenseFields {title:string;amount:number;date:string;ownerId:ID;evidence?:EvidenceRef;budgetLineId?:ID;description?:string}
export interface ExpenseHistory {id:ID;at:string;actorId:ID;action:string;reason:string;status:ExpenseStatus;previous?:ExpenseFields}
export interface Expense extends Scoped, ExpenseFields { status: ExpenseStatus; workflowVersion?:1; requestedById?:ID; history?:ExpenseHistory[]; payments?:ExpensePayment[] }
export interface ExpenseSnapshot extends Expense {projectName:string;ownerName:string;budgetLineName:string;fundingSource:string;periodSpent:number;periodPaid:number;outstanding:number}
export interface FinanceSnapshot {expenses:ExpenseSnapshot[];start:string;end:string}
export interface Indicator extends Scoped {
  name: string; unit: string; target: number | null; forecast: number | null;
  forecastNote: string; definition: string; source: string; sourceUrl?: string;
  aggregation: 'cumulative-snapshot'|'period-sum'|'ratio'|'qualitative'; direction: 'higher'|'lower'; version: number;
  standardId?: string; baseline?: number; rubric?: string;
  revisions?: {at:string;target:number|null;forecast:number|null;forecastNote:string;reason:string;version:number}[];
  planningSource?: PlanningSource;
}
export interface Measurement extends Scoped {
  createdById?: ID;
  analysisSource?: OutcomeSource;
  indicatorId: ID; asOf: string; value: number; note: string; evidence: EvidenceRef;
  status: 'pending' | 'confirmed' | 'rejected'; createdAt: string; confirmedAt?: string;
  periodStart?: string; denominator?: number; assessment?: 'not-yet'|'partial'|'achieved'; supersedesId?: ID; reviewNote?: string;
}
export interface BudgetSummary { allocated: number; committed: number; spent: number; paid: number; available: number; unpaid: number }
export interface MetricSummary { outcomeRecords?: Pick<Measurement,'asOf'|'periodStart'|'value'|'denominator'|'assessment'|'note'|'evidence'|'analysisSource'>[]; id: ID; name: string; unit: string; target: number | null; forecast: number | null; actual: number | null; rate: number | null; asOf?: string; source: string; sourceUrl?: string; definition: string; definitionVersion: number; evidenceName?: string; evidenceVersionId?: ID; note?: string; evidenceVersionIds?:ID[]; aggregation?:Indicator['aggregation']; assessment?:Measurement['assessment']; records?:number; direction?:Indicator['direction']; rubric?:string; warning?:string; planningSource?:PlanningSource }
export interface Report extends Scoped {
  title: string; projectName: string; purpose: string; periodStart: string; asOf: string;
  createdAt: string; budget: BudgetSummary; metrics: MetricSummary[];
  completedTasks: number; totalTasks: number; pendingMeasurements: number;
  evidence: { title: string; versionId: ID; name: string }[]; note: string;
  activities?: {title:string;date:string;body:string}[];
  finance?:FinanceSnapshot;
}
export interface AnnualAllocation {id:ID;orgId:ID;planId:ID;projectId:ID;amount:number;version:number;changes:{at:string;actorId:ID;reason:string;previous:number}[]}
export interface AnnualPlan {budgetPolicy?:'yearly';id:ID;orgId:ID;year:number;title:string;purpose:string;budget:number;status:'draft'|'active'|'closed';version:number;changes:{at:string;reason:string;previous:{title:string;purpose:string;budget:number}}[]}
export interface AnnualGoal {id:ID;orgId:ID;planId:ID;name:string;unit:string;target:number|null;definition:string;direction:'higher'|'lower';aggregation:'sum'|'separate';linkIds:ID[];deduplication:string;version:number;changes:{at:string;reason:string;previous:Omit<AnnualGoal,'changes'>}[]}
export interface Activity extends Scoped {title:string;body:string;date:string;ownerId:ID;taskId?:ID;indicatorIds:ID[];evidence:EvidenceRef[];documentId:ID;createdAt:string}
export interface GoalSummary {id:ID;name:string;unit:string;target:number|null;actual:number|null;forecast:number|null;rate:number|null;definition:string;warning:string;metrics:(MetricSummary & {projectName:string})[]}
export interface AnnualReport {budgetBasis?:'yearly';unallocated?:number;id:ID;orgId:ID;planId:ID;title:string;year:number;start:string;end:string;createdAt:string;planVersion:number;purpose:string;note:string;goals:GoalSummary[];budget:number;allocated:number;spent:number;paid:number;pending:number;projects:{id:ID;name:string;owner:string;status:string;allocated:number;spent:number;paid:number;done:number;tasks:number}[];quarters:{label:string;spent:number;goals:{name:string;actual:number|null;unit:string}[]}[];finance?:FinanceSnapshot}
export interface AuditEvent { id: ID; projectId: ID; action: string; at: string }
export interface Workspace {
  schemaVersion: 1; revision: number;
  organization: { id: ID; name: string }; members: Member[];
  projects: Project[]; tasks: Task[]; documents: Document[]; expenses: Expense[];
  indicators: Indicator[]; measurements: Measurement[]; reports: Report[]; events: AuditEvent[];
  annualPlans?:AnnualPlan[]; annualGoals?:AnnualGoal[]; annualReports?:AnnualReport[]; activities?:Activity[];
  budgetLines?:BudgetLine[]; annualAllocations?:AnnualAllocation[];
  taskSeries?:TaskSeries[]; intakeItems?:IntakeItem[];
}
export type Command =
  | {type:'task.series.create';series:Pick<TaskSeries,'id'|'orgId'|'projectId'|'start'|'end'|'frequency'|'interval'> & TaskTemplate}
  | {type:'task.series.update';projectId:ID;seriesId:ID;fields:TaskTemplate;effectiveFrom:string;reason:string}
  | {type:'task.series.stop';projectId:ID;seriesId:ID;effectiveFrom:string;reason:string}
  | {type:'intake.add';id:ID;title:string;note:string;source:{kind:'file';version:DocumentVersion}|{kind:'text';text:string}}
  | {type:'intake.assign';id:ID;projectId:ID;activity?:{date:string;body:string;taskId?:ID;indicatorIds:ID[]}}
  | {type:'intake.archive';id:ID;archived:boolean;reason:string}
  | { type: 'project.add'; project: Project }
  | { type: 'task.add'; task: Task }
  | { type: 'task.status'; projectId: ID; taskId: ID; status: TaskStatus }
  | { type: 'document.add'; document: Document }
  | { type: 'document.version'; projectId: ID; documentId: ID; version: DocumentVersion }
  | { type: 'expense.add'; expense: Expense }
  | { type: 'expense.status'; projectId: ID; expenseId: ID; status: ExpenseStatus }
  | { type: 'expense.evidence'; projectId: ID; expenseId: ID; evidence: EvidenceRef }
  | { type:'budget.line.save'; line:Omit<BudgetLine,'changes'>; reason:string }
  | { type:'expense.update'; projectId:ID; expenseId:ID; fields:ExpenseFields; reason:string }
  | { type:'expense.submit'; projectId:ID; expenseId:ID }
  | { type:'expense.review'; projectId:ID; expenseId:ID; decision:'confirmed'|'returned'; reason:string }
  | { type:'expense.cancel'; projectId:ID; expenseId:ID; reason:string }
  | { type:'expense.pay'; projectId:ID; expenseId:ID; payment:Pick<ExpensePayment,'id'|'amount'|'date'|'note'|'evidence'> }
  | { type:'expense.payment.void'; projectId:ID; expenseId:ID; paymentId:ID; reason:string }
  | { type: 'indicator.add'; indicator: Indicator }
  | { type: 'measurement.add'; measurement: Measurement; aiReceipt?: string }
  | { type: 'measurement.confirm'; projectId: ID; measurementId: ID }
  | { type: 'report.create'; projectId: ID; asOf: string; note: string; periodStart?:string }
  | { type:'annual.plan.save'; plan:Pick<AnnualPlan,'id'|'orgId'|'year'|'title'|'purpose'|'budget'>; reason:string }
  | { type:'annual.budget.allocate'; planId:ID; allocations:{projectId:ID;amount:number}[]; reason:string }
  | { type:'annual.plan.status'; planId:ID; status:AnnualPlan['status']; reason:string }
  | { type:'annual.goal.save'; goal:Omit<AnnualGoal,'version'|'changes'>; reason:string }
  | { type:'annual.report.create'; planId:ID; start:string; end:string; note:string }
  | { type:'project.update'; project:Project; reason:string }
  | { type:'task.update'; task:Task }
  | { type:'activity.add'; activity:Omit<Activity,'documentId'|'createdAt'> }
  | { type:'indicator.revise'; projectId:ID; indicatorId:ID; target:number|null; forecast:number|null; forecastNote:string; reason:string }
  | { type:'measurement.reject'; projectId:ID; measurementId:ID; reason:string };
