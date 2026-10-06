import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execute} from '../src/domain/commands';
import {createSeed} from '../src/domain/seed';
import {budgetSummary} from '../src/domain/selectors';
import {expensePaid,expenseTotals} from '../src/domain/finance-selectors';
import {annualSnapshot} from '../src/domain/annual';
import {reportSheets} from '../src/infrastructure/report-data';
import {reportHTML} from '../src/infrastructure/report';
import type {Command,Workspace} from '../src/domain/types';
const now='2026-10-05T12:00:00Z',pid='care',evidence={documentId:'d2',versionId:'v2'};
function run(s:Workspace,c:Command,actor='m1'){return execute(s,c,now,actor);}
function begin(amount=100000){let s=createSeed();s.expenses=[];s=run(s,{type:'budget.line.save',line:{id:'line',orgId:s.organization.id,projectId:pid,name:'활동비',fundingSource:'자체 사업비',allocated:200000},reason:''});return run(s,{type:'expense.add',expense:{id:'request',orgId:s.organization.id,projectId:pid,title:'현장 재료',amount,date:'2026-09-20',ownerId:'m2',budgetLineId:'line',evidence,status:'planned'}},'m2');}
function approve(s=begin()){s=run(s,{type:'expense.submit',projectId:pid,expenseId:'request'},'m2');return run(s,{type:'expense.review',projectId:pid,expenseId:'request',decision:'confirmed',reason:'견적과 활동 계획 대조'});}
function pay(s:Workspace,id:string,amount:number,date='2026-10-01'){return run(s,{type:'expense.pay',projectId:pid,expenseId:'request',payment:{id,amount,date,note:'이체 확인',evidence}});}

test('보완→수정→재요청→승인: 원래 내용과 처리자 보존, 상태 건너뛰기 차단',()=>{
 let s=begin();assert.throws(()=>run(s,{type:'expense.status',projectId:pid,expenseId:'request',status:'confirmed'}),/검토 요청/);
 s=run(s,{type:'expense.submit',projectId:pid,expenseId:'request'},'m2');assert.equal(budgetSummary(s,pid).spent,0);
 assert.throws(()=>run(s,{type:'expense.update',projectId:pid,expenseId:'request',fields:{...s.expenses[0],title:'변조'},reason:'변조'}),/수정/);
 s=run(s,{type:'expense.review',projectId:pid,expenseId:'request',decision:'returned',reason:'수량 상세 필요'});
 s=run(s,{type:'expense.update',projectId:pid,expenseId:'request',fields:{title:'활동 재료 20개',amount:80000,date:'2026-09-20',ownerId:'m2',budgetLineId:'line',evidence,description:'20개 × 4,000원'},reason:'수량·단가 추가'},'m2');
 s=approve(s);assert.equal(s.expenses[0].history?.[0].actorId,'m2');assert.equal(s.expenses[0].history?.find(h=>h.previous)?.previous?.amount,100000);assert.equal(budgetSummary(s,pid).spent,80000);assert.equal(budgetSummary(s,pid).committed,0);
});
test('세목·전체 예산 초과 승인, 타 프로젝트 세목, 승인 후 예산 축소 차단',()=>{
 let s=begin(250000);s=run(s,{type:'expense.submit',projectId:pid,expenseId:'request'});const snapshot=JSON.stringify(s);
 assert.throws(()=>run(s,{type:'expense.review',projectId:pid,expenseId:'request',decision:'confirmed',reason:'확인'}),/세목/);assert.equal(JSON.stringify(s),snapshot);
 const line=s.budgetLines![0];assert.throws(()=>run(s,{type:'budget.line.save',line:{...line,id:'too-big',name:'다른 세목',allocated:48000000},reason:''}),/전체 예산/);
 assert.throws(()=>run(begin(),{type:'expense.update',projectId:pid,expenseId:'request',fields:{...begin().expenses[0],budgetLineId:'foreign'},reason:'수정'}),/세목/);
 s=approve();assert.throws(()=>run(s,{type:'budget.line.save',line:{...line,allocated:90000},reason:'축소'}),/이미 승인/);
 assert.throws(()=>run(s,{type:'project.update',project:{...s.projects[0],budget:90000},reason:'축소'}),/세목/);
 s.budgetLines=[];s.expenses[0].budgetLineId=undefined;s.projects[0].budget=90000;s.expenses[0].status='submitted';assert.throws(()=>run(s,{type:'expense.review',projectId:pid,expenseId:'request',decision:'confirmed',reason:'확인'}),/프로젝트 예산/);
});
test('부분 지급은 실제 지급일에 집계, 이전 달 집행을 이번 달 지급에 포함',()=>{
 let s=approve();s=pay(s,'pay1',30000,'2026-09-30');s=pay(s,'pay2',50000,'2026-10-01');
 assert.equal(s.expenses[0].status,'confirmed');assert.equal(expensePaid(s.expenses[0]),80000);
 const sept=budgetSummary(s,pid,'2026-09-30','2026-09-01'),oct=budgetSummary(s,pid,'2026-10-05','2026-10-01');
 assert.equal(sept.spent,100000);assert.equal(sept.paid,30000);assert.equal(sept.unpaid,70000);assert.equal(oct.spent,0);assert.equal(oct.paid,50000);assert.equal(oct.unpaid,20000);
 const annual=annualSnapshot(s,s.annualPlans![0],'2026-10-01','2026-10-05','',now);assert.equal(annual.spent,0);assert.equal(annual.paid,50000);
 assert.throws(()=>pay(s,'excess',20001),/미지급액/);assert.throws(()=>pay(s,'pay1',1),/이미 등록/);
 s=pay(s,'pay3',20000);assert.equal(s.expenses[0].status,'paid');assert.equal(budgetSummary(s,pid).spent,100000);
});
test('지급 정정은 원장 보존, 기존 보고서는 불변, 무효 지급 제외와 재지급',()=>{
 let s=pay(approve(),'pay1',100000);s=run(s,{type:'report.create',projectId:pid,asOf:'2026-10-05',periodStart:'2026-10-01',note:'지급 확인'});const old=JSON.stringify(s.reports[0]);
 s=run(s,{type:'expense.payment.void',projectId:pid,expenseId:'request',paymentId:'pay1',reason:'금액 입력 오류'});
 assert.equal(expensePaid(s.expenses[0]),0);assert.equal(s.expenses[0].payments![0].amount,100000);assert.equal(s.expenses[0].status,'confirmed');assert.equal(JSON.stringify(s.reports[0]),old);
 assert.throws(()=>run(s,{type:'expense.payment.void',projectId:pid,expenseId:'request',paymentId:'pay1',reason:'반복'}),/찾지/);
 s=pay(s,'correct',80000);assert.equal(budgetSummary(s,pid).unpaid,20000);
});
test('취소된 요청·보완 중 요청을 확정 집행으로 더하지 않으며 지급 후 취소 차단',()=>{
 let s=begin();s=run(s,{type:'expense.cancel',projectId:pid,expenseId:'request',reason:'활동 취소'});assert.equal(budgetSummary(s,pid).committed,0);assert.equal(budgetSummary(s,pid).spent,0);
 assert.throws(()=>run(s,{type:'expense.submit',projectId:pid,expenseId:'request'}),/상태/);
 s=pay(approve(),'part',1000);assert.throws(()=>run(s,{type:'expense.cancel',projectId:pid,expenseId:'request',reason:'취소'}),/지급 기록/);
 assert.equal(expenseTotals([{...s.expenses[0],status:'returned',payments:[]}]).spent,0);
});
test('지급 증빙·날짜·작성자 위조 방지와 오래된 지급 완료 자료 보존',()=>{
 const s=approve();assert.throws(()=>run(s,{type:'expense.pay',projectId:pid,expenseId:'request',payment:{id:'bad',amount:1,date:'2026-09-30',note:'기록',evidence:{documentId:'d3',versionId:'v3'}}}),/같은 프로젝트/);
 assert.throws(()=>pay(s,'early',1,'2026-09-19'),/지급일/);assert.throws(()=>pay(s,'future',1,'2099-01-01'),/지급일/);
 assert.equal(expensePaid(createSeed().expenses[0]),16800000);assert.equal(expensePaid(createSeed().expenses[0],'2026-10-01'),0);
 const paid=pay(s,'real',10);assert.equal(paid.expenses[0].payments![0].actorId,'m1');
});
test('지급·정정·처리 이력을 보고서와 Excel/HTML에 포함하고 사용자 문자열 이스케이프',()=>{
 let s=pay(approve(),'p',10000);s.expenses[0].title='<script>unsafe</script>';s=run(s,{type:'report.create',projectId:pid,asOf:'2026-10-05',periodStart:'2026-10-01',note:''});
 const report=s.reports[0],sheets=reportSheets(report);assert.equal(report.finance?.expenses[0].periodPaid,10000);assert.equal(report.finance?.expenses[0].periodSpent,0);
 assert.equal(sheets.find(s=>s.name==='지급 원장')!.rows[1][3],10000);assert.ok(sheets.find(s=>s.name==='집행 처리 이력')!.rows.length>2);assert.ok(report.evidence.some(e=>e.versionId==='v2'));
 const html=reportHTML(report);assert.ok(html.includes('집행·지급 명세'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
});
