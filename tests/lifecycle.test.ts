import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/domain/seed';
import { execute } from '../src/domain/commands';
import { annualGoalSummary, annualSnapshot } from '../src/domain/annual';
import { attainment, metricSummary, today } from '../src/domain/selectors';
import { annualReportHTML, reportHTML } from '../src/infrastructure/report';
import { authorizeCommand, visibleWorkspace } from '../server/policy';
import { commandSchema } from '../server/commands-schema';
import type { Indicator, Measurement, Workspace } from '../src/domain/types';

function withMetric(mode:Indicator['aggregation']){let s=createSeed();return execute(s,{type:'indicator.add',indicator:{...s.indicators[1],id:'custom',aggregation:mode,unit:mode==='ratio'?'%':'회',target:mode==='qualitative'?null:100,forecast:null,rubric:mode==='qualitative'?'당사자가 두 차례 직접 참여':undefined}});}
function record(s:Workspace,id:string,start:string,end:string,value:number,extra:Partial<Measurement>={}){return execute(s,{type:'measurement.add',measurement:{id,orgId:s.organization.id,projectId:'care',indicatorId:'custom',periodStart:start,asOf:end,value,note:'원본과 대조한 집계',status:'pending',createdAt:'2026-09-30T00:00:00Z',evidence:{documentId:'d1',versionId:'v1'},...extra}});}
function confirm(s:Workspace,id:string){return execute(s,{type:'measurement.confirm',projectId:'care',measurementId:id});}

test('기간별 합산은 확정 기록만 사용하고 보고 범위를 적용하며 경계 기록은 알림',()=>{
 let s=withMetric('period-sum');s=confirm(record(s,'a','2026-07-01','2026-07-31',20),'a');s=confirm(record(s,'b','2026-08-01','2026-08-31',30),'b');s=record(s,'p','2026-09-01','2026-09-30',1000);
 assert.equal(metricSummary(s,s.indicators.at(-1)!).actual,50);assert.equal(metricSummary(s,s.indicators.at(-1)!,'2026-09-30','2026-08-01').actual,30);
 const partial=metricSummary(s,s.indicators.at(-1)!,'2026-09-30','2026-08-15');assert.equal(partial.actual,null);assert.match(partial.warning!,/경계/);
 assert.throws(()=>confirm(record(s,'overlap','2026-07-20','2026-08-02',10),'overlap'),/겹치는/);
});
test('비율은 백분율 평균이 아닌 분자·분모 합계로 계산',()=>{
 let s=withMetric('ratio');s=confirm(record(s,'a','2026-07-01','2026-07-31',1,{denominator:2}),'a');s=confirm(record(s,'b','2026-08-01','2026-08-31',9,{denominator:10}),'b');
 assert.ok(Math.abs(metricSummary(s,s.indicators.at(-1)!).actual!-10/12*100)<0.001);
 assert.throws(()=>record(s,'bad','2026-09-01','2026-09-30',5,{denominator:0}),/전체 수/);
 assert.throws(()=>record(s,'bad','2026-09-01','2026-09-30',5,{denominator:4}),/전체 수/);
});
test('정성 평가는 억지 수치·달성률 없이 단계와 관찰 근거를 보존',()=>{
 let s=withMetric('qualitative');s=confirm(record(s,'q','2026-07-01','2026-09-30',0,{assessment:'partial',note:'인터뷰에서 일부 변화 확인'}),'q');
 const m=metricSummary(s,s.indicators.at(-1)!);assert.equal(m.actual,null);assert.equal(m.rate,null);assert.equal(m.assessment,'partial');assert.match(m.note!,/인터뷰/);
 s=execute(s,{type:'report.create',projectId:'care',asOf:'2026-09-30',note:''});assert.match(reportHTML(s.reports[0]),/일부 변화/);
});
test('정정은 검토 전 원래 값을 유지하고 확인 후 대체하며 두 번째 동시 정정은 거부',()=>{
 let s=withMetric('period-sum');s=confirm(record(s,'a','2026-07-01','2026-07-31',20),'a');s=record(s,'fix','2026-07-01','2026-07-31',22,{supersedesId:'a'});s=record(s,'race','2026-07-01','2026-07-31',23,{supersedesId:'a'});
 assert.equal(metricSummary(s,s.indicators.at(-1)!).actual,20);s=confirm(s,'fix');assert.equal(metricSummary(s,s.indicators.at(-1)!).actual,22);assert.equal(s.measurements.find(m=>m.id==='a')?.value,20);
 assert.throws(()=>confirm(s,'race'),/다른 정정/);assert.throws(()=>record(s,'wrong','2026-08-01','2026-08-31',5,{supersedesId:'fix'}),/같은 집계 기간/);
});
test('감소 목표와 0 목표는 방향에 맞게 판단하며 0 실적은 미입력과 구별',()=>{
 assert.equal(attainment(0,0,'lower'),100);assert.equal(attainment(5,10,'lower'),100);assert.equal(attainment(20,10,'lower'),50);assert.equal(attainment(0,10),0);assert.equal(attainment(null,10),null);
});
test('연간 목표는 단위·방향·합산 근거를 검사하고 누락 실적을 0으로 합치지 않음',()=>{
 let s=createSeed();const goal=s.annualGoals![0];assert.equal(annualGoalSummary(s,goal,'2026-09-30').actual,86);
 assert.throws(()=>execute(s,{type:'annual.goal.save',goal:{...goal,linkIds:['i1','i3']},reason:'연결 수정'}),/단위/);
 assert.throws(()=>execute(s,{type:'annual.goal.save',goal:{...goal,deduplication:''},reason:'수정'}),/중복 제외/);
 s.measurements=[];assert.equal(annualGoalSummary(s,goal,'2026-09-30').actual,null);
 s=createSeed();s.projects[0].start='2025-01-01';assert.equal(annualGoalSummary(s,goal,'2026-09-30').actual,null);assert.match(annualGoalSummary(s,goal,'2026-09-30').warning,/전년도/);
});
test('연간 계획은 연도 중복을 막고 목표·계획 변경 이력과 기존 점검본을 보존',()=>{
 let s=createSeed();const p=s.annualPlans![0];assert.throws(()=>execute(s,{type:'annual.plan.save',plan:{...p,id:'another'},reason:''}),/이미 있어요/);
 s=execute(s,{type:'annual.report.create',planId:p.id,start:'2026-01-01',end:'2026-09-30',note:'첫 점검'});const before=JSON.stringify(s.annualReports![0]);
 s=execute(s,{type:'annual.plan.save',plan:{...p,budget:95000000},reason:'추가 재원'});assert.equal(s.annualPlans![0].version,2);assert.equal(s.annualPlans![0].changes[0].previous.budget,90000000);
 const g=s.annualGoals![0];s=execute(s,{type:'annual.goal.save',goal:{...g,target:130},reason:'지원 범위 확대'});assert.equal(s.annualGoals![0].changes[0].previous.target,120);
 assert.equal(JSON.stringify(s.annualReports![0]),before);
});
test('연간 보고는 프로젝트 예산과 선택 기간 집행을 구분하고 분기를 중복 합산하지 않음',()=>{
 const s=createSeed(),p=s.annualPlans![0];const r=annualSnapshot(s,p,'2026-09-01','2026-09-30','<script>evil</script>','2026-10-01T00:00:00Z');
 assert.equal(r.spent,31200000);assert.equal(r.paid,26400000);assert.equal(r.allocated,80000000);assert.equal(r.quarters.reduce((n,q)=>n+q.spent,0),r.spent);
 assert.equal(r.goals[0].actual,86);const html=annualReportHTML(r);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
});
test('현장 기록은 버전이 있는 증빙 원본과 함께 저장하고 보고서에 연결',()=>{
 let s=createSeed();s=execute(s,{type:'activity.add',activity:{id:'visit',orgId:s.organization.id,projectId:'care',title:'이웃 방문',body:'함께 장보러 나감',date:'2026-09-29',ownerId:'m2',taskId:'t3',indicatorIds:['i1'],evidence:[{documentId:'d1',versionId:'v1'}]}});
 const a=s.activities![0],d=s.documents.find(d=>d.id===a.documentId)!;assert.match(d.versions[0].inlineText!,/함께 장보러/);
 s=execute(s,{type:'report.create',projectId:'care',asOf:'2026-09-30',note:''});assert.equal(s.reports[0].activities![0].body,'함께 장보러 나감');assert.ok(s.reports[0].evidence.some(e=>e.versionId===d.versions[0].id));
 assert.throws(()=>execute(s,{type:'activity.add',activity:{...a,id:'bad',evidence:[{documentId:'d3',versionId:'v3'}]}}),/같은 프로젝트/);
});
test('사업 완료는 남은 일과 검토를 확인하고 완료 후 변경을 막으며 재개 가능',()=>{
 let s=createSeed();const p=s.projects[0];assert.throws(()=>execute(s,{type:'project.update',project:{...p,status:'completed',closeNote:'마무리'},reason:'종료'}),/남은 업무/);
 for(const t of s.tasks.filter(t=>t.projectId===p.id))s=execute(s,{type:'task.status',projectId:p.id,taskId:t.id,status:'done'});
 s=execute(s,{type:'measurement.reject',projectId:p.id,measurementId:'r4',reason:'추가 확인 필요'});
 assert.throws(()=>execute(s,{type:'project.update',project:{...p,status:'completed',closeNote:'마무리'},reason:'종료'}),/보고서/);
 s=execute(s,{type:'report.create',projectId:p.id,asOf:today(),note:'종료'});s=execute(s,{type:'project.update',project:{...p,status:'completed',closeNote:'마무리'},reason:'종료'});
 assert.throws(()=>execute(s,{type:'task.status',projectId:p.id,taskId:'t1',status:'todo'}),/다시 열어/);
 s=execute(s,{type:'project.update',project:{...p,status:'active'},reason:'후속 작업'});assert.equal(s.projects[0].status,'active');
});
test('기존 저장 형식의 추가 필드가 없어도 원본을 보존하고 확장 가능',()=>{
 const s=createSeed();delete s.annualPlans;delete s.annualGoals;delete s.annualReports;delete s.activities;
 const next=execute(s,{type:'task.status',projectId:'care',taskId:'t1',status:'done'});assert.deepEqual(next.annualPlans,[]);assert.equal(next.documents.length,s.documents.length);assert.equal(s.tasks[0].status,'doing');
});
test('연간 정보와 현장 기록의 권한 범위: 관리자만 조직 전체 목표 접근',()=>{
 const s=createSeed(),actor={userId:'u',memberId:'m2',role:'member' as const,projects:['care']};
 assert.throws(()=>authorizeCommand(actor,{type:'annual.report.create',planId:'year-2026',start:'2026-01-01',end:'2026-09-30',note:''},s),/관리자/);
 s.activities=[{id:'secret',orgId:s.organization.id,projectId:'reuse',title:'secret',body:'secret',date:'2026-09-30',ownerId:'m2',indicatorIds:[],evidence:[],documentId:'d3',createdAt:''}];
 const visible=visibleWorkspace(s,actor);assert.deepEqual(visible.annualReports,[]);assert.deepEqual(visible.annualGoals,[]);assert.deepEqual(visible.annualPlans,[]);assert.deepEqual(visible.activities,[]);
 assert.ok(commandSchema.safeParse({type:'annual.report.create',planId:'year-2026',start:'2026-01-01',end:'2026-09-30',note:''}).success);
 assert.equal(commandSchema.safeParse({type:'annual.report.create',planId:'year-2026',start:'2026-01-01',end:'2026-09-30',note:'',bypass:true}).success,false);
});
