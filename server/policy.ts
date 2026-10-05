import type { Command, Workspace } from '../src/domain/types';
export type Role = 'owner'|'admin'|'member'|'viewer';
export type Actor = { userId:string; memberId:string; role:Role; projects:string[] };
export const isManager=(role:string)=>role==='owner'||role==='admin';
export class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
export function requireManager(actor:Actor){if(!isManager(actor.role))throw new HttpError(403,'조직 관리자만 사용할 수 있어요.');}
export function projectAccess(actor:Actor,projectId:string){if(!isManager(actor.role)&&!actor.projects.includes(projectId))throw new HttpError(403,'참여한 프로젝트만 열 수 있어요.');}
export function commandProject(c:Command):string {if('projectId' in c)return c.projectId;for(const key of ['project','task','document','expense','indicator','measurement'] as const)if(key in c){const row=(c as any)[key];return key==='project'?row.id:row.projectId;}throw new HttpError(400,'지원하지 않는 변경이에요.');}
export function authorizeCommand(actor:Actor,c:Command,s:Workspace){
  if(actor.role==='viewer')throw new HttpError(403,'읽기 전용 구성원은 내용을 변경할 수 없어요.');
  const pid=commandProject(c);
  if(c.type==='project.add')requireManager(actor);else {if(!s.projects.some(p=>p.id===pid&&p.orgId===s.organization.id))throw new HttpError(404,'프로젝트를 찾지 못했어요.');projectAccess(actor,pid);}
  if(['indicator.add','measurement.confirm','expense.status','report.create'].includes(c.type))requireManager(actor);
  if(c.type==='expense.add'&&!isManager(actor.role)&&(c.expense.ownerId!==actor.memberId||c.expense.status!=='planned'))throw new HttpError(403,'본인 담당의 예정 집행만 등록할 수 있어요.');
  if(c.type==='expense.evidence'&&!isManager(actor.role)&&s.expenses.find(e=>e.id===c.expenseId)?.ownerId!==actor.memberId)throw new HttpError(403,'본인 집행의 증빙만 변경할 수 있어요.');
}
export function visibleWorkspace(s:Workspace,actor:Actor):Workspace {
  if(isManager(actor.role))return s;
  const allowed=new Set(actor.projects);const copy=structuredClone(s);
  copy.projects=copy.projects.filter(p=>allowed.has(p.id));
  for(const key of ['tasks','documents','expenses','indicators','measurements','reports','events'] as const)(copy[key] as any)=copy[key].filter(row=>allowed.has(row.projectId));
  return copy;
}
