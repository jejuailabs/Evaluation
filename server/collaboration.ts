import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Command,Workspace} from '../src/domain/types';
import type {DiscussionTarget,DiscussionPage,NotificationPage,OrganizationChanges,TargetType} from '../src/domain/collaboration';
import type {Database,Statement} from './database';
import {HttpError,isManager,projectAccess,type Actor} from './policy';

type Context={db:Database;orgId:string;revision:number;state:Workspace;actor:Actor};
const id=z.string().min(1).max(100), kind=z.enum(['project','task','activity','document','measurement','expense']);
const targetSchema=z.object({projectId:id,type:kind,id}).strict();
const commentSchema=z.object({id:z.string().uuid(),target:targetSchema,body:z.string().trim().min(1).max(3000),mentions:z.array(id).max(10)}).strict();
const editSchema=z.object({version:z.number().int().positive(),body:z.string().trim().min(1).max(3000),mentions:z.array(id).max(10)}).strict();
const now=()=>new Date().toISOString();
const uuid=()=>crypto.randomUUID();
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const cursor=(value:string|null)=>value===null?Number.MAX_SAFE_INTEGER:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(value);
function target(ctx:Context,t:DiscussionTarget,write=false){
 projectAccess(ctx.actor,t.projectId);const p=ctx.state.projects.find(p=>p.id===t.projectId&&p.orgId===ctx.orgId);
 if(!p)throw new HttpError(404,'프로젝트를 찾지 못했어요.');
 if(write&&(ctx.actor.role==='viewer'||p.status==='archived'))throw new HttpError(403,'읽기 전용이거나 보관된 프로젝트예요.');
 const row=t.type==='project'?(t.id===p.id?p:null):t.type==='task'?ctx.state.tasks.find(x=>x.id===t.id&&x.projectId===p.id):t.type==='activity'?ctx.state.activities?.find(x=>x.id===t.id&&x.projectId===p.id):t.type==='document'?ctx.state.documents.find(x=>x.id===t.id&&x.projectId===p.id):t.type==='measurement'?ctx.state.measurements.find(x=>x.id===t.id&&x.projectId===p.id):ctx.state.expenses.find(x=>x.id===t.id&&x.projectId===p.id);
 if(!row)throw new HttpError(404,'댓글을 연결할 항목을 찾지 못했어요.');
 const name=t.type==='measurement'?ctx.state.indicators.find(i=>i.id===(row as any).indicatorId)?.name:'title' in row?row.title:'name' in row?row.name:p.name;
 return {name:String(name??'실적'),project:p};
}
// All notification reads (including counts and read acknowledgments) recheck project access.
const visibleNotification="(m.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM project_members p WHERE p.org_id=n.org_id AND p.project_id=n.project_id AND p.member_id=m.id))";
export async function organizationChanges(db:Database,orgId:string,userId:string):Promise<OrganizationChanges>{
 const row=await db.prepare(`SELECT o.revision,o.status,m.role,
 (SELECT COUNT(*) FROM notifications n WHERE n.org_id=o.id AND n.recipient_id=m.id AND n.read_at IS NULL AND ${visibleNotification}) AS unread,
 (SELECT COALESCE(MAX(n.seq),0) FROM notifications n WHERE n.org_id=o.id AND n.recipient_id=m.id AND ${visibleNotification}) AS latest
 FROM organizations o JOIN memberships m ON m.org_id=o.id WHERE o.id=? AND m.user_id=? AND m.active=1`).bind(orgId,userId).first<any>();
 if(!row||row.status!=='active')throw new HttpError(403,'조직 접근 권한이 변경됐어요.');
 return {revision:Number(row.revision),role:row.role,unread:Number(row.unread),latestNotification:Number(row.latest)};
}
type Recipient={members?:string[];managers?:boolean;thread?:DiscussionTarget};
function notifyStatement(ctx:Context,eventId:string,t:DiscussionTarget,title:string,notificationKind:string,recipients:Recipient,gate:string,gateValues:unknown[]):Statement{
 const members=[...new Set(recipients.members??[])], clauses:string[]=[], values:unknown[]=[];
 if(members.length){clauses.push(`m.id IN (${members.map(()=>'?').join(',')})`);values.push(...members);}
 if(recipients.managers)clauses.push("m.role IN ('owner','admin')");
 if(recipients.thread){clauses.push('EXISTS(SELECT 1 FROM project_comments c WHERE c.org_id=m.org_id AND c.author_id=m.user_id AND c.project_id=? AND c.target_type=? AND c.target_id=? AND c.deleted_at IS NULL)');values.push(t.projectId,t.type,t.id);}
 return ctx.db.prepare(`INSERT INTO notifications(id,org_id,project_id,recipient_id,event_id,kind,title,target_type,target_id,created_at)
 SELECT ? || ':' || m.id,m.org_id,?,m.id,?,?,?,?,?,? FROM memberships m
 WHERE m.org_id=? AND m.active=1 AND m.user_id<>? AND (${clauses.join(' OR ')||'false'})
 AND (m.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM project_members p WHERE p.org_id=m.org_id AND p.member_id=m.id AND p.project_id=?))
 AND ${gate} ON CONFLICT(event_id,recipient_id,kind) DO NOTHING`).bind(uuid(),t.projectId,eventId,notificationKind,title.slice(0,240),t.type,t.id,now(),ctx.orgId,ctx.actor.userId,...values,t.projectId,...gateValues);
}
const orgGate="EXISTS(SELECT 1 FROM organizations o WHERE o.id=? AND o.revision=? AND o.status='active')";
async function participants(ctx:Context,pid:string){return (await ctx.db.prepare("SELECT m.id,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=? AND m.active=1 AND (m.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM project_members p WHERE p.org_id=m.org_id AND p.member_id=m.id AND p.project_id=?)) ORDER BY u.name,m.id LIMIT 501").bind(ctx.orgId,pid).all<{id:string;name:string}>()).results;}
function checkMentions(mentions:string[],people:{id:string}[]){if(mentions.some(m=>!people.some(p=>p.id===m)))throw new HttpError(400,'이 프로젝트에 참여한 구성원만 지정할 수 있어요.');}
async function listComments(ctx:Context,t:DiscussionTarget,before:number):Promise<DiscussionPage>{
 const resolved=target(ctx,t),people=await participants(ctx,t.projectId);
 const rows=(await ctx.db.prepare('SELECT c.*,u.name AS author_name FROM project_comments c JOIN users u ON u.id=c.author_id WHERE c.org_id=? AND c.project_id=? AND c.target_type=? AND c.target_id=? AND c.seq<? ORDER BY c.seq DESC LIMIT 51').bind(ctx.orgId,t.projectId,t.type,t.id,before).all<any>()).results;
 const selected=rows.slice(0,50);return {targetName:resolved.name,participants:people.slice(0,500),canPost:ctx.actor.role!=='viewer'&&resolved.project.status!=='archived',nextCursor:rows.length>50?Number(selected.at(-1)!.seq):null,comments:selected.reverse().map(c=>({id:c.id,seq:Number(c.seq),authorId:c.author_id,authorName:c.author_name,body:c.body,mentions:c.mentions,version:c.version,createdAt:c.created_at,updatedAt:c.updated_at,deletedAt:c.deleted_at,edits:c.edits,canEdit:!c.deleted_at&&c.author_id===ctx.actor.userId&&ctx.actor.role!=='viewer'&&resolved.project.status!=='archived',canDelete:!c.deleted_at&&(c.author_id===ctx.actor.userId||isManager(ctx.actor.role))&&ctx.actor.role!=='viewer'&&resolved.project.status!=='archived'}))};
}
export async function discussions(ctx:Context,method:string,url:URL,input?:unknown,commentId?:string):Promise<DiscussionPage|{ok:true}>{
 if(method==='GET')return listComments(ctx,targetSchema.parse({projectId:url.searchParams.get('project'),type:url.searchParams.get('type'),id:url.searchParams.get('target')}),cursor(url.searchParams.get('before')));
 if(method==='POST'&&!commentId){
  const c=commentSchema.parse(input),resolved=target(ctx,c.target,true),people=await participants(ctx,c.target.projectId);c.mentions=[...new Set(c.mentions)].sort();checkMentions(c.mentions,people);
  const digest=hash(c),existing=await ctx.db.prepare('SELECT org_id,author_id,request_hash FROM project_comments WHERE id=?').bind(c.id).first<any>();
  if(existing){if(existing.org_id!==ctx.orgId||existing.author_id!==ctx.actor.userId||existing.request_hash!==digest)throw new HttpError(409,'같은 요청 번호로 다른 댓글을 저장할 수 없어요.');return {ok:true};}
  const created=now(),since=new Date(Date.now()-60000).toISOString();
  const statement=ctx.db.prepare(`INSERT INTO project_comments(id,org_id,project_id,target_type,target_id,author_id,body,mentions,request_hash,created_at)
   SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${orgGate} AND (SELECT COUNT(*) FROM project_comments WHERE org_id=? AND author_id=? AND created_at>=?)<20 ON CONFLICT(id) DO NOTHING`).bind(c.id,ctx.orgId,c.target.projectId,c.target.type,c.target.id,ctx.actor.userId,c.body,c.mentions,digest,created,ctx.orgId,ctx.revision,ctx.orgId,ctx.actor.userId,since);
  const notification=notifyStatement(ctx,c.id,c.target,`${resolved.name}에 새 댓글이 있어요.`,'comment',{members:[...c.mentions,resolved.project.ownerId],thread:c.target},'EXISTS(SELECT 1 FROM project_comments WHERE id=? AND org_id=? AND author_id=? AND request_hash=?)',[c.id,ctx.orgId,ctx.actor.userId,digest]);
  const [saved]=await ctx.db.batch([statement,notification]);
  if(!saved.meta.changes){const retry=await ctx.db.prepare('SELECT request_hash,author_id FROM project_comments WHERE id=? AND org_id=?').bind(c.id,ctx.orgId).first<any>();if(retry?.request_hash===digest&&retry.author_id===ctx.actor.userId)return {ok:true};const current=await ctx.db.prepare('SELECT revision FROM organizations WHERE id=?').bind(ctx.orgId).first<{revision:number}>();if(retry||current?.revision!==ctx.revision)throw new HttpError(409,'조직이나 같은 요청의 댓글이 바뀌었어요. 입력은 유지하고 다시 불러와 주세요.');throw new HttpError(429,'댓글은 1분에 20개까지 남길 수 있어요. 잠시 후 다시 시도해 주세요.');}
  return {ok:true};
 }
 if((method==='PATCH'||method==='DELETE')&&commentId){
  const c=await ctx.db.prepare('SELECT * FROM project_comments WHERE id=? AND org_id=?').bind(commentId,ctx.orgId).first<any>();
  if(!c)throw new HttpError(404,'댓글을 찾지 못했어요.');const t:DiscussionTarget={projectId:c.project_id,type:c.target_type,id:c.target_id},resolved=target(ctx,t,true);
  if(c.author_id!==ctx.actor.userId&&(method!=='DELETE'||!isManager(ctx.actor.role)))throw new HttpError(403,'다른 사람이 작성한 댓글은 수정할 수 없어요.');
  if(method==='DELETE'&&c.deleted_at)return {ok:true};
  if(c.deleted_at)throw new HttpError(410,'삭제한 댓글이에요.');
  const data=method==='PATCH'?editSchema.parse(input):z.object({version:z.number().int().positive()}).strict().parse(input);
  if(data.version!==c.version)throw new HttpError(409,'다른 탭에서 댓글을 변경했어요. 최신 댓글을 확인해 주세요.');
  const statements:Statement[]=[],time=now();
  if(method==='PATCH'){
   const edit=editSchema.parse(input);
   if(c.version>=26)throw new HttpError(400,'이 댓글의 수정 이력이 많아요. 새 댓글로 이어서 남겨 주세요.');
   checkMentions(edit.mentions,await participants(ctx,t.projectId));
   const edits=[...c.edits,{body:c.body,at:c.updated_at??c.created_at}];
   statements.push(ctx.db.prepare(`UPDATE project_comments SET body=?,mentions=?,edits=CAST(? AS jsonb),version=version+1,updated_at=? WHERE id=? AND org_id=? AND version=? AND ${orgGate}`).bind(edit.body,[...new Set(edit.mentions)],JSON.stringify(edits),time,c.id,ctx.orgId,data.version,ctx.orgId,ctx.revision));
   statements.push(notifyStatement(ctx,`${c.id}:edit:${data.version+1}`,t,`${resolved.name}의 댓글에서 확인을 요청했어요.`,'mention',{members:edit.mentions.filter(m=>!c.mentions.includes(m))},'EXISTS(SELECT 1 FROM project_comments WHERE id=? AND org_id=? AND version=? AND updated_at=?)',[c.id,ctx.orgId,data.version+1,time]));
  }else statements.push(ctx.db.prepare(`UPDATE project_comments SET body='',mentions='{}',edits='[]',version=version+1,deleted_at=?,deleted_by=? WHERE id=? AND org_id=? AND version=? AND ${orgGate}`).bind(time,ctx.actor.userId,c.id,ctx.orgId,data.version,ctx.orgId,ctx.revision));
  const [saved]=await ctx.db.batch(statements);if(!saved.meta.changes)throw new HttpError(409,'조직 권한이나 댓글이 바뀌었어요. 새로 불러와 주세요.');return {ok:true};
 }
 throw new HttpError(405,'지원하지 않는 요청이에요.');
}
export async function notifications(ctx:Context,method:string,url:URL,input?:unknown):Promise<NotificationPage|{ok:true}>{
 if(method==='POST'){
  const {ids}=z.object({ids:z.array(id).min(1).max(50)}).strict().parse(input);
  await ctx.db.prepare(`UPDATE notifications n SET read_at=? FROM memberships m WHERE n.org_id=? AND n.recipient_id=m.id AND m.user_id=? AND m.active=1 AND n.read_at IS NULL AND n.id IN (${ids.map(()=>'?').join(',')}) AND ${visibleNotification} AND ${orgGate}`).bind(now(),ctx.orgId,ctx.actor.userId,...ids,ctx.orgId,ctx.revision).run();return {ok:true};
 }
 if(method!=='GET')throw new HttpError(405,'지원하지 않는 요청이에요.');
 const before=cursor(url.searchParams.get('before'));
 const [rows,count]=await ctx.db.batch([
  ctx.db.prepare(`SELECT n.* FROM notifications n JOIN memberships m ON m.id=n.recipient_id AND m.org_id=n.org_id WHERE n.org_id=? AND m.user_id=? AND m.active=1 AND ${visibleNotification} AND n.seq<? ORDER BY n.seq DESC LIMIT 51`).bind(ctx.orgId,ctx.actor.userId,before),
  ctx.db.prepare(`SELECT COUNT(*) AS n FROM notifications n JOIN memberships m ON m.id=n.recipient_id AND m.org_id=n.org_id WHERE n.org_id=? AND m.user_id=? AND m.active=1 AND n.read_at IS NULL AND ${visibleNotification}`).bind(ctx.orgId,ctx.actor.userId),
 ]);
 const selected=rows.results.slice(0,50) as any[];return {items:selected.map(n=>({id:n.id,seq:Number(n.seq),title:n.title,kind:n.kind,createdAt:n.created_at,readAt:n.read_at,target:{projectId:n.project_id,type:n.target_type,id:n.target_id}})),unread:Number(count.results[0]?.n??0),nextCursor:rows.results.length>50?Number(selected.at(-1)!.seq):null};
}
export function workflowNotifications(ctx:Context,command:Command,next:Workspace,eventId:string,writeToken:string):Statement[]{
 let t:DiscussionTarget|undefined,title='',recipients:Recipient={};const actor=ctx.actor.memberId;
 if(command.type==='report.workflow'&&command.kind==='project'){
  const r=next.reports.find(r=>r.id===command.reportId)!;
  if(['request','approve','return','revoke','submit'].includes(command.operation.action)){
   t={projectId:r.projectId,type:'project',id:r.id};title=r.title+' · '+({'request':'보고서 검토 요청','approve':'보고서 내부 승인','return':'보고서 보완 요청','revoke':'보고서 승인 철회','submit':'보고서 제출 기록'} as Record<string,string>)[command.operation.action];
   recipients=command.operation.action==='request'?{managers:true}:{members:[r.createdById??next.projects.find(p=>p.id===r.projectId)!.ownerId]};
  }
 }else if(command.type==='task.add'||command.type==='task.update'){
  const task=command.task,old=ctx.state.tasks.find(x=>x.id===task.id);
  if(!old||old.ownerId!==task.ownerId||old.due!==task.due){t={projectId:task.projectId,type:'task',id:task.id};title=`${task.title} · 담당 업무${old?'가 변경됐어요.':'가 배정됐어요.'}`;recipients={members:[task.ownerId]};}
 }else if(command.type==='task.series.create'||command.type==='task.series.update'||command.type==='task.series.stop'){
  const id=command.type==='task.series.create'?command.series.id:command.seriesId,series=next.taskSeries!.find(x=>x.id===id)!;
  t={projectId:series.projectId,type:'project',id:series.projectId};title=`${series.title} · 반복 일정이 ${command.type==='task.series.create'?'배정':command.type==='task.series.stop'?'중단':'변경'}됐어요.`;
  recipients={members:[series.ownerId,ctx.state.taskSeries?.find(x=>x.id===id)?.ownerId??series.ownerId]};
 }else if(command.type==='measurement.add'){
  const m=command.measurement;t={projectId:m.projectId,type:'measurement',id:m.id};title=`${next.indicators.find(i=>i.id===m.indicatorId)?.name??'실적'} · 확인할 실적이 올라왔어요.`;recipients={managers:true};
 }else if(command.type==='measurement.confirm'||command.type==='measurement.reject'){
  const m=next.measurements.find(m=>m.id===command.measurementId)!;t={projectId:m.projectId,type:'measurement',id:m.id};title=`${next.indicators.find(i=>i.id===m.indicatorId)?.name??'실적'} · ${command.type==='measurement.reject'?'보완을 요청했어요.':'실적을 확인했어요.'}`;recipients={members:[m.createdById??next.projects.find(p=>p.id===m.projectId)!.ownerId]};
 }else if(['expense.submit','expense.review','expense.pay','expense.cancel'].includes(command.type)&&'expenseId' in command){
  const e=next.expenses.find(e=>e.id===command.expenseId)!;t={projectId:e.projectId,type:'expense',id:e.id};
  title=`${e.title} · ${command.type==='expense.submit'?'집행 검토를 요청했어요.':command.type==='expense.pay'?'지급을 기록했어요.':command.type==='expense.cancel'?'집행을 취소했어요.':e.status==='returned'?'보완을 요청했어요.':'집행을 승인했어요.'}`;
  recipients=command.type==='expense.submit'?{managers:true}:{members:[e.ownerId]};
 }else if(command.type==='task.status'&&command.status==='done'){
  const task=next.tasks.find(t=>t.id===command.taskId)!;t={projectId:task.projectId,type:'task',id:task.id};title=`${task.title} · 업무를 완료했어요.`;recipients={members:[next.projects.find(p=>p.id===task.projectId)!.ownerId,task.ownerId].filter(id=>id!==actor)};
 }
 return t?[notifyStatement(ctx,eventId,t,title,command.type,recipients,"EXISTS(SELECT 1 FROM operations WHERE id=? AND org_id=? AND actor_id=?) AND current_setting('value_lens.command_token',true)=?",[eventId,ctx.orgId,ctx.actor.userId,writeToken])]:[];
}
