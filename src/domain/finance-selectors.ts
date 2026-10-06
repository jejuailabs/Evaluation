import type { Expense, FinanceSnapshot, Workspace } from './types';

export const isApproved=(e:Expense)=>e.status==='confirmed'||e.status==='paid';
export const isReserved=(e:Expense)=>['planned','submitted','returned'].includes(e.status);
const inPeriod=(date:string,start?:string,end?:string)=>(!start||date>=start)&&(!end||date<=end);
// Old paid entries have no payment ledger. Keep their original date/amount as a legacy payment.
export function expensePaid(e:Expense,start?:string,end?:string):number {
  if(e.payments!==undefined)return e.payments.filter(p=>!p.voided&&inPeriod(p.date,start,end)).reduce((n,p)=>n+p.amount,0);
  return e.status==='paid'&&inPeriod(e.date,start,end)?e.amount:0;
}
export function expenseTotals(rows:Expense[],start?:string,end?:string){
  const period=rows.filter(e=>inPeriod(e.date,start,end));
  const spent=period.filter(isApproved).reduce((n,e)=>n+e.amount,0);
  const committed=period.filter(isReserved).reduce((n,e)=>n+e.amount,0);
  const paid=rows.reduce((n,e)=>n+expensePaid(e,start,end),0);
  const through=rows.filter(e=>!end||e.date<=end);
  const approvedThrough=through.filter(isApproved).reduce((n,e)=>n+e.amount,0);
  const reservedThrough=through.filter(isReserved).reduce((n,e)=>n+e.amount,0);
  return {spent,committed,paid,approvedThrough,reservedThrough,unpaid:approvedThrough-rows.reduce((n,e)=>n+expensePaid(e,undefined,end),0)};
}
export function financeSnapshot(s:Workspace,projectIds:string[],start:string,end:string):FinanceSnapshot {
  const ids=new Set(projectIds);
  return {start,end,expenses:s.expenses.filter(e=>e.orgId===s.organization.id&&ids.has(e.projectId)&&(inPeriod(e.date,start,end)||expensePaid(e,start,end)>0||(isApproved(e)&&e.date<=end&&e.amount>expensePaid(e,undefined,end)))).map(e=>{
    const line=s.budgetLines?.find(l=>l.id===e.budgetLineId&&l.projectId===e.projectId);
    return {...structuredClone(e),projectName:s.projects.find(p=>p.id===e.projectId)?.name??'',ownerName:s.members.find(m=>m.id===e.ownerId)?.name??'이전 구성원',budgetLineName:line?.name??'미분류',fundingSource:line?.fundingSource??'',periodSpent:isApproved(e)&&inPeriod(e.date,start,end)?e.amount:0,periodPaid:expensePaid(e,start,end),outstanding:isApproved(e)&&e.date<=end?e.amount-expensePaid(e,undefined,end):0};
  })};
}
