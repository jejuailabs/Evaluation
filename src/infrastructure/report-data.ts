import type { AnnualReport, MetricSummary, Report } from '../domain/types';
import { assessmentLabels } from '../domain/standards';
export type ExportReport = Report | AnnualReport;
export const isAnnualReport = (r: ExportReport): r is AnnualReport => 'planId' in r;
export const exportTitle = (r: ExportReport) => isAnnualReport(r) ? r.title : `${r.projectName} 결과 보고서`;
export const exportPeriod = (r: ExportReport) => isAnnualReport(r) ? `${r.start} ~ ${r.end}` : `${r.periodStart} ~ ${r.asOf}`;
export const exportMetrics = (r: ExportReport): (MetricSummary & {projectName?: string})[] => isAnnualReport(r) ? [...new Map(r.goals.flatMap(g => g.metrics).map(m => [m.id, m])).values()] : r.metrics;
export type Cell = string | number | null;
export interface ExportSheet { name: string; rows: Cell[][] }
export function reportSheets(r: ExportReport): ExportSheet[] {
  const metrics = exportMetrics(r);
  const sheets: ExportSheet[] = [{ name: '보고 개요', rows: [
    ['항목', '내용'], ['제목', exportTitle(r)], ['기간', exportPeriod(r)], ['사업 목적', r.purpose],
    ['생성 시각', r.createdAt], ['보고서 번호', r.id], ['확인 전 실적 제외 건수', isAnnualReport(r) ? r.pending : r.pendingMeasurements],
    ['집계 안내', '확인한 실적만 집계합니다. 누적·정성은 기준일까지의 최신 상태이며 기간 합계·비율은 선택 기간의 확인값입니다. 비용·업무는 보고서 생성 당시 상태입니다.'],
    ['해석과 다음 계획', r.note], ['문서 상태', '저장된 보고 시점의 초안입니다. 공식 승인·제출본이 아니며 원본 파일은 포함하지 않습니다.'],
  ] }];
  if (isAnnualReport(r)) sheets.push({ name: '연간 목표', rows: [['목표', '정의', '단위', '목표값', '예상값', '확인 실적', '달성률 %', '집계 주의'], ...r.goals.map(g => [g.name, g.definition, g.unit, g.target, g.forecast, g.actual, g.rate, g.warning])] });
  sheets.push({ name: '프로젝트 지표', rows: [['프로젝트', '지표', '단위', '목표', '예상', '확인 실적', '달성률 %', '변화 단계', '판단 기준', '기준일', '집계 방식', '정의', '정의 버전', '참고 기준', '해석', '주의'], ...metrics.map(m => [m.projectName ?? (!isAnnualReport(r) ? r.projectName : ''), m.name, m.unit, m.target, m.forecast, m.actual, m.rate, m.assessment ? assessmentLabels[m.assessment] : '', m.rubric ?? '', m.asOf ?? '', m.aggregation ?? '', m.definition, m.definitionVersion, m.source, m.note ?? '', m.warning ?? ''])] });
  sheets.push({ name: '지표 근거', rows: [['지표', '근거 종류', '문서명', '위치', '원본 버전', '발췌', '설계 확인 시각'], ...metrics.flatMap(m => {
    const source = m.planningSource;
    const rows: Cell[][] = (m.evidenceVersionIds ?? (m.evidenceVersionId ? [m.evidenceVersionId] : [])).map(id => [m.name, '확인 실적', id === m.evidenceVersionId ? m.evidenceName ?? '' : '', '', id, '', '']);
    if (source) rows.push([m.name, '목표 설계', source.documentName, source.location, source.evidence.versionId, source.quote, source.reviewedAt]);
    return rows;
  })] });
  if (isAnnualReport(r)) {
    sheets.push({ name: '사업비', rows: [['항목', '금액 원'], ['연간 계획', r.budget], ['연결 사업 전체 배정', r.allocated], ['기간 내 확정 집행', r.spent], ['기간 내 지급', r.paid], [], ['프로젝트', '담당자', '사업 전체 예산 원', '기간 확정 원', '지급 원', '완료 업무', '전체 업무'], ...r.projects.map(p => [p.name, p.owner, p.allocated, p.spent, p.paid, p.done, p.tasks])] });
    sheets.push({ name: '분기 점검', rows: [['기간', '확정 집행 원', '목표', '기준일까지 확인 수치', '단위'], ...r.quarters.flatMap(q => q.goals.length ? q.goals.map(g => [q.label, q.spent, g.name, g.actual, g.unit]) : [[q.label, q.spent, '', null, '']])] });
  } else {
    sheets.push({ name: '사업비', rows: [['항목', '금액 원'], ['배정', r.budget.allocated], ['확정 집행', r.budget.spent], ['지급', r.budget.paid], ['집행 예정', r.budget.committed], ['가용', r.budget.available], ['미지급', r.budget.unpaid]] });
    sheets.push({ name: '현장 기록', rows: [['일자', '제목', '기록'], ...(r.activities ?? []).map(a => [a.date, a.title, a.body])] });
    sheets.push({ name: '참조 원본', rows: [['자료 이름', '파일명', '원본 버전'], ...r.evidence.map(e => [e.title, e.name, e.versionId])] });
  }
  return sheets;
}
