import type { Workspace, Command, Scoped } from './types';
import { getProject, projectRows, resolveEvidence, budgetSummary, metricSummary, uid, today } from './selectors';

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
export function execute(original: Workspace, command: Command, now = new Date().toISOString()): Workspace {
  const s = structuredClone(original);
  let projectId = '';
  let action = '';
  switch (command.type) {
    case 'project.add': {
      const p = command.project;
      if (p.orgId !== s.organization.id) throw new Error('조직이 일치하지 않아요.');
      uniqueId(s.projects, p.id); requireText(p.name, '프로젝트 이름'); requireText(p.purpose, '목적');
      validDate(p.start); validDate(p.end); if (p.end < p.start) throw new Error('종료일은 시작일 이후로 정해 주세요.');
      amount(p.budget); member(s, p.ownerId); s.projects.push(p); projectId = p.id; action = '프로젝트를 만들었어요'; break;
    }
    case 'task.add': {
      const t = command.task; scope(s, t); uniqueId(s.tasks, t.id); requireText(t.title, '업무'); validDate(t.due); member(s, t.ownerId);
      s.tasks.push(t); projectId = t.projectId; action = `업무 추가 · ${t.title}`; break;
    }
    case 'task.status': {
      const t = projectRows(s, s.tasks, command.projectId).find(x => x.id === command.taskId);
      if (!t) throw new Error('업무를 찾지 못했어요.');
      if (!['todo', 'doing', 'done'].includes(command.status)) throw new Error('업무 상태가 올바르지 않아요.');
      t.status = command.status; projectId = t.projectId; action = `업무 상태 변경 · ${t.title}`; break;
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
    case 'expense.add': {
      const e = command.expense; scope(s, e); uniqueId(s.expenses, e.id); requireText(e.title, '집행 내용'); amount(e.amount);
      if (e.amount === 0) throw new Error('집행액은 0원보다 커야 해요.');
      validDate(e.date); member(s, e.ownerId);
      const p = getProject(s, e.projectId);
      if (e.date < p.start || e.date > p.end) throw new Error('집행일은 프로젝트 기간 안으로 정해 주세요.');
      if (!['planned', 'confirmed', 'paid'].includes(e.status)) throw new Error('집행 상태가 올바르지 않아요.');
      if (e.evidence) resolveEvidence(s, e.projectId, e.evidence);
      if (e.status !== 'planned' && !e.evidence) throw new Error('집행을 확정하려면 증빙 자료를 연결해 주세요.');
      s.expenses.push(e); projectId = e.projectId; action = `집행 등록 · ${e.title}`; break;
    }
    case 'expense.evidence': {
      const e = projectRows(s, s.expenses, command.projectId).find(x => x.id === command.expenseId);
      if (!e || e.status !== 'planned') throw new Error('예정 상태의 집행에만 증빙을 추가할 수 있어요.');
      resolveEvidence(s, e.projectId, command.evidence);
      e.evidence = command.evidence; projectId = e.projectId; action = `집행 증빙 연결 · ${e.title}`; break;
    }
    case 'expense.status': {
      const e = projectRows(s, s.expenses, command.projectId).find(x => x.id === command.expenseId);
      if (!e) throw new Error('집행 기록을 찾지 못했어요.');
      const next = e.status === 'planned' ? 'confirmed' : e.status === 'confirmed' ? 'paid' : null;
      if (command.status !== next) throw new Error('집행 예정 → 확정 → 지급 순서로 처리해 주세요.');
      if (!e.evidence) throw new Error('증빙이 연결된 집행만 확정할 수 있어요.');
      resolveEvidence(s, e.projectId, e.evidence); e.status = command.status; projectId = e.projectId; action = `집행 상태 변경 · ${e.title}`; break;
    }
    case 'indicator.add': {
      const i = command.indicator; scope(s, i); uniqueId(s.indicators, i.id); requireText(i.name, '지표 이름'); requireText(i.unit, '단위'); requireText(i.definition, '집계 기준');
      if (i.target !== null) { nonnegative(i.target); if (i.target === 0) throw new Error('목표는 0보다 큰 수로 정하거나 미설정으로 남겨 주세요.'); }
      if (i.forecast !== null) { nonnegative(i.forecast); requireText(i.forecastNote, '예상 근거'); }
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
      resolveEvidence(s, m.projectId, m.evidence); requireText(m.note, '집계 설명');
      s.measurements.push(m); projectId = m.projectId; action = `실적 기록 · ${i.name}`; break;
    }
    case 'measurement.confirm': {
      const m = projectRows(s, s.measurements, command.projectId).find(x => x.id === command.measurementId);
      if (!m || m.status !== 'pending') throw new Error('확인할 기록을 찾지 못했어요.');
      resolveEvidence(s, m.projectId, m.evidence);
      if (s.measurements.some(x => x.orgId === m.orgId && x.projectId === m.projectId && x.indicatorId === m.indicatorId && x.asOf === m.asOf && x.status === 'confirmed')) throw new Error('같은 기준일의 확인값이 있어요. 정정 버전 기능은 다음 단계에서 제공해요.');
      m.status = 'confirmed'; m.confirmedAt = now; projectId = m.projectId; action = '실적을 확인했어요'; break;
    }
    case 'report.create': {
      const p = getProject(s, command.projectId); validDate(command.asOf);
      if (command.asOf < p.start || command.asOf > p.end || command.asOf > today()) throw new Error('보고 기준일은 사업 시작일부터 오늘 또는 사업 종료일까지예요.');
      const tasks = projectRows(s, s.tasks, p.id).filter(t => t.due <= command.asOf);
      const measurements = projectRows(s, s.measurements, p.id).filter(m => m.asOf <= command.asOf);
      const metrics = projectRows(s, s.indicators, p.id).map(i => metricSummary(s, i, command.asOf));
      const refKeys = new Set(metrics.flatMap(m => m.evidenceVersionId ? [m.evidenceVersionId] : []));
      projectRows(s, s.expenses, p.id).filter(e => e.date <= command.asOf).forEach(e => { if (e.evidence) refKeys.add(e.evidence.versionId); });
      const evidence = projectRows(s, s.documents, p.id).flatMap(d => d.versions.filter(v => refKeys.has(v.id)).map(v => ({ title: d.title, versionId: v.id, name: v.name })));
      s.reports.unshift({ id: uid(), orgId: s.organization.id, projectId: p.id, title: `${p.name} · ${command.asOf} 보고`, projectName: p.name, purpose: p.purpose,
        periodStart: p.start, asOf: command.asOf, createdAt: now, budget: budgetSummary(s, p.id, command.asOf), metrics,
        completedTasks: tasks.filter(t => t.status === 'done').length, totalTasks: tasks.length,
        pendingMeasurements: measurements.filter(m => m.status === 'pending').length, evidence, note: command.note });
      projectId = p.id; action = '보고서 스냅샷을 만들었어요'; break;
    }
  }
  s.revision++;
  s.events.unshift({ id: uid(), projectId, action, at: now });
  return s;
}
