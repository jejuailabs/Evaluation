import type { Command, Workspace } from '../src/domain/types';
export type Role = 'owner'|'admin'|'member'|'viewer';
export type Actor = { userId:string; memberId:string; role:Role; projects:string[] };
export const isManager=(role:string)=>role==='owner'||role==='admin';
export class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
export function requireManager(actor:Actor){if(!isManager(actor.role))throw new HttpError(403,'조직 관리자만 사용할 수 있어요.');}
export function projectAccess(actor:Actor,projectId:string){if(!isManager(actor.role)&&!actor.projects.includes(projectId))throw new HttpError(403,'참여한 프로젝트만 열 수 있어요.');}
export function commandProject(c:Command):string {if(c.type==='report.workflow'||c.type.startsWith('annual.')||(c.type.startsWith('intake.')&&c.type!=='intake.assign'))return '';if('projectId' in c)return c.projectId;for(const key of ['project','task','document','expense','indicator','measurement','activity','line','series'] as const)if(key in c){const row=(c as any)[key];return key==='project'?row.id:row.projectId;}throw new HttpError(400,'지원하지 않는 변경이에요.');}
export function authorizeCommand(actor:Actor,c:Command,s:Workspace){
  if(actor.role==='viewer')throw new HttpError(403,'읽기 전용 구성원은 내용을 변경할 수 없어요.');
  if(c.type==='report.workflow'){
    const report=(c.kind==='annual'?s.annualReports??[]:s.reports).find(r=>r.id===c.reportId&&r.orgId===s.organization.id);
    if(!report)throw new HttpError(404,'보고서를 찾지 못했어요.');
    if('projectId' in report)projectAccess(actor,report.projectId);else requireManager(actor);
    if(['approve','return','submit','void','revoke'].includes(c.operation.action))requireManager(actor);
    else if(!isManager(actor.role)&&report.createdById!==actor.memberId)throw new HttpError(403,'본인이 만든 보고서만 검토 요청하거나 수정본을 만들 수 있어요.');
    return;
  }
  if(c.type.startsWith('annual.')){requireManager(actor);return;}
  if(c.type.startsWith('intake.')){
    if(c.type==='intake.add')return;
    if('id' in c){
      const item=s.intakeItems?.find(i=>i.id===c.id);if(!item)throw new HttpError(404,'자료를 찾지 못했어요.');
      if(!isManager(actor.role)&&item.createdById!==actor.memberId)throw new HttpError(403,'본인이 올린 자료만 분류할 수 있어요.');
      if(item.projectId)projectAccess(actor,item.projectId);
      if(c.type!=='intake.assign')return;
    }
  }
  if(c.type.startsWith('task.series.'))requireManager(actor);
  const pid=commandProject(c);
  if(c.type==='project.add')requireManager(actor);else {if(!s.projects.some(p=>p.id===pid&&p.orgId===s.organization.id))throw new HttpError(404,'프로젝트를 찾지 못했어요.');projectAccess(actor,pid);}
  if(['project.update','indicator.add','indicator.revise','measurement.confirm','measurement.reject','expense.status','budget.line.save','expense.review','expense.pay','expense.payment.void'].includes(c.type))requireManager(actor);
  if(c.type==='expense.add'&&!isManager(actor.role)&&(c.expense.ownerId!==actor.memberId||c.expense.status!=='planned'))throw new HttpError(403,'본인 담당의 예정 집행만 등록할 수 있어요.');
  if(['expense.evidence','expense.update','expense.submit','expense.cancel'].includes(c.type)&&'expenseId' in c&&!isManager(actor.role)){
    const expense=s.expenses.find(e=>e.id===c.expenseId&&e.projectId===pid);
    if(expense?.ownerId!==actor.memberId)throw new HttpError(403,'본인 담당의 집행만 변경할 수 있어요.');
    if(c.type==='expense.cancel'&&!['planned','submitted','returned'].includes(expense.status))throw new HttpError(403,'승인한 집행의 취소는 조직 관리자만 할 수 있어요.');
    if(c.type==='expense.update'&&c.fields.ownerId!==actor.memberId)throw new HttpError(403,'담당자 변경은 조직 관리자에게 요청해 주세요.');
  }
}
export function visibleWorkspace(s:Workspace,actor:Actor):Workspace {
  if(isManager(actor.role))return s;
  const allowed=new Set(actor.projects);const copy=structuredClone(s);
  copy.projects=copy.projects.filter(p=>allowed.has(p.id));
  for(const key of ['tasks','documents','expenses','indicators','measurements','reports','events'] as const)(copy[key] as any)=copy[key].filter(row=>allowed.has(row.projectId));
  copy.taskSeries=(copy.taskSeries??[]).filter(t=>allowed.has(t.projectId));
  copy.intakeItems=(copy.intakeItems??[]).filter(i=>i.projectId?allowed.has(i.projectId):i.createdById===actor.memberId);
  copy.activities=(copy.activities??[]).filter(a=>allowed.has(a.projectId));
  copy.budgetLines=(copy.budgetLines??[]).filter(l=>allowed.has(l.projectId));
  // Annual management contains organization-wide budgets and cross-project evidence.
  copy.annualAllocations=[];copy.annualPlans=[];copy.annualGoals=[];copy.annualReports=[];
  return copy;
}
