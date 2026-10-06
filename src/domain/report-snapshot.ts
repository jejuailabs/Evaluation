import type { Report, Workspace } from './types';
import { getProject, projectRows, budgetSummary, metricSummary, uid, today } from './selectors';
import { financeSnapshot } from './finance-selectors';
function validDate(date:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('날짜를 정확히 입력해 주세요.');}
export function projectSnapshot(s:Workspace,command:{projectId:string;asOf:string;periodStart?:string;note:string},now:string):Report {
      const p = getProject(s, command.projectId); validDate(command.asOf);
      if (command.asOf < p.start || command.asOf > p.end || command.asOf > today()) throw new Error('보고 기준일은 사업 시작일부터 오늘 또는 사업 종료일까지예요.');
      const start=command.periodStart??p.start;validDate(start);if(start<p.start||start>command.asOf)throw new Error('보고 시작일을 확인해 주세요.');
      const tasks = projectRows(s, s.tasks, p.id).filter(t => !t.cancelled&&t.due <= command.asOf&&t.due>=start);
      const measurements = projectRows(s, s.measurements, p.id).filter(m => m.asOf <= command.asOf&&m.asOf>=start);
      const metrics = projectRows(s, s.indicators, p.id).map(i => metricSummary(s, i, command.asOf,start));
      const refKeys = new Set(metrics.flatMap(m => [...(m.evidenceVersionIds??(m.evidenceVersionId ? [m.evidenceVersionId] : [])),...(m.planningSource?[m.planningSource.evidence.versionId]:[])]));
      const finance=financeSnapshot(s,[p.id],start,command.asOf);
      finance.expenses.forEach(e => { if(e.evidence)refKeys.add(e.evidence.versionId);e.payments?.forEach(p=>{if(!p.voided&&p.date>=start&&p.date<=command.asOf)refKeys.add(p.evidence.versionId);}); });
      const activities=(s.activities??[]).filter(a=>a.projectId===p.id&&a.date>=start&&a.date<=command.asOf);
      activities.forEach(a=>{a.evidence.forEach(e=>refKeys.add(e.versionId));const d=s.documents.find(d=>d.id===a.documentId);d?.versions.forEach(v=>refKeys.add(v.id));});
      const evidence = projectRows(s, s.documents, p.id).flatMap(d => d.versions.filter(v => refKeys.has(v.id)).map(v => ({ title: d.title, versionId: v.id, name: v.name })));
      return { id: uid(), orgId: s.organization.id, projectId: p.id, title: `${p.name} · ${command.asOf} 보고`, projectName: p.name, purpose: p.purpose,
        periodStart: start, asOf: command.asOf, createdAt: now, budget: budgetSummary(s, p.id, command.asOf,start), finance, metrics,activities:activities.map(({title,date,body})=>({title,date,body})),
        completedTasks: tasks.filter(t => t.status === 'done').length, totalTasks: tasks.length,
        pendingMeasurements: measurements.filter(m => m.status === 'pending').length, evidence, note: command.note };

}
