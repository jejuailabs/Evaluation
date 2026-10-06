import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSeed} from '../src/domain/seed';
import {execute} from '../src/domain/commands';
import {annualSnapshot} from '../src/domain/annual';
import {annualBudget,projectYearBudget} from '../src/domain/annual-budget';
import {annualReportHTML} from '../src/infrastructure/report';
import {reportSheets} from '../src/infrastructure/report-data';
import {reportDOCX} from '../src/infrastructure/report-docx';
import {unzipSync,strFromU8} from 'fflate';
import {authorizeCommand} from '../server/policy';
const c=(care:number,reuse:number)=>({type:'annual.budget.allocate' as const,planId:'year-2026',allocations:[{projectId:'care',amount:care},{projectId:'reuse',amount:reuse}],reason:'사업별 연간 배분'});
function seed(){const s=createSeed();s.projects.forEach(p=>p.budget=100_000_000);s.annualPlans![0].budget=100_000_000;return s;}
test('연간 예산: 일괄 배분·재배분·사유·예정 초과 안내 및 원본 불변',()=>{
 const original=seed(),a=execute(original,c(50_000_000,40_000_000));assert.equal(original.annualAllocations,undefined);
 assert.equal(annualBudget(a,a.annualPlans![0]).remaining,10_000_000);assert.equal(a.annualPlans![0].budgetPolicy,'yearly');
 const b=execute(a,c(40_000_000,50_000_000));assert.equal(b.annualAllocations![0].version,2);assert.equal(b.annualAllocations![0].changes[1].previous,50_000_000);
 assert.throws(()=>execute(b,c(60_000_000,50_000_000)),/연간 예산/);
 assert.throws(()=>execute(b,c(1,50_000_000)),/승인 집행/);
 assert.throws(()=>execute(b,{...c(40_000_000,50_000_000),allocations:[{projectId:'care',amount:1},{projectId:'care',amount:2}]}),/중복/);
 assert.throws(()=>execute(b,{...c(40_000_000,50_000_000),reason:''}),/이유/);
 assert.throws(()=>authorizeCommand({role:'member',userId:'u',memberId:'m',projects:['care']},c(1,1),b),/관리자/);
 const tight=execute(b,c(21_600_000,40_000_000));assert.ok(projectYearBudget(tight,'care',tight.annualPlans![0]).afterPlanned<0);
 assert.throws(()=>execute(tight,{type:'expense.status',projectId:'care',expenseId:'e3',status:'confirmed'}),/연도 배정액/);
});
test('연간 예산: 여러 해 배분 합계·프로젝트 축소·연간 예산 축소·마감 잠금',()=>{
 let s=execute(seed(),c(50_000_000,40_000_000));s=execute(s,{type:'project.update',project:{...s.projects[0],end:'2027-12-31'},reason:'2년 사업'});
 s=execute(s,{type:'annual.plan.save',plan:{id:'2027',orgId:s.organization.id,year:2027,title:'다음해',purpose:'이어가기',budget:100_000_000},reason:''});
 assert.throws(()=>execute(s,{type:'annual.budget.allocate',planId:'2027',allocations:[{projectId:'care',amount:60_000_000}],reason:'배분'}),/여러 연도/);
 s=execute(s,{type:'annual.budget.allocate',planId:'2027',allocations:[{projectId:'care',amount:30_000_000}],reason:'차년도 배분'});
 assert.throws(()=>execute(s,{type:'project.update',project:{...s.projects[0],budget:79_000_000},reason:'축소'}),/여러 연도/);
 const p=s.annualPlans![0];assert.throws(()=>execute(s,{type:'annual.plan.save',plan:{id:p.id,orgId:p.orgId,year:p.year,title:p.title,purpose:p.purpose,budget:89_000_000},reason:'축소'}),/연간 예산/);
 assert.throws(()=>execute(s,{type:'project.update',project:{...s.projects[0],end:'2026-12-31'},reason:'기간 축소'}),/배정된 연도/);
 s.annualPlans![0].status='closed';assert.throws(()=>execute(s,c(50_000_000,40_000_000)),/마감/);
 assert.throws(()=>execute(s,{type:'expense.status',projectId:'care',expenseId:'e2',status:'paid'}),/마감/);
});
test('연간 보고: 해당 연도 배정·미배분과 출력, 이전 스냅샷의 기준 보존',async()=>{
 const original=seed(),old=annualSnapshot(original,original.annualPlans![0],'2026-01-01','2026-09-30','','2026-10-06T00:00:00Z');
 const s=execute(original,c(50_000_000,40_000_000)),snapshot=annualSnapshot(s,s.annualPlans![0],'2026-01-01','2026-09-30','','2026-10-06T00:00:00Z');
 assert.equal(snapshot.allocated,90_000_000);assert.equal(snapshot.unallocated,10_000_000);assert.equal(snapshot.budgetBasis,'yearly');assert.equal(old.budgetBasis,undefined);assert.equal(old.allocated,200_000_000);
 assert.match(annualReportHTML(snapshot),/해당 연도 배정/);assert.match(annualReportHTML(old),/사업 전체 예산/);
 assert.ok(reportSheets(snapshot).find(s=>s.name==='사업비')!.rows.some(r=>r[0]==='미배분'&&r[1]===10_000_000));
 const zip=unzipSync(new Uint8Array(await(await reportDOCX(snapshot)).arrayBuffer()));assert.match(strFromU8(zip['word/document.xml']),/해당 연도 배정/);
});
