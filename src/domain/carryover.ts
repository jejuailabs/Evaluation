import type {Command,Workspace} from './types';
import {allocateAnnualBudget,projectYearBudget} from './annual-budget';
import {uid} from './selectors';
export function applyCarryover(s:Workspace,c:Command,now:string,actorId:string){
 if(c.type!=='annual.budget.carryover')return null;
 const from=s.annualPlans?.find(p=>p.id===c.fromPlanId),to=s.annualPlans?.find(p=>p.id===c.toPlanId),project=s.projects.find(p=>p.id===c.projectId);
 if(!from||!to||!project||to.year!==from.year+1||from.status==='closed'||to.status==='closed'||from.budgetPolicy!=='yearly'||to.budgetPolicy!=='yearly')throw new Error('진행 중인 연도별 배분 계획에서 다음 연도로 이월해 주세요.');
 if(!Number.isSafeInteger(c.amount)||c.amount<=0||!c.reason.trim())throw new Error('이월 금액과 이유를 입력해 주세요.');
 const selected=s.expenses.filter(e=>c.expenseIds.includes(e.id));
 if(selected.length!==new Set(c.expenseIds).size||selected.some(e=>e.projectId!==project.id||!e.date.startsWith(String(from.year))||!['planned','submitted','returned'].includes(e.status)))throw new Error('이월할 전년도 예정·검토 요청 집행을 선택해 주세요.');
 if(c.date<`${to.year}-01-01`||c.date>`${to.year}-12-31`||c.date<project.start||c.date>project.end||new Date(c.date).toISOString().slice(0,10)!==c.date)throw new Error('다음 연도와 프로젝트 기간 안의 예정일을 입력해 주세요.');
 const old=projectYearBudget(s,project.id,from),next=projectYearBudget(s,project.id,to),commitment=selected.reduce((n,e)=>n+e.amount,0);
 if(c.amount>old.afterPlanned+commitment||c.amount<commitment)throw new Error('선택한 예정액 이상, 전년도 미사용 예산 이내로 이월해 주세요.');
 const entry={id:uid(),fromYear:from.year,toYear:to.year,projectId:project.id,amount:c.amount,expenseIds:c.expenseIds,at:now,actorId,reason:c.reason};
 for(const [p,delta] of [[from,-c.amount],[to,c.amount]] as const){p.changes.push({at:now,reason:'예산 이월 · '+c.reason,previous:{title:p.title,purpose:p.purpose,budget:p.budget}});p.budget+=delta;(p.carryovers??=[]).push(entry);}
 for(const e of selected){(e.history??=[]).push({id:uid(),at:now,actorId,action:'다음 연도 약정 이월',reason:c.reason,status:e.status,previous:{title:e.title,amount:e.amount,date:e.date,ownerId:e.ownerId,evidence:e.evidence,budgetLineId:e.budgetLineId,description:e.description}});e.date=c.date;e.status='planned';e.approvalRoute=[];e.approvals=[];}
 allocateAnnualBudget(s,{type:'annual.budget.allocate',planId:from.id,allocations:[{projectId:project.id,amount:old.allocated-c.amount}],reason:c.reason},now,actorId);
 allocateAnnualBudget(s,{type:'annual.budget.allocate',planId:to.id,allocations:[{projectId:project.id,amount:next.allocated+c.amount}],reason:c.reason},now,actorId);
 return {projectId:'',action:`${from.year} → ${to.year} 예산·약정 이월 · ${c.amount}원`};
}
