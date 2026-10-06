import { reportWorkflowText } from './report-workflow-data';
import type { AnnualReport, MetricSummary, Report } from '../domain/types';
import { assessmentLabels } from '../domain/standards';
import {expenseLabels} from '../domain/selectors';
export type ExportReport = Report | AnnualReport;
export const isAnnualReport = (r: ExportReport): r is AnnualReport => 'planId' in r;
export const exportTitle = (r: ExportReport) => isAnnualReport(r) ? r.title : `${r.projectName} 결과 보고서`;
export const exportPeriod = (r: ExportReport) => isAnnualReport(r) ? `${r.start} ~ ${r.end}` : `${r.periodStart} ~ ${r.asOf}`;
export const exportMetrics = (r: ExportReport): (MetricSummary & {projectName?: string})[] => isAnnualReport(r) ? [...new Map(r.goals.flatMap(g => g.metrics).map(m => [m.id, m])).values()] : r.metrics;
export type Cell = string | number | null;
export interface ExportSheet { name: string; rows: Cell[][] }
export function outcomeEvidenceText(m:MetricSummary):string[]{
  return (m.outcomeRecords??[]).flatMap(r=>{const a=r.analysisSource;if(!a)return [];
    return [`AI 제안에서 검토한 실적 · ${a.documentName} · ${a.location}`,
      `확인 기록 ${r.periodStart?r.periodStart+' ~ ':''}${r.asOf}: ${r.assessment?assessmentLabels[r.assessment]:String(r.value)+(r.denominator!==undefined?' / '+r.denominator:' '+m.unit)}`,
      `최초 제안: ${a.proposed.assessment?assessmentLabels[a.proposed.assessment]:a.proposed.value??'미확인'}${a.proposed.denominator!==null?' / '+a.proposed.denominator:''} · ${a.proposed.periodStart?a.proposed.periodStart+' ~ ':''}${a.proposed.asOf??'날짜 미확인'}`,
      `인용: ${a.quote}`,`담당자 설명: ${r.note}`,`확인할 점: ${a.uncertainty||'원본·집계 정의 확인'}`,
      `원본 버전 ${r.evidence.versionId} · 담당자 검토 ${a.reviewedAt} · ${a.kind==='text'?'인용문 본문 대조':'이미지·PDF 인용은 담당자 확인'} · 외부 인증 아님`];
  });
}
export function reportSheets(r: ExportReport): ExportSheet[] {
  const metrics = exportMetrics(r);
  const sheets: ExportSheet[] = [{ name: '보고 개요', rows: [
    ['항목', '내용'], ['제목', exportTitle(r)], ['기간', exportPeriod(r)], ['사업 목적', r.purpose],
    ['생성 시각', r.createdAt], ['보고서 번호', r.id], ['확인 전 실적 제외 건수', isAnnualReport(r) ? r.pending : r.pendingMeasurements],
    ['집계 안내', '확인한 실적만 집계합니다. 누적·정성은 기준일까지의 최신 상태이며 기간 합계·비율은 선택 기간의 확인값입니다. 비용·업무는 보고서 생성 당시 상태입니다.'],
    ['해석과 다음 계획', r.note], ['문서 상태', reportWorkflowText(r)[0]],
  ] }];
  if (isAnnualReport(r)) sheets.push({ name: '연간 목표', rows: [['목표', '정의', '단위', '목표값', '예상값', '확인 실적', '달성률 %', '집계 주의'], ...r.goals.map(g => [g.name, g.definition, g.unit, g.target, g.forecast, g.actual, g.rate, g.warning])] });
  sheets.push({ name: '프로젝트 지표', rows: [['프로젝트', '지표', '단위', '목표', '예상', '확인 실적', '달성률 %', '변화 단계', '판단 기준', '기준일', '집계 방식', '정의', '정의 버전', '참고 기준', '해석', '주의'], ...metrics.map(m => [m.projectName ?? (!isAnnualReport(r) ? r.projectName : ''), m.name, m.unit, m.target, m.forecast, m.actual, m.rate, m.assessment ? assessmentLabels[m.assessment] : '', m.rubric ?? '', m.asOf ?? '', m.aggregation ?? '', m.definition, m.definitionVersion, m.source, m.note ?? '', m.warning ?? ''])] });
  sheets.push({ name: '지표 근거', rows: [['지표', '근거 종류', '문서명', '위치', '원본 버전', '발췌', '설계 확인 시각'], ...metrics.flatMap(m => {
    const source = m.planningSource;
    const rows: Cell[][] = (m.evidenceVersionIds ?? (m.evidenceVersionId ? [m.evidenceVersionId] : [])).map(id => [m.name, '확인 실적', id === m.evidenceVersionId ? m.evidenceName ?? '' : '', '', id, '', '']);
    if (source) rows.push([m.name, '목표 설계', source.documentName, source.location, source.evidence.versionId, source.quote, source.reviewedAt]);
    for(const r of m.outcomeRecords??[]){const a=r.analysisSource;if(a)rows.push([m.name,'AI 제안 → 담당자 검토 → 관리자 확인',a.documentName,a.location,r.evidence.versionId,a.quote,a.reviewedAt]);}
    return rows;
  })] });
  if (isAnnualReport(r)) {
    sheets.push({ name: '사업비', rows: [['항목', '금액 원'], ['연간 계획', r.budget], [r.budgetBasis==='yearly'?'해당 연도 배정':'연결 사업 전체 배정', r.allocated],...(r.budgetBasis==='yearly'?[['미배분',r.unallocated??0] as Cell[]]:[]), ['기간 내 확정 집행', r.spent], ['기간 내 지급', r.paid], [], ['프로젝트', '담당자', r.budgetBasis==='yearly'?'해당 연도 배정 원':'사업 전체 예산 원', '기간 확정 원', '지급 원', '완료 업무', '전체 업무'], ...r.projects.map(p => [p.name, p.owner, p.allocated, p.spent, p.paid, p.done, p.tasks])] });
    sheets.push({ name: '분기 점검', rows: [['기간', '확정 집행 원', '목표', '기준일까지 확인 수치', '단위'], ...r.quarters.flatMap(q => q.goals.length ? q.goals.map(g => [q.label, q.spent, g.name, g.actual, g.unit]) : [[q.label, q.spent, '', null, '']])] });
  } else {
    sheets.push({ name: '사업비', rows: [['항목', '금액 원'], ['배정', r.budget.allocated], ['확정 집행', r.budget.spent], ['지급', r.budget.paid], ['집행 예정', r.budget.committed], ['가용', r.budget.available], ['미지급', r.budget.unpaid]] });
    sheets.push({ name: '현장 기록', rows: [['일자', '제목', '기록'], ...(r.activities ?? []).map(a => [a.date, a.title, a.body])] });
    sheets.push({ name: '참조 원본', rows: [['자료 이름', '파일명', '원본 버전'], ...r.evidence.map(e => [e.title, e.name, e.versionId])] });
  }
  if(r.finance){
    sheets.push({name:'집행 명세',rows:[['프로젝트','요청 내용','담당자','세목','재원','집행일','요청액 원','기간 승인 집행 원','기간 지급 원','기준일까지 미지급 원','현재 상태','지출 근거 문서','근거 버전','사용 목적'],...r.finance.expenses.map(e=>[e.projectName,e.title,e.ownerName,e.budgetLineName,e.fundingSource,e.date,e.amount,e.periodSpent,e.periodPaid,e.outstanding,expenseLabels[e.status],e.evidence?.documentId??'',e.evidence?.versionId??'',e.description??''])]});
    sheets.push({name:'지급 원장',rows:[['프로젝트','요청 내용','지급일','금액 원','상태','입력자 번호','메모','증빙 문서','증빙 버전','입력 시각','정정 사유'],...r.finance.expenses.flatMap(e=>e.payments!==undefined?e.payments.filter(p=>p.date>=r.finance!.start&&p.date<=r.finance!.end).map(p=>[e.projectName,e.title,p.date,p.amount,p.voided?'무효':'유효',p.actorId,p.note,p.evidence.documentId,p.evidence.versionId,p.recordedAt,p.voided?.reason??''] as Cell[]):e.status==='paid'&&e.periodPaid>0?[[e.projectName,e.title,e.date,e.amount,'이전 지급 완료','','지급 원장이 없는 이전 자료',e.evidence?.documentId??'',e.evidence?.versionId??'','',''] as Cell[]]:[])]});
    sheets.push({name:'집행 처리 이력',rows:[['프로젝트','요청 내용','시각','처리','담당자 번호','사유','이전 내용','이전 금액 원','이전 집행일'],...r.finance.expenses.flatMap(e=>(e.history??[]).map(h=>[e.projectName,e.title,h.at,h.action,h.actorId,h.reason,h.previous?.title??'',h.previous?.amount??null,h.previous?.date??'']))]});
  }
  if(metrics.some(m=>m.outcomeRecords?.length))sheets.push({name:'AI 실적 검토',rows:[['지표','검토 이력'],...metrics.flatMap(m=>outcomeEvidenceText(m).map(line=>[m.name,line]))]});
  sheets.push({name:'승인·제출 이력',rows:[['처리 기록'],...reportWorkflowText(r).map(line=>[line])]});
  return sheets;
}
