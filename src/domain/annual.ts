import {annualBudget} from './annual-budget';
import type { AnnualGoal, AnnualPlan, AnnualReport, GoalSummary, Workspace } from './types';
import { attainment, metricSummary, ownerName, uid, confirmedMeasurements } from './selectors';
import {expenseTotals,financeSnapshot} from './finance-selectors';

export function annualGoalSummary(s:Workspace,g:AnnualGoal,end:string,start?:string):GoalSummary {
  const plan=s.annualPlans?.find(p=>p.id===g.planId);const from=start??`${plan?.year}-01-01`;
  const metrics=g.linkIds.flatMap(id=>{const i=s.indicators.find(i=>i.id===id);if(!i)return [];return [{...metricSummary(s,i,end,from),projectName:s.projects.find(p=>p.id===i.projectId)?.name??''}];});
  const problems:string[]=[];
  if(!metrics.length)problems.push('프로젝트 지표를 연결해 주세요.');
  if(g.aggregation==='separate')problems.push('서로 다른 결과를 합치지 않고 프로젝트별로 보여 줘요.');
  if(metrics.some(m=>m.actual===null))problems.push('확인된 수치가 없는 지표가 있어요.');
  if(metrics.some(m=>m.warning?.includes('기간 경계')))problems.push('선택한 기간에 걸친 기록이 있어요. 기간별로 나누어 확인한 뒤 합산해 주세요.');
  if(g.aggregation==='sum'&&g.linkIds.some(id=>{const i=s.indicators.find(i=>i.id===id);const p=s.projects.find(p=>p.id===i?.projectId);return i?.aggregation==='cumulative-snapshot'&&p&&p.start<`${plan?.year}-01-01`;}))problems.push('전년도부터의 누적 지표는 연간 실적으로 합산할 수 없어요. 연도별 지표로 분리해 주세요.');
  const canSum=g.aggregation==='sum'&&!problems.length;
  const distinct=g.linkIds.length>0&&g.linkIds.every(id=>s.indicators.find(i=>i.id===id)?.uniqueParticipants);
  const actual=canSum?(distinct?new Set(g.linkIds.flatMap(id=>{const i=s.indicators.find(i=>i.id===id)!;const rows=confirmedMeasurements(s,i,end);return (i.aggregation==='cumulative-snapshot'?rows.slice(0,1):rows.filter(m=>(m.periodStart??m.asOf)>=from)).flatMap(m=>m.participantKeys??[]);})).size:metrics.reduce((n,m)=>n+m.actual!,0)):null;
  const forecast=g.aggregation==='sum'&&metrics.length&&metrics.every(m=>m.forecast!==null)?metrics.reduce((n,m)=>n+m.forecast!,0):null;
  return {id:g.id,name:g.name,unit:g.unit,target:g.target,actual,forecast,rate:attainment(actual,g.target,g.direction),definition:g.definition,warning:problems.join(' '),metrics};
}
export function annualProjects(s:Workspace,p:AnnualPlan){
  const start=`${p.year}-01-01`,end=`${p.year}-12-31`;
  return s.projects.filter(x=>x.orgId===p.orgId&&x.start<=end&&x.end>=start);
}
export function annualSnapshot(s:Workspace,p:AnnualPlan,start:string,end:string,note:string,now:string):AnnualReport {
  const projects=annualProjects(s,p).map(project=>{
    const costs=expenseTotals(s.expenses.filter(e=>e.projectId===project.id&&e.orgId===p.orgId),start,end);
    const tasks=s.tasks.filter(t=>!t.cancelled&&t.projectId===project.id&&t.due>=start&&t.due<=end);
    return {id:project.id,name:project.name,owner:ownerName(s,project.ownerId),status:project.status??'active',allocated:p.budgetPolicy==='yearly'?(s.annualAllocations??[]).find(a=>a.planId===p.id&&a.projectId===project.id)?.amount??0:project.budget,
      spent:costs.spent,paid:costs.paid,
      done:tasks.filter(t=>t.status==='done').length,tasks:tasks.length};
  });
  const goals=(s.annualGoals??[]).filter(g=>g.planId===p.id);
  const ids=new Set(projects.map(p=>p.id));
  return {id:uid(),orgId:p.orgId,planId:p.id,title:`${p.title} · ${end} 점검`,year:p.year,start,end,createdAt:now,planVersion:p.version,purpose:p.purpose,note,
    budgetBasis:p.budgetPolicy,unallocated:p.budgetPolicy==='yearly'?annualBudget(s,p).remaining:undefined,goals:goals.map(g=>annualGoalSummary(s,g,end,start)),budget:p.budget,allocated:projects.reduce((n,p)=>n+p.allocated,0),spent:projects.reduce((n,p)=>n+p.spent,0),paid:projects.reduce((n,p)=>n+p.paid,0),
    pending:s.measurements.filter(m=>ids.has(m.projectId)&&m.status==='pending'&&m.asOf>=start&&m.asOf<=end).length,projects,finance:financeSnapshot(s,[...ids],start,end),
    quarters:[1,2,3,4].flatMap(q=>{const from=`${p.year}-${String(q*3-2).padStart(2,'0')}-01`,to=`${p.year}-${String(q*3).padStart(2,'0')}-${q===1||q===4?'31':'30'}`;if(from>end||to<start)return [];const cut=to<end?to:end;return [{label:`${q}분기${cut<to?' · 진행 중':''}`,spent:expenseTotals(s.expenses.filter(e=>ids.has(e.projectId)&&e.orgId===p.orgId),from>start?from:start,cut).spent,goals:goals.map(g=>{const m=annualGoalSummary(s,g,cut,`${p.year}-01-01`);return {name:m.name,actual:m.actual,unit:m.unit};})}];})};
}
