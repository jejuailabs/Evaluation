import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/domain/seed';
import { execute } from '../src/domain/commands';
import { budgetSummary, metricSummary, projectRows } from '../src/domain/selectors';
import { reportHTML } from '../src/infrastructure/report';
import type { Measurement } from '../src/domain/types';

test('누적 인원은 60+86이 아닌 최신 확인값 86을 사용',()=>{
  const s=createSeed(); assert.equal(metricSummary(s,s.indicators[0],'2026-10-05').actual,86);
  assert.equal(metricSummary(s,s.indicators[0],'2026-08-31').actual,60);
  assert.equal(metricSummary(s,s.indicators[0],'2026-07-31').actual,null);
});
test('검토 전 91명은 확인 전까지 대시보드에서 제외',()=>{
  const s=createSeed();const next=execute(s,{type:'measurement.confirm',projectId:'care',measurementId:'r4'});
  assert.equal(metricSummary(s,s.indicators[0],'2026-10-05').actual,86);
  assert.equal(metricSummary(next,next.indicators[0],'2026-10-05').actual,91);
  assert.equal(s.measurements.find(m=>m.id==='r4')!.status,'pending');
});
test('집행과 지급 중복 계산 방지, 예정 금액 차감',()=>{
  const s=createSeed();const b=budgetSummary(s,'care');
  assert.equal(b.spent,21600000);assert.equal(b.paid,16800000);assert.equal(b.committed,2400000);assert.equal(b.available,24000000);assert.equal(b.unpaid,4800000);
  const next=execute(s,{type:'expense.status',projectId:'care',expenseId:'e2',status:'paid'});
  assert.equal(budgetSummary(next,'care').spent,b.spent);assert.equal(budgetSummary(next,'care').unpaid,0);
});
test('기준일 이후 예산 거래 제외',()=>{
  const b=budgetSummary(createSeed(),'care','2026-09-30');assert.equal(b.committed,0);assert.equal(b.available,26400000);
});
test('다른 프로젝트 증빙으로 실적 기록 불가',()=>{
  const s=createSeed();const m={...s.measurements[4],id:'test',evidence:{documentId:'d3',versionId:'v3'}};
  assert.throws(()=>execute(s,{type:'measurement.add',measurement:m}),/같은 프로젝트/);
  assert.equal(s.measurements.length,5);
});
test('다른 조직 행과 잘못된 프로젝트 ID 차단',()=>{
  const s=createSeed();assert.throws(()=>execute(s,{type:'task.add',task:{...s.tasks[0],id:'test',orgId:'another'}}),/다른 조직/);
  assert.throws(()=>projectRows(s,s.tasks,'unknown'),/찾지 못/);
  assert.equal(projectRows(s,[...s.tasks,{...s.tasks[0],id:'foreign',orgId:'another'}],'care').length,4);
});
test('다른 프로젝트의 업무 ID 수정 차단',()=>{
  assert.throws(()=>execute(createSeed(),{type:'task.status',projectId:'reuse',taskId:'t1',status:'done'}),/업무를 찾지/);
});
test('예정 집행에 증빙을 나중에 연결한 후 확정 가능',()=>{
  let s=createSeed();s=execute(s,{type:'expense.add',expense:{...s.expenses[2],id:'later-evidence',evidence:undefined}});
  assert.throws(()=>execute(s,{type:'expense.status',projectId:'care',expenseId:'later-evidence',status:'confirmed'}),/증빙/);
  s=execute(s,{type:'expense.evidence',projectId:'care',expenseId:'later-evidence',evidence:{documentId:'d2',versionId:'v2'}});
  s=execute(s,{type:'expense.status',projectId:'care',expenseId:'later-evidence',status:'confirmed'});
  assert.equal(s.expenses.find(e=>e.id==='later-evidence')!.status,'confirmed');
});
test('0은 유효 실적이고 미입력과 구별',()=>{
  let s=createSeed();const m:Measurement={...s.measurements[4],id:'zero',indicatorId:'i2',value:0};
  s=execute(s,{type:'measurement.add',measurement:m});s=execute(s,{type:'measurement.confirm',projectId:'care',measurementId:'zero'});
  const summary=metricSummary(s,s.indicators[1],'2026-10-05');assert.equal(summary.actual,0);assert.equal(summary.rate,0);
});
test('같은 기준일의 두 확인값 금지',()=>{
  let s=createSeed();s=execute(s,{type:'measurement.add',measurement:{...s.measurements[4],id:'duplicate',asOf:'2026-09-30'}});
  assert.throws(()=>execute(s,{type:'measurement.confirm',projectId:'care',measurementId:'duplicate'}),/같은 기준일/);
});
test('증빙 없는 확정 집행과 역방향 상태 전이 차단',()=>{
  const s=createSeed();assert.throws(()=>execute(s,{type:'expense.add',expense:{...s.expenses[0],id:'bad',evidence:undefined}}),/증빙/);
  assert.throws(()=>execute(s,{type:'expense.status',projectId:'care',expenseId:'e1',status:'planned'}),/순서/);
});
test('잘못된 숫자와 날짜를 원자적으로 거부',()=>{
  const s=createSeed();assert.throws(()=>execute(s,{type:'measurement.add',measurement:{...s.measurements[4],id:'nan',value:NaN}}),/숫자/);
  assert.throws(()=>execute(s,{type:'task.add',task:{...s.tasks[0],id:'bad-date',due:'2026-02-31'}}),/날짜/);
  assert.throws(()=>execute(s,{type:'expense.add',expense:{...s.expenses[0],id:'negative',amount:-10}}),/숫자/);
  assert.equal(s.revision,0);
});
test('새 프로젝트는 평가 없이 시작하고 기존 데이터가 섞이지 않음',()=>{
  const s=createSeed();const next=execute(s,{type:'project.add',project:{...s.projects[0],id:'new'}});
  assert.deepEqual(projectRows(next,next.tasks,'new'),[]);assert.deepEqual(projectRows(next,next.indicators,'new'),[]);assert.equal(next.projects.length,3);
});
test('보고서 스냅샷은 원본 실적·목표·자료 변경 후에도 유지',()=>{
  let s=execute(createSeed(),{type:'report.create',projectId:'care',asOf:'2026-09-30',note:'첫 보고'});
  const report=JSON.stringify(s.reports[0]);
  s=execute(s,{type:'measurement.confirm',projectId:'care',measurementId:'r4'});
  s=execute(s,{type:'document.version',projectId:'care',documentId:'d1',version:{id:'vnew',name:'새 원본.txt',size:1,createdAt:new Date().toISOString(),inlineText:'새 내용'}});
  s.indicators[0].target=200;assert.equal(JSON.stringify(s.reports[0]),report);assert.equal(s.reports[0].metrics[0].actual,86);
  assert.equal(s.reports[0].evidence.find(e=>e.title==='9월 돌봄 활동 집계')?.versionId,'v1');
});
test('중복 명령은 같은 ID로 두 번 반영하지 않음',()=>{
  const s=createSeed();const command={type:'task.add' as const,task:{...s.tasks[0],id:'unique'}};const next=execute(s,command);
  assert.throws(()=>execute(next,command),/이미 처리/);assert.equal(next.tasks.length,s.tasks.length+1);
});
test('보고서 출력에서 사용자의 HTML을 실행 코드로 넣지 않음',()=>{
  const s=execute(createSeed(),{type:'report.create',projectId:'care',asOf:'2026-09-30',note:'<script>alert(1)</script>'});
  const html=reportHTML(s.reports[0]);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('86명'));
});
