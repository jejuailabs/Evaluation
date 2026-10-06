import { allocateAnnualBudget, validateAnnualBudget } from './annual-budget';
import type { Workspace, Command, Scoped } from './types';
import { getProject, projectRows, resolveEvidence, budgetSummary, metricSummary, uid, today, confirmedMeasurements } from './selectors';
import { applyLifecycle } from './lifecycle';
import { standards } from './standards';
import { applyFinance } from './finance';
import { financeSnapshot } from './finance-selectors';

function requireText(value: string, label: string) { if (!value.trim()) throw new Error(`${label}을(를) 입력해 주세요.`); }
function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('날짜를 정확히 입력해 주세요.');
}
function nonnegative(value: number) { if (!Number.isFinite(value) || value < 0) throw new Error('0 이상의 숫자를 입력해 주세요.'); }
function amount(value: number) { nonnegative(value); if (!Number.isSafeInteger(value)) throw new Error('금액은 원 단위 정수로 입력해 주세요.'); }
function member(s: Workspace, id: string) { if (!s.members.some(x => x.id === id)) throw new Error('조직의 담당자를 선택해 주세요.'); }
function scope(s: Workspace, row: Scoped) {
  getProject(s, row.projectId);
  if (row.orgId !== s.organization.id) throw new Error('다른 조직의 자료를 연결할 수 없어요.');
}
function uniqueId(rows: { id: string }[], id: string) { if (rows.some(x => x.id === id)) throw new Error('이미 처리한 항목이에요.'); }

// Pure transaction boundary: validation failure never changes the original state.
export function execute(original: Workspace, input: Command, now = new Date().toISOString(), actorId = original.members[0]?.id??'demo'): Workspace {
  const command=structuredClone(input);
  const s = structuredClone(original);
  const row='project' in command?command.project:'task' in command?command.task:'expense' in command?command.expense:'document' in command?command.document:'indicator' in command?command.indicator:'measurement' in command?command.measurement:'activity' in command?command.activity:null;
  const affected='projectId' in command?command.projectId:'line' in command?command.line.projectId:row?('projectId' in row?row.projectId:row.id):'';
  if(affected&&!['project.add','project.update','report.create'].includes(command.type)&&['completed','archived'].includes(s.projects.find(p=>p.id===affected)?.status??''))throw new Error('완료·보관한 프로젝트예요. 계획·상태에서 진행 중으로 다시 열어 주세요.');
  const extended=command.type==='annual.budget.allocate'?allocateAnnualBudget(s,command,now,actorId):applyFinance(s,command,now,actorId)??applyLifecycle(s,command,now);
  if(extended){validateAnnualBudget(original,s);s.revision++;s.events.unshift({id:uid(),...extended,at:now});return s;}
  let projectId = '';
  let action = '';
  switch (command.type) {
    case 'project.add': {
      const p = command.project;
      if(p.status&&p.status!=='planning'&&p.status!=='active')throw new Error('새 프로젝트는 계획 또는 진행 상태로 시작해 주세요.');
      if (p.orgId !== s.organization.id) throw new Error('조직이 일치하지 않아요.');
      uniqueId(s.projects, p.id); requireText(p.name, '프로젝트 이름'); requireText(p.purpose, '목적');
      validDate(p.start); validDate(p.end); if (p.end < p.start) throw new Error('종료일은 시작일 이후로 정해 주세요.');
      amount(p.budget); member(s, p.ownerId); s.projects.push(p); projectId = p.id; action = '프로젝트를 만들었어요'; break;
    }
    case 'task.add': {
      const t = command.task; scope(s, t); uniqueId(s.tasks, t.id); requireText(t.title, '업무'); validDate(t.due); member(s, t.ownerId);
      const p=getProject(s,t.projectId);if(t.due<p.start||t.due>p.end)throw new Error('프로젝트 기간 안에 업무 기한을 정해 주세요.');
      if(t.indicatorId&&!projectRows(s,s.indicators,p.id).some(i=>i.id===t.indicatorId))throw new Error('이 프로젝트의 목표를 선택해 주세요.');
      t.completedAt=t.status==='done'?now:undefined;
      s.tasks.push(t); projectId = t.projectId; action = `업무 추가 · ${t.title}`; break;
    }
    case 'task.status': {
      const t = projectRows(s, s.tasks, command.projectId).find(x => x.id === command.taskId);
      if (!t) throw new Error('업무를 찾지 못했어요.');
      if (!['todo', 'doing', 'done'].includes(command.status)) throw new Error('업무 상태가 올바르지 않아요.');
      t.status = command.status; t.completedAt=t.status==='done'?now:undefined; projectId = t.projectId; action = `업무 상태 변경 · ${t.title}`; break;
    }
    case 'document.add': {
      const d = command.document; scope(s, d); uniqueId(s.documents, d.id); requireText(d.title, '자료 이름');
      if (d.versions.length !== 1 || (!d.versions[0].blobKey && d.versions[0].inlineText === undefined)) throw new Error('저장된 원본이 필요해요.');
      s.documents.push(d); projectId = d.projectId; action = `자료 등록 · ${d.title}`; break;
    }
    case 'document.version': {
      const d = projectRows(s, s.documents, command.projectId).find(x => x.id === command.documentId);
      if (!d) throw new Error('자료를 찾지 못했어요.');
      uniqueId(d.versions, command.version.id);
      if (!command.version.blobKey && command.version.inlineText === undefined) throw new Error('저장된 원본이 필요해요.');
      d.versions.push(command.version); projectId = d.projectId; action = `새 버전 등록 · ${d.title}`; break;
    }
    case 'indicator.add': {
      const i = command.indicator; scope(s, i); uniqueId(s.indicators, i.id); requireText(i.name, '지표 이름'); requireText(i.unit, '단위'); requireText(i.definition, '집계 기준');
      if (i.target !== null) { nonnegative(i.target); if (i.target === 0&&i.direction==='higher') throw new Error('증가 목표는 0보다 큰 수로 정하거나 미설정으로 남겨 주세요.'); }
      if (i.forecast !== null) { nonnegative(i.forecast); requireText(i.forecastNote, '예상 근거'); }
      if(i.aggregation==='ratio'&&(i.unit!=='%'||(i.target??0)>100||(i.forecast??0)>100))throw new Error('비율 지표는 % 단위로, 100 이내의 목표·예상을 입력해 주세요.');
      if(i.aggregation==='qualitative'){requireText(i.rubric??'','변화를 판단할 기준');if(i.target!==null||i.forecast!==null)throw new Error('정성 지표에는 수치 목표를 넣지 않아요.');}
      if(i.standardId){const standard=standards.find(x=>x.id===i.standardId);if(!standard)throw new Error('지원하는 참고 기준을 선택해 주세요.');i.source=`${standard.system} ${standard.code} 참고`;i.sourceUrl=standard.url;}
      else {i.source='우리 조직 지표';delete i.sourceUrl;}
      if(i.planningSource){
        const ref=resolveEvidence(s,i.projectId,i.planningSource.evidence);
        requireText(i.planningSource.quote,'설계에 사용한 원문');requireText(i.planningSource.location,'원문 위치');
        if(i.planningSource.quote.length>1500)throw new Error('인용은 1,500자 이내로 남겨 주세요.');
        i.planningSource.documentName=ref.version.name;i.planningSource.reviewedAt=now;
        if(s.indicators.some(x=>x.projectId===i.projectId&&x.name===i.name&&x.planningSource?.evidence.versionId===i.planningSource!.evidence.versionId&&x.planningSource.quote===i.planningSource!.quote))throw new Error('같은 원문으로 이미 만든 지표예요. 기존 지표를 확인해 주세요.');
      }
      s.indicators.push(i); projectId = i.projectId; action = `지표 추가 · ${i.name}`; break;
    }
    case 'measurement.add': {
      const m = command.measurement; scope(s, m); uniqueId(s.measurements, m.id);
      const i = projectRows(s, s.indicators, m.projectId).find(x => x.id === m.indicatorId);
      if (!i) throw new Error('프로젝트의 지표를 선택해 주세요.');
      nonnegative(m.value); validDate(m.asOf);
      const p = getProject(s, m.projectId);
      if (m.asOf < p.start || m.asOf > p.end || m.asOf > today()) throw new Error('실적 기준일은 사업 시작일부터 오늘 또는 사업 종료일까지예요.');
      if (m.status !== 'pending') throw new Error('실적은 검토 전 상태로 등록해야 해요.');
      if (m.analysisSource && s.measurements.some(x => x.analysisSource?.id === m.analysisSource!.id && x.status !== 'rejected')) throw new Error('이미 기록한 AI 제안이에요. 기존 기록을 확인해 주세요.');
      if(i.aggregation==='period-sum'||i.aggregation==='ratio'){
        validDate(m.periodStart??'');if(m.periodStart!<p.start||m.periodStart!>m.asOf)throw new Error('집계 시작일을 확인해 주세요.');
      }
      if(i.aggregation==='ratio'&&(!Number.isFinite(m.denominator)||m.denominator!<=0||m.value>m.denominator!))throw new Error('전체 수는 0보다 크고 결과 수 이상이어야 해요.');
      if(i.aggregation==='qualitative'&&!['not-yet','partial','achieved'].includes(m.assessment??''))throw new Error('변화 단계를 선택해 주세요.');
      if(m.supersedesId){const old=confirmedMeasurements(s,i).find(x=>x.id===m.supersedesId);if(!old||old.asOf!==m.asOf||old.periodStart!==m.periodStart)throw new Error('현재 확인된 원본과 같은 집계 기간으로 정정해 주세요.');}
      resolveEvidence(s, m.projectId, m.evidence); requireText(m.note, '집계 설명');
      s.measurements.push(m); projectId = m.projectId; action = `실적 기록 · ${i.name}`; break;
    }
    case 'measurement.confirm': {
      const m = projectRows(s, s.measurements, command.projectId).find(x => x.id === command.measurementId);
      if (!m || m.status !== 'pending') throw new Error('확인할 기록을 찾지 못했어요.');
      resolveEvidence(s, m.projectId, m.evidence);
      const i=projectRows(s,s.indicators,m.projectId).find(i=>i.id===m.indicatorId)!;
      const active=confirmedMeasurements(s,i);
      if(m.supersedesId&&!active.some(x=>x.id===m.supersedesId))throw new Error('다른 정정이 먼저 확인됐어요. 최신 원본으로 다시 기록해 주세요.');
      if (active.some(x=>x.id!==m.supersedesId&&(i.aggregation==='period-sum'||i.aggregation==='ratio'?x.periodStart!<=m.asOf&&x.asOf>=m.periodStart!:x.asOf===m.asOf)))throw new Error('같은 기준일 또는 겹치는 집계 기간의 확인값이 있어요. 기존 실적의 정정을 사용해 주세요.');
      m.status = 'confirmed'; m.confirmedAt = now; projectId = m.projectId; action = '실적을 확인했어요'; break;
    }
    case 'report.create': {
      const p = getProject(s, command.projectId); validDate(command.asOf);
      if (command.asOf < p.start || command.asOf > p.end || command.asOf > today()) throw new Error('보고 기준일은 사업 시작일부터 오늘 또는 사업 종료일까지예요.');
      const start=command.periodStart??p.start;validDate(start);if(start<p.start||start>command.asOf)throw new Error('보고 시작일을 확인해 주세요.');
      const tasks = projectRows(s, s.tasks, p.id).filter(t => t.due <= command.asOf&&t.due>=start);
      const measurements = projectRows(s, s.measurements, p.id).filter(m => m.asOf <= command.asOf&&m.asOf>=start);
      const metrics = projectRows(s, s.indicators, p.id).map(i => metricSummary(s, i, command.asOf,start));
      const refKeys = new Set(metrics.flatMap(m => [...(m.evidenceVersionIds??(m.evidenceVersionId ? [m.evidenceVersionId] : [])),...(m.planningSource?[m.planningSource.evidence.versionId]:[])]));
      const finance=financeSnapshot(s,[p.id],start,command.asOf);
      finance.expenses.forEach(e => { if(e.evidence)refKeys.add(e.evidence.versionId);e.payments?.forEach(p=>{if(!p.voided&&p.date>=start&&p.date<=command.asOf)refKeys.add(p.evidence.versionId);}); });
      const activities=(s.activities??[]).filter(a=>a.projectId===p.id&&a.date>=start&&a.date<=command.asOf);
      activities.forEach(a=>{a.evidence.forEach(e=>refKeys.add(e.versionId));const d=s.documents.find(d=>d.id===a.documentId);d?.versions.forEach(v=>refKeys.add(v.id));});
      const evidence = projectRows(s, s.documents, p.id).flatMap(d => d.versions.filter(v => refKeys.has(v.id)).map(v => ({ title: d.title, versionId: v.id, name: v.name })));
      s.reports.unshift({ id: uid(), orgId: s.organization.id, projectId: p.id, title: `${p.name} · ${command.asOf} 보고`, projectName: p.name, purpose: p.purpose,
        periodStart: start, asOf: command.asOf, createdAt: now, budget: budgetSummary(s, p.id, command.asOf,start), finance, metrics,activities:activities.map(({title,date,body})=>({title,date,body})),
        completedTasks: tasks.filter(t => t.status === 'done').length, totalTasks: tasks.length,
        pendingMeasurements: measurements.filter(m => m.status === 'pending').length, evidence, note: command.note });
      projectId = p.id; action = '보고서 스냅샷을 만들었어요'; break;
    }
    default: throw new Error('지원하지 않는 변경이에요.');
  }
  validateAnnualBudget(original,s);
  s.revision++;
  s.events.unshift({ id: uid(), projectId, action, at: now });
  return s;
}
