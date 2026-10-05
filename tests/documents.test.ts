import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';
import { extractOffice, readTextArchive } from '../src/infrastructure/office-content';
import { collectContent } from '../src/domain/document-content';
import { createSeed } from '../src/domain/seed';
import { execute } from '../src/domain/commands';
import { metricSummary } from '../src/domain/selectors';
import { annualSnapshot } from '../src/domain/annual';
import { reportDOCX } from '../src/infrastructure/report-docx';
import { reportXLSX } from '../src/infrastructure/report-xlsx';
import { reportSheets } from '../src/infrastructure/report-data';
import { reportHTML, annualReportHTML } from '../src/infrastructure/report';
import type { Indicator } from '../src/domain/types';
import { projectProgress } from '../src/infrastructure/workspace-tools';
const zip = (files: Record<string,string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k,v]) => [k,strToU8(v)])));

test('프로젝트 읽기 도구는 같은 집계 함수를 사용하고 숨겨진 프로젝트나 잘못된 입력은 거부',()=>{
 const s=createSeed();assert.equal(projectProgress(s,{projectId:'care'}).indicators[0].actual,86);
 assert.throws(()=>projectProgress(s,{projectId:'care',write:true}));s.projects=[];assert.throws(()=>projectProgress(s,{projectId:'care'}));
});

test('HWPX 문단 순서와 표 안 텍스트를 중복 없이 읽고 위치를 보존', () => {
  const content=extractOffice('계획.hwpx',zip({'Contents/section0.xml':'<hs:sec xmlns:hs="s" xmlns:hp="p"><hp:p><hp:run><hp:t>목표 100명</hp:t><hp:tbl><hp:p><hp:run><hp:t>교육 12회</hp:t></hp:run></hp:p></hp:tbl></hp:run></hp:p></hs:sec>','Contents/section1.xml':'<sec><p><run><t>만족도 80%</t></run></p></sec>'}));
  assert.deepEqual(content.blocks.map(b=>b.text),['목표 100명','교육 12회','만족도 80%']);assert.match(content.blocks[2].location,/구역 2/);
});
test('DOCX 분리된 텍스트를 연결하고 삭제된 변경 추적 문장은 제외',()=>{
  const c=extractOffice('계획.docx',zip({'word/document.xml':'<w:document xmlns:w="word"><w:body><w:p><w:r><w:t>참여자 </w:t></w:r><w:del><w:r><w:delText>200</w:delText></w:r></w:del><w:r><w:t>100명 &amp; 협력</w:t></w:r></w:p></w:body></w:document>'}));
  assert.equal(c.blocks[0].text,'참여자 100명 & 협력');
});
test('XLSX 셀 주소·시트명·공유 문자열과 수식 저장값을 읽되 수식을 실행하지 않음',()=>{
  const c=extractOffice('성과.xlsx',zip({'xl/workbook.xml':'<workbook xmlns:r="r"><sheets><sheet name="성과표" r:id="rId2"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId2" Target="worksheets/sheet1.xml"/></Relationships>','xl/sharedStrings.xml':'<sst><si><t>참여자</t></si></sst>','xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="3"><c r="A3" t="s"><v>0</v></c><c r="B3"><v>100</v></c><c r="C3"><f>HYPERLINK("evil")</f><v>80</v></c></row></sheetData></worksheet>'}));
  assert.equal(c.blocks[0].location,'성과표 · 3행');assert.match(c.blocks[0].text,/A3: 참여자 \| B3: 100 \| C3: 80 \[수식 저장값\]/);assert.doesNotMatch(c.blocks[0].text,/HYPERLINK/);
});
test('파서가 외부 엔티티·손상 XML·압축 폭탄을 거부하고 큰 텍스트에는 한도 표시',()=>{
  assert.throws(()=>extractOffice('bad.docx',zip({'word/document.xml':'<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x>&secret;</x>'})),/외부 정의/);
  assert.throws(()=>extractOffice('bad.docx',zip({'word/document.xml':'<x><p>'})),/손상/);
  const bomb=zip({'word/document.xml':'x'.repeat(13*1024*1024)});
  new DataView(bomb.buffer).setUint32(22,10,true); // Lie about the expanded size in the local header.
  assert.throws(()=>readTextArchive(bomb),/12MB/);
  const c=collectContent('TXT',[{id:'1',location:'1행',text:'가'.repeat(90000)}]);assert.equal(c.truncated,true);assert.equal(c.blocks[0].text.length,80000);
  assert.throws(()=>extractOffice('legacy.hwp',strToU8('binary')),/내용 읽기는/);
});
test('설계 근거는 실적과 분리되고 다른 프로젝트 근거 연결·중복 확정을 거부',()=>{
  let s=createSeed();const indicator:Indicator={...s.indicators[0],id:'from-plan',name:'계획에서 정한 참여자',planningSource:{evidence:{documentId:'d1',versionId:'v1'},documentName:'임의 이름',location:'본문 1행',quote:'목표 100명',method:'manual',reviewedAt:''}};
  s=execute(s,{type:'indicator.add',indicator},'2026-10-06T00:00:00Z');const i=s.indicators.at(-1)!;
  assert.notEqual(i.planningSource!.documentName,'임의 이름');assert.equal(i.planningSource!.reviewedAt,'2026-10-06T00:00:00Z');assert.equal(metricSummary(s,i).actual,null);
  assert.throws(()=>execute(s,{type:'indicator.add',indicator:{...indicator,id:'duplicate'}}),/이미 만든/);
  assert.throws(()=>execute(s,{type:'indicator.add',indicator:{...indicator,id:'foreign',projectId:'reuse'}}),/자료|근거/);
  s=execute(s,{type:'report.create',projectId:'care',asOf:'2026-09-30',note:'다음 분기 확대'});assert.equal(s.reports[0].metrics.at(-1)!.planningSource!.quote,'목표 100명');assert.match(reportHTML(s.reports[0]),/목표 설계 근거/);
});
test('프로젝트 보고서를 실제 DOCX·XLSX 패키지로 출력하며 숫자·원문·정성 기준 보존',async()=>{
  let s=createSeed();s=execute(s,{type:'indicator.add',indicator:{...s.indicators[0],id:'qual-export',name:'자립 변화',aggregation:'qualitative',target:null,forecast:null,rubric:'두 번 스스로 참여',unit:'단계'}});
  s=execute(s,{type:'report.create',projectId:'care',asOf:'2026-09-30',note:'=HYPERLINK("https://evil.example") <script>alert(1)</script>'});const r=s.reports[0];
  const doc=await reportDOCX(r);const entries=unzipSync(new Uint8Array(await doc.arrayBuffer()));assert.ok(entries['[Content_Types].xml']);assert.ok(entries['word/document.xml']);
  const read=extractOffice('보고서.docx',new Uint8Array(await doc.arrayBuffer()));assert.ok(read.blocks.some(b=>b.text.includes('두 번 스스로 참여')));assert.ok(read.blocks.some(b=>b.text.includes('86명')));
  const xlsx=reportXLSX(r);const excel=unzipSync(xlsx);assert.ok(excel['xl/workbook.xml']);const xml=Object.values(excel).map(value=>strFromU8(value)).join('');assert.doesNotMatch(xml,/<f>/);assert.match(xml,/&lt;script&gt;/);
  const sheet=reportSheets(r).find(s=>s.name==='프로젝트 지표')!;assert.equal(sheet.rows[1][5],86);assert.equal(typeof sheet.rows[1][5],'number');assert.equal(sheet.rows.at(-1)![5],null);
});
test('연간 보고서의 기간·분기·프로젝트별 수치를 같은 스냅샷에서 출력',async()=>{
  const s=createSeed();const r=annualSnapshot(s,s.annualPlans![0],'2026-01-01','2026-09-30','연간 점검','2026-10-06T00:00:00Z');
  const sheets=reportSheets(r);assert.equal(sheets.find(x=>x.name==='연간 목표')!.rows[1][5],86);assert.ok(sheets.find(x=>x.name==='분기 점검'));
  const content=extractOffice('연간.xlsx',reportXLSX(r));assert.ok(content.blocks.some(b=>b.location.includes('연간 목표')));
  const doc=await reportDOCX(r);assert.ok(doc.size>1000);assert.match(annualReportHTML(r),/분기별/);
});
