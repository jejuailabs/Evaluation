import {z} from 'zod';
import type {Workspace} from '../src/domain/types';
import type {Database} from './database';
import {HttpError,type Actor,isManager} from './policy';
import {workspaceMetadata,workspaceWrites} from './workspace-store';
const schema=z.object({id:z.string().uuid(),revision:z.number().int(),from:z.string(),to:z.string(),deactivate:z.boolean(),transferOwnership:z.boolean(),reason:z.string().trim().min(1).max(500)}).strict();
export async function handover(db:Database,state:Workspace,actor:Actor,storageVersion:number,legacy:string,raw:unknown){
 const input=schema.parse(raw),orgId=state.organization.id;
 if(!isManager(actor.role))throw new HttpError(403,'조직 관리자만 인수인계를 처리할 수 있어요.');
 const receipt=await db.prepare('SELECT org_id,actor_id,request_hash FROM operations WHERE id=?').bind(input.id).first<{org_id:string;actor_id:string;request_hash:string}>();
 if(receipt){if(receipt.org_id===orgId&&receipt.actor_id===actor.userId&&receipt.request_hash===JSON.stringify(input))return {ok:true};throw new HttpError(409,'같은 요청 번호의 내용이 달라요.');}
 if(input.revision!==state.revision)throw new HttpError(409,'최신 구성원 상태를 불러와 주세요.');
 const members=(await db.prepare('SELECT id,role,active FROM memberships WHERE org_id=?').bind(orgId).all<{id:string;role:string;active:number}>()).results;
 const from=members.find(m=>m.id===input.from),to=members.find(m=>m.id===input.to);
 if(!from?.active||!to?.active||to.role==='viewer'||from.id===to.id)throw new HttpError(400,'서로 다른 활성 구성원과 작성 가능한 인수자를 선택해 주세요.');
 if((from.role==='owner'||from.role==='admin')&&actor.role!=='owner')throw new HttpError(403,'대표·관리자의 인수인계는 대표만 처리할 수 있어요.');
 if(input.transferOwnership&&(from.id!==actor.memberId||actor.role!=='owner'))throw new HttpError(403,'현재 대표만 본인의 대표 권한을 이전할 수 있어요.');
 if(from.role==='owner'&&input.deactivate&&!input.transferOwnership)throw new HttpError(400,'대표 권한을 함께 이전해야 이용을 중지할 수 있어요.');
 const next=structuredClone(state),projects=new Set<string>();
 for(const p of next.projects)if(p.ownerId===from.id&&!['completed','archived'].includes(p.status??'')){p.ownerId=to.id;projects.add(p.id);}
 for(const t of next.tasks)if(t.ownerId===from.id&&t.status!=='done'&&!t.cancelled){t.ownerId=to.id;projects.add(t.projectId);}
 for(const t of next.taskSeries??[])if(t.ownerId===from.id&&t.status==='active'){t.ownerId=to.id;projects.add(t.projectId);}
 for(const e of next.expenses){
  if(e.ownerId===from.id&&!['paid','cancelled'].includes(e.status)){e.ownerId=to.id;projects.add(e.projectId);}
  if(e.status==='submitted'&&e.approvalRoute?.slice(e.approvals?.length??0).includes(from.id))throw new HttpError(400,'인계자의 결재 대기 요청을 승인·반려한 뒤 인수인계해 주세요.');
 }
 if(next.organization.approvalPolicy?.approverIds.includes(from.id)){
  if(!isManager(to.role)&&!input.transferOwnership)throw new HttpError(400,'결재선에 포함된 구성원은 관리자에게 인계하거나 결재선을 먼저 수정해 주세요.');
  next.organization.approvalPolicy.approverIds=[...new Set(next.organization.approvalPolicy.approverIds.map(id=>id===from.id?to.id:id))];
 }
 for(const team of next.organization.teams??[])if(team.memberIds.includes(from.id))team.memberIds=[...new Set([...team.memberIds.filter(id=>id!==from.id),to.id])];
 const now=new Date().toISOString(),token=crypto.randomUUID();next.revision++;
 next.events.unshift({id:crypto.randomUUID(),projectId:'',at:now,action:`인수인계 · ${state.members.find(m=>m.id===from.id)?.name} → ${state.members.find(m=>m.id===to.id)?.name} · ${input.reason}`});
 const gate="current_setting('value_lens.command_token',true)=?";
 const statements=[
  db.prepare("UPDATE organizations SET body=?,storage_version=2,revision=revision+1 WHERE id=? AND revision=? AND status='active'").bind(JSON.stringify(workspaceMetadata(next)),orgId,state.revision),
  db.prepare("INSERT INTO operations(id,org_id,actor_id,action,request_hash,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0 RETURNING set_config('value_lens.command_token',?,true)").bind(input.id,orgId,actor.userId,'organization.handover',JSON.stringify(input),now,token),
  ...workspaceWrites(db,orgId,state,next,storageVersion,input.id,legacy,token),
  db.prepare(`INSERT INTO project_members(org_id,project_id,member_id) SELECT org_id,project_id,? FROM project_members WHERE org_id=? AND member_id=? AND ${gate} ON CONFLICT DO NOTHING`).bind(to.id,orgId,from.id,token),
  ...[...projects].map(id=>db.prepare(`INSERT INTO project_members(org_id,project_id,member_id) SELECT ?,?,? WHERE ${gate} ON CONFLICT DO NOTHING`).bind(orgId,id,to.id,token)),
 ];
 if(input.transferOwnership){statements.push(db.prepare(`UPDATE memberships SET role='owner' WHERE org_id=? AND id=? AND ${gate}`).bind(orgId,to.id,token),db.prepare(`UPDATE memberships SET role='admin' WHERE org_id=? AND id=? AND ${gate}`).bind(orgId,from.id,token));}
 if(input.deactivate)statements.push(db.prepare(`UPDATE memberships SET active=0 WHERE org_id=? AND id=? AND ${gate}`).bind(orgId,from.id,token),db.prepare(`DELETE FROM project_members WHERE org_id=? AND member_id=? AND ${gate}`).bind(orgId,from.id,token));
 const [saved]=await db.batch(statements);if(!saved.meta.changes)throw new HttpError(409,'조직이 변경됐어요. 최신 상태에서 다시 처리해 주세요.');
 return {ok:true};
}
export function hasResponsibilities(s:Workspace,id:string){return s.projects.some(p=>p.ownerId===id&&!['completed','archived'].includes(p.status??''))||s.tasks.some(t=>t.ownerId===id&&t.status!=='done'&&!t.cancelled)||s.taskSeries?.some(t=>t.ownerId===id&&t.status==='active')||s.expenses.some(e=>(e.ownerId===id&&!['paid','cancelled'].includes(e.status))||(e.status==='submitted'&&e.approvalRoute?.slice(e.approvals?.length??0).includes(id)))||s.organization.approvalPolicy?.approverIds.includes(id);}
