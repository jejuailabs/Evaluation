import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recurrenceDates} from '../src/domain/recurrence';
import {execute} from '../src/domain/commands';
import {createSeed} from '../src/domain/seed';
import {annualSnapshot} from '../src/domain/annual';
const now='2026-10-06T10:00:00Z';
test('반복 일정: 월말 기준 유지·윤년·주 간격·400회 제한·잘못된 날짜 거절',()=>{
 assert.deepEqual(recurrenceDates({start:'2024-01-31',end:'2024-04-30',frequency:'monthly',interval:1}),['2024-01-31','2024-02-29','2024-03-31','2024-04-30']);
 assert.deepEqual(recurrenceDates({start:'2026-12-29',end:'2027-02-01',frequency:'weekly',interval:2}),['2026-12-29','2027-01-12','2027-01-26']);
 for(const schedule of [{start:'2026-02-30',end:'2026-03-01',frequency:'daily',interval:1},{start:'2026-01-01',end:'2028-01-01',frequency:'daily',interval:1},{start:'2026-01-01',end:'2026-01-02',frequency:'daily',interval:0}] as const)assert.throws(()=>recurrenceDates(schedule));
});
test('반복 변경·중단은 진행/완료/과거 업무 보존, 취소 이력과 보고 분모 일치',()=>{
 let s=createSeed();s.tasks=[];s.projects[0].start='2026-01-01';
 s=execute(s,{type:'task.series.create',series:{id:'series',orgId:s.organization.id,projectId:'care',title:'점검',ownerId:'m1',start:'2026-10-05',end:'2026-10-09',frequency:'daily',interval:1}},now);
 s=execute(s,{type:'task.status',projectId:'care',taskId:'series:2026-10-06',status:'done'},now);
 s=execute(s,{type:'task.status',projectId:'care',taskId:'series:2026-10-07',status:'doing'},now);
 s=execute(s,{type:'task.series.update',projectId:'care',seriesId:'series',effectiveFrom:'2026-10-06',reason:'담당 교대',fields:{title:'방문 점검',ownerId:'m2'}},now);
 assert.deepEqual(s.tasks.map(t=>t.ownerId),['m1','m1','m1','m2','m2']);
 s=execute(s,{type:'task.series.stop',projectId:'care',seriesId:'series',effectiveFrom:'2026-10-06',reason:'사업 변경'},now);
 assert.equal(s.tasks.filter(t=>t.cancelled).length,2);assert.equal(s.tasks.length,5);assert.equal(s.taskSeries![0].changes.length,2);
 assert.throws(()=>execute(s,{type:'task.status',projectId:'care',taskId:'series:2026-10-08',status:'todo'},now),/중단/);
 // A prior cancellation dated within the report period must never count as unfinished work.
 s.tasks.push({...s.tasks[4],id:'past-cancel',due:'2026-10-06'});
 s=execute(s,{type:'report.create',projectId:'care',asOf:'2026-10-06',note:''},now);
 assert.equal(s.reports[0].totalTasks,2);assert.equal(s.reports[0].completedTasks,1);
 const plan={id:'p',orgId:s.organization.id,year:2026,title:'연간',purpose:'기록',budget:0,status:'active' as const,version:1,changes:[]};
 const annual=annualSnapshot(s,plan,'2026-01-01','2026-10-06','',now);assert.equal(annual.projects.find(p=>p.id==='care')!.tasks,2);
 assert.throws(()=>execute(s,{type:'task.series.create',series:{...s.taskSeries![0],id:'outside',start:'2025-12-31'}},now),/기간/);
});
test('자료함: 프로젝트 없이 메모 보관 후 원본 유지, 활동·근거 연결, 실패시 전체 롤백',()=>{
 const original=createSeed();let s=execute(original,{type:'intake.add',id:'in',title:'방문 메모',note:'취합 전',source:{kind:'text',text:'오늘 이용자 3명을 방문했다.'}},now,'m2');
 const v=structuredClone(s.intakeItems![0].version);assert.equal(s.intakeItems![0].createdById,'m2');assert.equal(s.documents.length,original.documents.length);
 const before=structuredClone(s);
 assert.throws(()=>execute(s,{type:'intake.assign',id:'in',projectId:'care',activity:{date:'2026-10-05',body:'확인',indicatorIds:['wrong']}},now,'m2'),/지표/);assert.deepEqual(s,before);
 s=execute(s,{type:'intake.assign',id:'in',projectId:'care',activity:{date:'2026-10-05',body:'방문 기록',indicatorIds:[],taskId:'t1'}},now,'m2');
 const item=s.intakeItems![0],document=s.documents.find(d=>d.id===item.documentId)!;
 assert.deepEqual(document.versions[0],v);assert.equal(item.status,'linked');assert.equal(s.activities![0].evidence[0].versionId,v.id);assert.equal(s.measurements.length,original.measurements.length);
 assert.throws(()=>execute(s,{type:'intake.assign',id:'in',projectId:'care'},now),/대기/);
 assert.throws(()=>execute(s,{type:'intake.archive',id:'in',archived:true,reason:'보관'},now));
 const empty=createSeed();empty.projects=[];
 const pending=execute(empty,{type:'intake.add',id:'memo',title:'기획',note:'',source:{kind:'text',text:'아이디어'}},now);
 const archived=execute(pending,{type:'intake.archive',id:'memo',archived:true,reason:'나중에 진행'},now);
 assert.equal(execute(archived,{type:'intake.archive',id:'memo',archived:false,reason:'다시 시작'},now).intakeItems![0].status,'pending');
});
