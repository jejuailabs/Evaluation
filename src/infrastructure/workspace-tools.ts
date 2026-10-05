import { z } from 'zod';
import type { Workspace } from '../domain/types';
import { budgetSummary, getProject, metricSummary, projectRows } from '../domain/selectors';
export function projectProgress(s: Workspace, input: unknown) {
  const { projectId } = z.object({ projectId: z.string().min(1).max(100) }).strict().parse(input);
  const p = getProject(s, projectId), tasks = projectRows(s, s.tasks, projectId);
  return { projectId: p.id, name: p.name, status: p.status ?? 'active', tasks: { completed: tasks.filter(t => t.status === 'done').length, total: tasks.length }, budget: budgetSummary(s, p.id),
    indicators: projectRows(s, s.indicators, p.id).map(i => { const m = metricSummary(s, i); return { name: m.name, unit: m.unit, target: m.target, forecast: m.forecast, actual: m.actual, rate: m.rate, assessment: m.assessment ?? null }; }) };
}
export function registerWorkspaceTools(readState: () => Workspace | null) {
  const context = (document as unknown as { modelContext?: { registerTool: (tool: unknown, options: {signal: AbortSignal}) => unknown } }).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  try {
    Promise.resolve(context.registerTool({ name: 'get_project_progress', title: '프로젝트 진행 현황 읽기',
      description: '현재 작업실에서 볼 수 있는 프로젝트의 목표·확인 실적·업무·예산 요약을 읽습니다. 내용을 변경하지 않습니다.',
      inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input: unknown) { const s = readState(); if (!s) throw new Error('작업실을 먼저 열어 주세요.'); return projectProgress(s, input); },
    }, { signal: lifecycle.signal })).catch(() => {});
  } catch { /* Optional browser capability; the regular interface remains available. */ }
  return () => lifecycle.abort();
}
