import type { Workspace, Project, Indicator, BudgetSummary, MetricSummary, EvidenceRef } from './types';
import { expenseTotals } from './finance-selectors';

export const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
export const savedDate = (value:string) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(value));
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
export function budgetSummary(s: Workspace, projectId: string, asOf?: string,periodStart?:string): BudgetSummary {
  const project = getProject(s, projectId);
  const t=expenseTotals(projectRows(s,s.expenses,projectId),periodStart,asOf);
  return { allocated: project.budget, committed:t.committed,spent:t.spent,paid:t.paid,available:project.budget-t.approvedThrough-t.reservedThrough,unpaid:t.unpaid };
}
export function resolveEvidence(s: Workspace, projectId: string, ref: EvidenceRef) {
  const document = projectRows(s, s.documents, projectId).find(x => x.id === ref.documentId);
  const version = document?.versions.find(x => x.id === ref.versionId);
  if (!document || !version) throw new Error('같은 프로젝트의 자료와 실제 버전을 연결해 주세요.');
  return { document, version };
}
export function attainment(actual:number|null,target:number|null,direction:'higher'|'lower'='higher'):number|null {
  if(actual===null||target===null)return null;
  if(direction==='lower')return actual<=target?100:actual===0?100:target/actual*100;
  return target>0?actual/target*100:null;
}
export function confirmedMeasurements(s:Workspace,i:Indicator,asOf= today()) {
  const rows=projectRows(s,s.measurements,i.projectId).filter(m=>m.indicatorId===i.id&&m.status==='confirmed'&&m.asOf<=asOf);
  const superseded=new Set(rows.map(m=>m.supersedesId).filter(Boolean));
  return rows.filter(m=>!superseded.has(m.id)).sort((a,b)=>b.asOf.localeCompare(a.asOf)||(b.confirmedAt??'').localeCompare(a.confirmedAt??''));
}
export function metricSummary(s: Workspace, i: Indicator, asOf = today(), periodStart?:string): MetricSummary {
  getProject(s, i.projectId);
  if (i.orgId !== s.organization.id) throw new Error('지표의 조직이 일치하지 않아요.');
  const all=confirmedMeasurements(s,i,asOf);
  const periodMode=i.aggregation==='period-sum'||i.aggregation==='ratio';
  const rows=periodMode?all.filter(m=>!periodStart||(m.periodStart??m.asOf)>=periodStart):all.slice(0,1);
  const m=rows[0];
  let actual:number|null=m?.value??null;
  if(i.aggregation==='period-sum')actual=rows.length?rows.reduce((n,m)=>n+m.value,0):null;
  if(i.aggregation==='ratio') {const denominator=rows.reduce((n,m)=>n+(m.denominator??0),0);actual=denominator?rows.reduce((n,m)=>n+m.value,0)/denominator*100:null;}
  if(i.aggregation==='qualitative')actual=null;
  const warnings:string[]=[];
  if(periodMode&&periodStart&&all.some(m=>(m.periodStart??m.asOf)<periodStart&&m.asOf>=periodStart))warnings.push('기간 경계에 걸친 기록은 나누어 입력해야 집계돼요.');
  if(!periodMode&&periodStart&&periodStart>getProject(s,i.projectId).start)warnings.push('이 값은 해당 분기의 증가분이 아닌, 기준일까지의 누적·최신 상태예요.');
  const evidence = m ? resolveEvidence(s, i.projectId, m.evidence) : null;
  return { id: i.id, name: i.name, unit: i.unit, target: i.target, forecast: i.forecast, actual,
    rate: attainment(actual,i.target,i.direction), asOf: m?.asOf,
    source: i.source, sourceUrl: i.sourceUrl, definition: i.definition, definitionVersion: i.version,
    evidenceName: evidence?.version.name, evidenceVersionId: evidence?.version.id, note: m?.note,
    evidenceVersionIds:rows.map(m=>m.evidence.versionId),aggregation:i.aggregation,assessment:m?.assessment,records:rows.length,direction:i.direction,rubric:i.rubric,planningSource:i.planningSource,warning:warnings.join(' ') };
}
export const ownerName = (s: Workspace, id: string) => s.members.find(m => m.id === id)?.name ?? '미배정';
export const taskLabels = { todo: '예정', doing: '진행 중', done: '완료' } as const;
export const expenseLabels = { planned:'집행 예정',submitted:'검토 요청',returned:'보완 요청',confirmed:'승인 · 미지급',paid:'지급 완료',cancelled:'취소' } as const;
