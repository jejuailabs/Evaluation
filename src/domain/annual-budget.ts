import type {AnnualPlan,Command,Workspace} from './types';
import {expenseTotals,isApproved} from './finance-selectors';
export const allocationId=(planId:string,projectId:string)=>`${planId}:${projectId}`;
export function annualBudget(s:Workspace,plan:AnnualPlan){
 const rows=(s.annualAllocations??[]).filter(a=>a.planId===plan.id);
 const allocated=rows.reduce((n,a)=>n+a.amount,0);
 return {allocated,remaining:plan.budget-allocated,rows};
}
export function allocateAnnualBudget(s:Workspace,c:Extract<Command,{type:'annual.budget.allocate'}>,now:string,actorId:string){
 const p=s.annualPlans?.find(p=>p.id===c.planId&&p.orgId===s.organization.id);
 if(!p)throw new Error('연간 계획을 찾지 못했어요.');if(p.status==='closed')throw new Error('마감된 연간 계획이에요. 먼저 다시 열어 주세요.');
 if(!c.reason.trim())throw new Error('배분 이유를 남겨 주세요.');
 if(new Set(c.allocations.map(a=>a.projectId)).size!==c.allocations.length)throw new Error('같은 프로젝트를 중복 배분할 수 없어요.');
 s.annualAllocations??=[];
 for(const a of c.allocations){
  const project=s.projects.find(x=>x.id===a.projectId&&x.orgId===p.orgId);
  if(!project||project.start>`${p.year}-12-31`||project.end<`${p.year}-01-01`)throw new Error('해당 연도에 진행하는 프로젝트만 배분할 수 있어요.');
  if(!Number.isSafeInteger(a.amount)||a.amount<0)throw new Error('배정액은 0 이상의 원 단위 정수예요.');
  const old=s.annualAllocations.find(x=>x.planId===p.id&&x.projectId===a.projectId);
  if(old){if(old.amount!==a.amount){old.changes.push({at:now,actorId,reason:c.reason,previous:old.amount});old.amount=a.amount;old.version++;}}
  else s.annualAllocations.push({id:allocationId(p.id,a.projectId),orgId:p.orgId,planId:p.id,projectId:a.projectId,amount:a.amount,version:1,changes:[{at:now,actorId,reason:c.reason,previous:0}]});
 }
 p.budgetPolicy='yearly';p.version++;
 return {projectId:'',action:`${p.year}년 프로젝트 예산 배분 · ${c.reason}`};
}
// Run after every command, so changing an expense, project or annual plan cannot bypass the limits.
export function validateAnnualBudget(before:Workspace,s:Workspace){
 for(const p of s.annualPlans??[]){
  if(p.budgetPolicy!=='yearly')continue;
  const b=annualBudget(s,p);
  if(!Number.isSafeInteger(b.allocated)||b.allocated>p.budget)throw new Error(`${p.year}년 배정 합계가 연간 예산을 넘어요. 배정을 줄이거나 연간 예산을 먼저 변경해 주세요.`);
  const from=`${p.year}-01-01`,to=`${p.year}-12-31`;
  for(const project of s.projects){
   const allocation=b.rows.find(a=>a.projectId===project.id)?.amount??0;
   if(allocation>0&&(project.start>to||project.end<from))throw new Error('배정된 연도를 벗어나도록 프로젝트 기간을 바꿀 수 없어요.');
   const spent=s.expenses.filter(e=>e.projectId===project.id&&e.date>=from&&e.date<=to&&isApproved(e)).reduce((n,e)=>n+e.amount,0);
   if(spent>allocation)throw new Error(`${p.year}년 ${project.name}의 승인 집행이 연도 배정액을 넘어요. 연간 계획에서 배분을 먼저 조정해 주세요.`);
  }
  if(p.status==='closed'){
   const relevant=(w:Workspace)=>w.expenses.filter(e=>e.date>=from&&e.date<=to||(e.payments??[]).some(x=>x.date>=from&&x.date<=to));
   if(JSON.stringify(relevant(before))!==JSON.stringify(relevant(s)))throw new Error(`${p.year}년이 마감되어 집행을 바꿀 수 없어요. 연간 계획을 다시 열어 주세요.`);
  }
 }
 for(const project of s.projects){
  const allocated=(s.annualAllocations??[]).filter(a=>a.projectId===project.id).reduce((n,a)=>n+a.amount,0);
  if(!Number.isSafeInteger(allocated)||allocated>project.budget)throw new Error(`${project.name}의 여러 연도 배정 합계가 사업 전체 예산을 넘어요.`);
 }
}
export function projectYearBudget(s:Workspace,pid:string,plan:AnnualPlan){
 const allocated=(s.annualAllocations??[]).find(a=>a.planId===plan.id&&a.projectId===pid)?.amount??0;
 const totals=expenseTotals(s.expenses.filter(e=>e.projectId===pid),`${plan.year}-01-01`,`${plan.year}-12-31`);
 return {allocated,...totals,available:allocated-totals.spent,afterPlanned:allocated-totals.spent-totals.committed};
}
