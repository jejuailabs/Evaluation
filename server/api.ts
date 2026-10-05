import { z } from 'zod';
import { execute } from '../src/domain/commands';
import type { Command, Workspace, DocumentVersion } from '../src/domain/types';
import { createEmptyWorkspace } from '../src/domain/workspace';
import { authorizeCommand, commandProject, HttpError, isManager, projectAccess, requireManager, visibleWorkspace, type Actor, type Role } from './policy';
import { envelopeSchema } from './commands-schema';

export type Identity={userId:string;email:string;displayName:string};
export type Services={DB:D1Database;BUCKET?:R2Bucket;PLATFORM_ADMIN_USER_IDS?:string};
type Org={id:string;name:string;status:string;revision:number;body:string;member_id:string;role:Role};
const timestamp=()=>new Date().toISOString();
const uuid=()=>crypto.randomUUID();
const roles={owner:'조직 대표',admin:'조직 관리자',member:'조직원',viewer:'읽기 전용'};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const orgName=z.string().trim().min(1).max(80);
const inviteSchema=z.object({email:z.string().trim().email().max(254),role:z.enum(['admin','member','viewer'])}).strict();
const roleSchema=z.object({role:z.enum(['admin','member','viewer']),active:z.boolean()}).strict();
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
async function body(req:Request){if(Number(req.headers.get('Content-Length')??0)>1500000)throw new HttpError(413,'요청이 너무 커요.');const raw=await req.text();if(raw.length>1500000)throw new HttpError(413,'요청이 너무 커요.');try{return JSON.parse(raw);}catch{throw new HttpError(400,'입력 형식을 확인해 주세요.');}}
export async function handleApi(req:Request, env:Services, identity:Identity|null):Promise<Response>{
 try{return await dispatch(req,env,identity);}catch(e){
  if(e instanceof HttpError)return json({error:e.message},e.status);
  if(e instanceof z.ZodError)return json({error:'입력값의 형식이나 길이를 확인해 주세요.'},400);
  console.error('Value Lens API failure',e instanceof Error?e.message:'unknown');
  return json({error:'처리하지 못했어요. 입력을 유지한 채 다시 시도해 주세요.'},500);
 }
}
async function dispatch(req:Request, env:Services, identity:Identity|null):Promise<Response>{
 const url=new URL(req.url), parts=url.pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean), method=req.method;
 if(method!=='GET'){
  if(req.headers.get('Origin')!==url.origin||req.headers.get('X-Value-Lens')!=='1')throw new HttpError(403,'이 작업실에서 다시 시도해 주세요.');
 }
 const platform=!!identity&&(env.PLATFORM_ADMIN_USER_IDS??'').split(',').map(x=>x.trim()).filter(Boolean).includes(identity.userId);
 if(parts[0]==='session'&&method==='GET'&&!identity)return json({user:null,organizations:[],platformAdmin:false});
 if(!identity)throw new HttpError(401,'로그인이 필요해요.');
 const user={...identity,email:identity.email.trim().toLowerCase()}, db=env.DB;
 await db.prepare('INSERT INTO users (id,email,name,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name').bind(user.userId,user.email,user.displayName.slice(0,120),timestamp()).run();
 const memberships=async()=> (await db.prepare('SELECT o.id,o.name,o.status,m.role FROM organizations o JOIN memberships m ON m.org_id=o.id WHERE m.user_id=? AND m.active=1 ORDER BY o.created_at').bind(user.userId).all()).results;
 async function org(orgId:string){
  const row=await db.prepare('SELECT o.*,m.id AS member_id,m.role FROM organizations o JOIN memberships m ON m.org_id=o.id WHERE o.id=? AND m.user_id=? AND m.active=1').bind(orgId,user.userId).first<Org>();
  if(!row)throw new HttpError(403,'이 조직에 접근할 권한이 없어요.');if(row.status!=='active')throw new HttpError(403,'일시 정지된 조직이에요. 서비스 관리자에게 문의해 주세요.');
  const assignments=(await db.prepare('SELECT project_id FROM project_members WHERE org_id=? AND member_id=?').bind(orgId,row.member_id).all<{project_id:string}>()).results;
  const actor:Actor={userId:user.userId,memberId:row.member_id,role:row.role,projects:assignments.map(p=>p.project_id)};
  const state=JSON.parse(row.body) as Workspace;state.revision=row.revision;state.organization.name=row.name;
  state.members=(await db.prepare('SELECT m.id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=?').bind(orgId).all<{id:string;name:string;role:Role}>()).results.map(m=>({...m,role:roles[m.role]}));
  return {row,actor,state};
 }
 async function result(orgId:string){const ctx=await org(orgId);return {workspace:visibleWorkspace(ctx.state,ctx.actor),access:ctx.actor};}
 function audit(orgId:string,action:string,id=uuid(),requestHash=''){return db.prepare('INSERT INTO operations (id,org_id,actor_id,action,request_hash,created_at) VALUES (?,?,?,?,?,?)').bind(id,orgId,user.userId,action,requestHash,timestamp());}
 // ACL writes bump the same organization revision as project writes, preventing stale authorization snapshots.
 async function adminWrite(ctx:Awaited<ReturnType<typeof org>>,statements:D1PreparedStatement[],action:string){
  const nonce=uuid();
  const gate=db.prepare('INSERT INTO operations (id,org_id,actor_id,action,request_hash,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM organizations WHERE id=? AND revision=? AND status=\'active\')').bind(nonce,ctx.row.id,user.userId,action,'',timestamp(),ctx.row.id,ctx.row.revision);
  // Statements are also guarded by the unchanged revision; D1 batch does not interleave writes.
  const results=await db.batch([gate,...statements.map(s=>s),db.prepare('UPDATE organizations SET revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM operations WHERE id=?)').bind(ctx.row.id,nonce)]);
  if(!results[0].meta.changes)throw new HttpError(409,'다른 사람이 변경했어요. 새로고침 후 다시 시도해 주세요.');
 }
 if(parts[0]==='session'&&method==='GET')return json({user,organizations:await memberships(),platformAdmin:platform});
 if(parts[0]==='organizations'&&parts.length===1&&method==='POST'){
  const input=z.object({name:orgName}).strict().parse(await body(req));
  const count=await db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE user_id=? AND role='owner'").bind(user.userId).first<{n:number}>();if((count?.n??0)>=20)throw new HttpError(429,'만들 수 있는 조직 수를 초과했어요.');
  const state=createEmptyWorkspace(input.name,user.displayName.slice(0,40));const orgId=state.organization.id;state.members[0].role=roles.owner;
  await db.batch([db.prepare('INSERT INTO organizations (id,name,status,revision,body,created_at) VALUES (?,?,\'active\',0,?,?)').bind(orgId,input.name,JSON.stringify(state),timestamp()),db.prepare('INSERT INTO memberships (id,org_id,user_id,role,active) VALUES (?,?,?,\'owner\',1)').bind(state.members[0].id,orgId,user.userId),audit(orgId,'조직 생성')]);
  return json({id:orgId},201);
 }
 if(parts[0]==='invitations'&&parts[1]==='accept'&&method==='POST'){
  const input=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(await body(req));const digest=await hash(input.token);
  const inv=await db.prepare("SELECT i.*,o.status AS org_status FROM invitations i JOIN organizations o ON o.id=i.org_id WHERE i.token_hash=?").bind(digest).first<any>();
  if(!inv||inv.status!=='pending'||inv.expires_at<=timestamp()||inv.org_status!=='active')throw new HttpError(410,'만료되었거나 취소된 초대예요. 새 초대를 요청해 주세요.');
  if(inv.email!==user.email)throw new HttpError(403,'초대받은 이메일의 계정으로 로그인해 주세요.');
  const existing=await db.prepare('SELECT id,active FROM memberships WHERE org_id=? AND user_id=?').bind(inv.org_id,user.userId).first<any>();
  if(existing?.active)throw new HttpError(409,'이미 이 조직의 구성원이에요. 조직 목록에서 열어 주세요.');
  // Eligibility is checked again in the transaction, not just before it.
  const joined=await db.batch([
   db.prepare("INSERT INTO memberships (id,org_id,user_id,role,active) SELECT ?,org_id,?,role,1 FROM invitations WHERE token_hash=? AND status='pending' AND expires_at>? AND email=? AND EXISTS(SELECT 1 FROM organizations WHERE id=invitations.org_id AND status='active') ON CONFLICT(org_id,user_id) DO UPDATE SET role=excluded.role,active=1").bind(existing?.id??uuid(),user.userId,digest,timestamp(),user.email),
   db.prepare("UPDATE invitations SET status='accepted' WHERE token_hash=? AND status='pending' AND changes()>0").bind(digest),
   db.prepare('UPDATE organizations SET revision=revision+1 WHERE id=? AND changes()>0').bind(inv.org_id),
   db.prepare('INSERT INTO operations (id,org_id,actor_id,action,request_hash,created_at) SELECT ?,?,?,?, ?,? WHERE changes()>0').bind(uuid(),inv.org_id,user.userId,'초대 수락','',timestamp())
  ]);if(!joined[0].meta.changes)throw new HttpError(410,'더 이상 사용할 수 없는 초대예요.');return json({id:inv.org_id});
 }
 if(parts[0]==='platform'){
  if(!platform)throw new HttpError(403,'전체 관리자 권한이 필요해요.');
  if(method==='GET'&&parts.length===1){return json({organizations:(await db.prepare('SELECT o.id,o.name,o.status,o.created_at,(SELECT COUNT(*) FROM memberships m WHERE m.org_id=o.id AND m.active=1) AS members,(SELECT COUNT(*) FROM files f WHERE f.org_id=o.id) AS files,(SELECT COALESCE(SUM(size),0) FROM files f WHERE f.org_id=o.id) AS bytes FROM organizations o ORDER BY created_at DESC LIMIT 500').all()).results,audit:(await db.prepare('SELECT * FROM platform_audit ORDER BY created_at DESC LIMIT 100').all()).results});}
  if(method==='POST'&&parts[1]){const input=z.object({status:z.enum(['active','suspended']),reason:z.string().trim().min(3).max(300)}).strict().parse(await body(req));
   const exists=await db.prepare('SELECT id FROM organizations WHERE id=?').bind(parts[1]).first();if(!exists)throw new HttpError(404,'조직이 없어요.');
   await db.batch([db.prepare('UPDATE organizations SET status=?,revision=revision+1 WHERE id=?').bind(input.status,parts[1]),db.prepare('INSERT INTO platform_audit (id,actor_id,org_id,action,reason,created_at) VALUES (?,?,?,?,?,?)').bind(uuid(),user.userId,parts[1],input.status,input.reason,timestamp())]);return json({ok:true});}
 }
 if(parts[0]!=='organizations'||!parts[1])throw new HttpError(404,'주소를 찾지 못했어요.');
 const orgId=parts[1],ctx=await org(orgId),{state,actor,row}=ctx;
 if(parts[2]==='workspace'&&method==='GET')return json(await result(orgId));
 if(parts[2]==='commands'&&method==='POST'){
  const input=envelopeSchema.parse(await body(req));const command=input.command as Command;authorizeCommand(actor,command,state);
  const requestHash=await hash(JSON.stringify(input.command));
  const previous=await db.prepare('SELECT org_id,actor_id,request_hash FROM operations WHERE id=?').bind(input.id).first<any>();
  if(previous){if(previous.org_id!==orgId||previous.actor_id!==user.userId||previous.request_hash!==requestHash)throw new HttpError(409,'같은 요청 번호로 다른 변경을 보낼 수 없어요.');return json(await result(orgId));}
  if(input.revision!==row.revision)throw new HttpError(409,'다른 사람이 변경했어요. 새로고침하고 다시 저장해 주세요.');
  const pid=commandProject(command);
  if(command.type==='project.add'||command.type==='task.add'||command.type==='expense.add'){
   const ownerId=command.type==='project.add'?command.project.ownerId:command.type==='task.add'?command.task.ownerId:command.expense.ownerId;
   const member=await db.prepare('SELECT role FROM memberships WHERE id=? AND org_id=? AND active=1').bind(ownerId,orgId).first<{role:Role}>();
   if(!member)throw new HttpError(400,'활성 구성원을 담당자로 선택해 주세요.');
   if(command.type!=='project.add'&&!isManager(member.role)&&!(await db.prepare('SELECT 1 FROM project_members WHERE org_id=? AND project_id=? AND member_id=?').bind(orgId,pid,ownerId).first()))throw new HttpError(400,'이 프로젝트에 참여한 담당자를 선택해 주세요.');
  }
  if(command.type==='document.add'||command.type==='document.version'){
   const v=command.type==='document.add'?command.document.versions[0]:command.version;
   const f=await db.prepare('SELECT * FROM files WHERE id=? AND org_id=? AND project_id=? AND uploader_id=?').bind(v.blobKey,orgId,pid,user.userId).first<any>();
   if(!f||v.id!==f.id)throw new HttpError(400,'이 프로젝트에 업로드한 원본이 필요해요.');
   const canonical:DocumentVersion={id:f.id,blobKey:f.id,name:f.name,size:f.size,createdAt:f.created_at};
   if(state.documents.some(d=>d.versions.some(x=>x.id===f.id)))throw new HttpError(409,'이미 연결한 원본이에요.');
   if(command.type==='document.add')command.document.versions=[canonical];else command.version=canonical;
  }
  if(command.type==='measurement.add')command.measurement.createdAt=timestamp();
  let next:Workspace;try{next=execute(state,command);}catch(e){throw new HttpError(400,(e as Error).message);}
  const encoded=JSON.stringify(next);if(new TextEncoder().encode(encoded).byteLength>1024*1024)throw new HttpError(413,'현재 단계의 조직 저장 한도에 도달했어요.');
  const updates=await db.batch([db.prepare("UPDATE organizations SET body=?,revision=revision+1 WHERE id=? AND revision=? AND status='active'").bind(encoded,orgId,input.revision),db.prepare('INSERT INTO operations (id,org_id,actor_id,action,request_hash,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0').bind(input.id,orgId,user.userId,command.type,requestHash,timestamp())]);
  if(!updates[0].meta.changes)throw new HttpError(409,'다른 사람이 먼저 저장했어요. 새로고침하고 다시 시도해 주세요.');
  return json(await result(orgId));
 }
 if(parts[2]==='files'){
  if(method==='POST'){
   const pid=url.searchParams.get('project')??'';projectAccess(actor,pid);if(actor.role==='viewer')throw new HttpError(403,'읽기 전용 권한이에요.');
   if(!state.projects.some(p=>p.id===pid))throw new HttpError(404,'프로젝트가 없어요.');
   if(!env.BUCKET)throw new HttpError(503,'파일 저장소를 준비 중이에요.');
   const declared=Number(req.headers.get('Content-Length'));if(!Number.isFinite(declared)||declared<1||declared>25*1024*1024)throw new HttpError(413,'파일은 25MB 이내로 올려 주세요.');
   const bytes=await req.arrayBuffer();if(bytes.byteLength!==declared)throw new HttpError(400,'파일 크기가 일치하지 않아요.');
   const filename=decodeURIComponent(req.headers.get('X-File-Name')??'file').replace(/[\x00-\x1f/\\]/g,'_').slice(0,255)||'file';
   const total=await db.prepare('SELECT COALESCE(SUM(size),0) AS n FROM files WHERE org_id=?').bind(orgId).first<{n:number}>();if((total?.n??0)+declared>500*1024*1024)throw new HttpError(413,'조직 파일 저장 한도 500MB에 도달했어요.');
   const id=uuid(),createdAt=timestamp(),key=`${orgId}/${id}`;
   await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
   const fresh=await org(orgId);projectAccess(fresh.actor,pid);if(fresh.actor.role==='viewer')throw new HttpError(403,'업로드 권한이 변경됐어요.');
   const saved=await db.batch([db.prepare("INSERT INTO files (id,org_id,project_id,uploader_id,name,size,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM organizations WHERE id=? AND revision=? AND status='active')").bind(id,orgId,pid,user.userId,filename,declared,createdAt,orgId,fresh.row.revision)]);
   if(!saved[0].meta.changes){await env.BUCKET.delete(key);throw new HttpError(409,'권한이나 조직이 변경됐어요. 다시 시도해 주세요.');}
   return json({id,blobKey:id,name:filename,size:declared,createdAt},201);
  }
  if(method==='GET'&&parts[3]){
   const f=await db.prepare('SELECT * FROM files WHERE id=? AND org_id=?').bind(parts[3],orgId).first<any>();if(!f)throw new HttpError(404,'파일이 없어요.');projectAccess(actor,f.project_id);
   const linked=state.documents.some(d=>d.projectId===f.project_id&&d.versions.some(v=>v.blobKey===f.id));if(!linked&&f.uploader_id!==user.userId)throw new HttpError(403,'아직 등록되지 않은 원본이에요.');
   const object=await env.BUCKET?.get(`${orgId}/${f.id}`);if(!object)throw new HttpError(404,'원본을 찾지 못했어요.');
   return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }
 }
 if(parts[2]==='admin'){
  requireManager(actor);
  if(method==='GET')return json({members:(await db.prepare('SELECT m.id,m.role,m.active,u.name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=?').bind(orgId).all()).results,projects:state.projects.map(p=>({id:p.id,name:p.name})),assignments:(await db.prepare('SELECT project_id,member_id FROM project_members WHERE org_id=?').bind(orgId).all()).results,invitations:(await db.prepare('SELECT id,email,role,status,expires_at FROM invitations WHERE org_id=? ORDER BY created_at DESC LIMIT 100').bind(orgId).all()).results,audit:(await db.prepare('SELECT id,actor_id,action,created_at FROM operations WHERE org_id=? ORDER BY created_at DESC LIMIT 100').bind(orgId).all()).results});
  // Each ACL statement uses the revision guard; D1 batch executes these with no interleaving.
  const guard='EXISTS(SELECT 1 FROM organizations WHERE id=? AND revision=? AND status=\'active\')';
  if(parts[3]==='invitations'&&method==='POST'){
   const input=inviteSchema.parse(await body(req));if(input.role==='admin'&&actor.role!=='owner')throw new HttpError(403,'관리자 초대는 조직 대표만 할 수 있어요.');
   const token=uuid().replaceAll('-','')+uuid().replaceAll('-',''),digest=await hash(token),expiresAt=new Date(Date.now()+7*86400000).toISOString();
   const activeCount=await db.prepare("SELECT COUNT(*) AS n FROM invitations WHERE org_id=? AND status='pending' AND expires_at>?").bind(orgId,timestamp()).first<{n:number}>();if((activeCount?.n??0)>=100)throw new HttpError(429,'사용하지 않은 초대를 먼저 취소해 주세요.');
   await adminWrite(ctx,[db.prepare(`INSERT INTO invitations (id,org_id,email,role,token_hash,status,expires_at,created_by,created_at) SELECT ?,?,?,?,?, 'pending',?,?,? WHERE ${guard}`).bind(uuid(),orgId,input.email.toLowerCase(),input.role,digest,expiresAt,user.userId,timestamp(),orgId,row.revision)],'구성원 초대 생성');
   return json({url:`${url.origin}/?mode=app#/invite/${token}`,expiresAt});
  }
  if(parts[3]==='invitations'&&parts[4]&&method==='DELETE'){
   await adminWrite(ctx,[db.prepare(`UPDATE invitations SET status='revoked' WHERE id=? AND org_id=? AND status='pending' AND ${guard}`).bind(parts[4],orgId,orgId,row.revision)],'초대 취소');return json({ok:true});
  }
  if(parts[3]==='members'&&parts[4]&&method==='POST'){
   const input=roleSchema.parse(await body(req));const target=await db.prepare('SELECT role FROM memberships WHERE id=? AND org_id=?').bind(parts[4],orgId).first<{role:Role}>();
   if(!target)throw new HttpError(404,'구성원을 찾지 못했어요.');if(target.role==='owner')throw new HttpError(403,'조직 대표는 이 화면에서 변경할 수 없어요.');
   if(actor.role!=='owner'&&(target.role==='admin'||input.role==='admin'))throw new HttpError(403,'관리자 권한 변경은 조직 대표만 할 수 있어요.');
   await adminWrite(ctx,[db.prepare(`UPDATE memberships SET role=?,active=? WHERE id=? AND org_id=? AND ${guard}`).bind(input.role,input.active?1:0,parts[4],orgId,orgId,row.revision),db.prepare(`DELETE FROM project_members WHERE member_id=? AND org_id=? AND ?=0 AND ${guard}`).bind(parts[4],orgId,input.active?1:0,orgId,row.revision)],'구성원 역할·이용 상태 변경');return json({ok:true});
  }
  if(parts[3]==='assignments'&&method==='POST'){
   const input=z.object({projectId:z.string(),memberId:z.string(),assigned:z.boolean()}).strict().parse(await body(req));if(!state.projects.some(p=>p.id===input.projectId))throw new HttpError(404,'프로젝트가 없어요.');
   if(!await db.prepare('SELECT id FROM memberships WHERE id=? AND org_id=? AND active=1').bind(input.memberId,orgId).first())throw new HttpError(400,'활성 구성원만 배정할 수 있어요.');
   const q=input.assigned?db.prepare(`INSERT OR IGNORE INTO project_members (org_id,project_id,member_id) SELECT ?,?,? WHERE ${guard}`).bind(orgId,input.projectId,input.memberId,orgId,row.revision):db.prepare(`DELETE FROM project_members WHERE org_id=? AND project_id=? AND member_id=? AND ${guard}`).bind(orgId,input.projectId,input.memberId,orgId,row.revision);
   await adminWrite(ctx,[q],'프로젝트 참여 변경');return json({ok:true});
  }
 }
 throw new HttpError(404,'주소를 찾지 못했어요.');
}
