import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, PageNumber, Packer, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from 'docx';
import { exportMetrics, exportPeriod, exportTitle, isAnnualReport, type ExportReport } from './report-data';
import { assessmentLabels } from '../domain/standards';
import { money, number } from '../domain/selectors';

const p = (text: string, heading?: typeof HeadingLevel[keyof typeof HeadingLevel]) => new Paragraph({ text, heading, spacing: { after: 140, line: 340 }, keepNext: Boolean(heading) });
const table = (rows: string[][], widths: number[]) => new Table({
  width: { size: 9360, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: widths,
  borders: Object.fromEntries(['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical'].map(k => [k, { style: BorderStyle.SINGLE, size: 4, color: 'D4DDD8' }])),
  rows: rows.map((row, ri) => new TableRow({ tableHeader: ri === 0, children: row.map((value, ci) => new TableCell({ width: { size: widths[ci], type: WidthType.DXA }, margins: { top: 120, bottom: 120, left: 130, right: 130 }, shading: { fill: ri === 0 ? '315747' : ri % 2 ? 'FFFFFF' : 'F3F6F4' }, children: [new Paragraph({ children: [new TextRun({ text: value, color: ri === 0 ? 'FFFFFF' : '24372E', bold: ri === 0, size: 21 })], spacing: { after: 50, line: 290 } })] })) })),
});
export async function reportDOCX(r: ExportReport): Promise<Blob> {
  const annual = isAnnualReport(r); const metrics = exportMetrics(r);
  const children: (Paragraph | Table)[] = [p(exportTitle(r), HeadingLevel.TITLE), p(`보고 기간 ${exportPeriod(r)}`), p(r.purpose), p('확인된 성과와 사업 운영 기록을 보고 시점의 내용으로 정리한 초안입니다. 목표와 예상은 실제 성과와 구분하며, 미확인 실적은 집계에서 제외했습니다.'), p(`생성 시각 ${r.createdAt}   보고서 번호 ${r.id}`)];
  if (annual) {
    children.push(p('연간 목표와 결과', HeadingLevel.HEADING_1));
    for (const g of r.goals) children.push(p(g.name, HeadingLevel.HEADING_2), p(g.definition), p(`목표 ${g.target === null ? '미설정' : number(g.target) + g.unit}   예상 ${g.forecast === null ? '미설정' : number(g.forecast) + g.unit}   확인 ${g.actual === null ? '프로젝트별 확인' : number(g.actual) + g.unit}   달성률 ${g.rate === null ? '별도 확인' : number(g.rate) + '%'}`), p(g.warning));
  }
  children.push(p('프로젝트 목표와 확인 실적', HeadingLevel.HEADING_1));
  children.push(table([['지표', '목표', '예상', '확인 결과', '달성률'], ...metrics.map(m => [`${m.projectName ? m.projectName + '\n' : ''}${m.name}`, m.aggregation === 'qualitative' ? '정성 기준' : m.target === null ? '미설정' : number(m.target) + m.unit, m.forecast === null ? '미설정' : number(m.forecast) + m.unit, m.assessment ? assessmentLabels[m.assessment] : m.actual === null ? '미입력' : number(m.actual) + m.unit, m.rate === null ? '—' : number(m.rate) + '%'])], [3000, 1590, 1590, 1590, 1590]));
  children.push(p('사업 운영과 예산', HeadingLevel.HEADING_1));
  if (annual) {
    children.push(p(`연간 계획 ${money(r.budget)}   기간 확정 ${money(r.spent)}   지급 ${money(r.paid)}`));
    children.push(table([['프로젝트 담당자', '사업 전체 예산', '기간 확정', '기간 지급'], ...r.projects.map(x => [x.name + '\n' + x.owner, money(x.allocated), money(x.spent), money(x.paid)])], [3300, 2020, 2020, 2020]));
    children.push(p('분기별 점검', HeadingLevel.HEADING_2));
    for (const q of r.quarters) children.push(p(`${q.label}   확정 집행 ${money(q.spent)}`), p(q.goals.map(g => `${g.name}: ${g.actual === null ? '미집계' : number(g.actual) + g.unit}`).join('\n')));
  } else children.push(p(`배정 ${money(r.budget.allocated)}   확정 집행 ${money(r.budget.spent)}   지급 ${money(r.budget.paid)}`), p(`집행 예정 ${money(r.budget.committed)}   기간 내 가용 ${money(r.budget.available)}   업무 완료 ${r.completedTasks}/${r.totalTasks}`));
  children.push(p('지표 정의와 근거', HeadingLevel.HEADING_1));
  for (const m of metrics) {
    children.push(p(m.name, HeadingLevel.HEADING_2), p(`${m.source}   정의 v${m.definitionVersion}   기준일 ${m.asOf ?? '확인 기록 없음'}`), p(m.definition));
    if (m.sourceUrl) children.push(p(`참고 정의 ${m.sourceUrl}`));
    if (m.rubric) children.push(p(`판단 기준: ${m.rubric}`));
    if (m.planningSource) { const s = m.planningSource; children.push(p(`목표 설계 근거: ${s.documentName} / ${s.location}`), p(s.quote), p(`설계 원본 버전 ${s.evidence.versionId} / 담당자 확인 ${s.reviewedAt}`)); }
    children.push(p(`실적 원본 버전: ${m.evidenceVersionIds?.join(', ') ?? m.evidenceVersionId ?? '없음'}`));
    if (m.note) children.push(p(m.note)); if (m.warning) children.push(p(m.warning));
  }
  if (!annual && r.activities?.length) { children.push(p('현장 기록', HeadingLevel.HEADING_1)); for (const a of r.activities) children.push(p(`${a.date} ${a.title}`, HeadingLevel.HEADING_2), p(a.body)); }
  children.push(p('해석과 다음 계획', HeadingLevel.HEADING_1), p(r.note || '아직 작성하지 않았습니다.'));
  if (!annual) { children.push(p('참조 원본', HeadingLevel.HEADING_1)); for (const e of r.evidence) children.push(p(`${e.title} / ${e.name}\n원본 버전 ${e.versionId}`)); }
  children.push(p('집계 범위와 문서 상태', HeadingLevel.HEADING_1), p(`미확인 실적 ${annual ? r.pending : r.pendingMeasurements}건을 제외했습니다. 누적·정성 지표는 기준일까지의 최신 상태이며 분기 증가분이 아닙니다. 기간별 합계·비율은 선택 기간의 확인 기록입니다. 비용과 업무는 생성 당시 상태이며, 여러 해에 걸친 사업의 배정액은 사업 전체 금액입니다. 기준 연결은 인증이나 자동 평가 등급을 뜻하지 않습니다. 원본 파일은 포함하지 않았습니다. 정식 승인·제출본이 아닙니다.`));
  const doc = new Document({ title: exportTitle(r), creator: '가치 돋보기', description: '확인된 조직 기록으로 만든 보고서 초안',
    styles: { default: { document: { run: { font: '맑은 고딕', size: 24, color: '24372E' } } }, paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { size: 44, bold: true, color: '000000' }, paragraph: { spacing: { before: 0, after: 280 } } },
      { id: 'Heading1', name: 'heading 1', basedOn: 'Normal', next: 'Normal', run: { size: 30, bold: true, color: '315747' }, paragraph: { spacing: { before: 360, after: 180 }, keepNext: true } },
      { id: 'Heading2', name: 'heading 2', basedOn: 'Normal', next: 'Normal', run: { size: 25, bold: true }, paragraph: { spacing: { before: 220, after: 120 }, keepNext: true } },
    ] }, sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, bottom: 1200, left: 1440, right: 1440 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '가치 돋보기   ', size: 18 }), new TextRun({ children: [PageNumber.CURRENT], size: 18 })] })] }) }, children }] });
  return Packer.toBlob(doc);
}
