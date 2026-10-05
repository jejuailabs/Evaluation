import type { Workspace, Project, Indicator, BudgetSummary, MetricSummary, EvidenceRef } from './types';

export const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
export const uid = () => crypto.randomUUID();
export const number = (value: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value);
export const money = (value: number) => `${number(value)}원`;
export const shortMoney = (value: number) => Math.abs(value) >= 10000 ? `${number(value / 10000)}만` : number(value);
export function getProject(s: Workspace, id: string): Project {
  const p = s.projects.find(x => x.id === id && x.orgId === s.organization.id);
  if (!p) throw new Error('접근할 수 있는 프로젝트를 찾지 못했어요.');
  return p;
}
export function projectRows<T extends { orgId: string; projectId: string }>(s: Workspace, rows: T[], projectId: string): T[] {
  getProject(s, projectId);
  return rows.filter(x => x.orgId === s.organization.id && x.projectId === projectId);
}
export function budgetSummary(s: Workspace, projectId: string, asOf?: string): BudgetSummary {
  const project = getProject(s, projectId);
  const rows = projectRows(s, s.expenses, projectId).filter(x => !asOf || x.date <= asOf);
  const sum = (statuses: string[]) => rows.filter(x => statuses.includes(x.status)).reduce((a, x) => a + x.amount, 0);
  const committed = sum(['planned']);
  const spent = sum(['confirmed', 'paid']);
  const paid = sum(['paid']);
  return { allocated: project.budget, committed, spent, paid, available: project.budget - spent - committed, unpaid: spent - paid };
}
export function resolveEvidence(s: Workspace, projectId: string, ref: EvidenceRef) {
  const document = projectRows(s, s.documents, projectId).find(x => x.id === ref.documentId);
  const version = document?.versions.find(x => x.id === ref.versionId);
  if (!document || !version) throw new Error('같은 프로젝트의 자료와 실제 버전을 연결해 주세요.');
  return { document, version };
}
export function metricSummary(s: Workspace, i: Indicator, asOf = today()): MetricSummary {
  getProject(s, i.projectId);
  if (i.orgId !== s.organization.id) throw new Error('지표의 조직이 일치하지 않아요.');
  const m = projectRows(s, s.measurements, i.projectId)
    .filter(m => m.indicatorId === i.id && m.status === 'confirmed' && m.asOf <= asOf)
    .sort((a, b) => b.asOf.localeCompare(a.asOf) || (b.confirmedAt ?? '').localeCompare(a.confirmedAt ?? ''))[0];
  const evidence = m ? resolveEvidence(s, i.projectId, m.evidence) : null;
  return { id: i.id, name: i.name, unit: i.unit, target: i.target, forecast: i.forecast, actual: m?.value ?? null,
    rate: m && i.target !== null && i.target > 0 ? m.value / i.target * 100 : null, asOf: m?.asOf,
    source: i.source, sourceUrl: i.sourceUrl, definition: i.definition, definitionVersion: i.version,
    evidenceName: evidence?.version.name, evidenceVersionId: evidence?.version.id, note: m?.note };
}
export const ownerName = (s: Workspace, id: string) => s.members.find(m => m.id === id)?.name ?? '미배정';
export const taskLabels = { todo: '예정', doing: '진행 중', done: '완료' } as const;
export const expenseLabels = { planned: '집행 예정', confirmed: '집행 확정', paid: '지급 완료' } as const;
