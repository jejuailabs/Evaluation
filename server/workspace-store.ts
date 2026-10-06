import {z} from 'zod';
import type {Workspace} from '../src/domain/types';
import {workspaceTables,collectionKeys,type Collection} from '../src/domain/workspace-collections';
import type {Database,Statement} from './database';
import {HttpError,visibleWorkspace,type Actor} from './policy';
const descending=new Set<Collection>(['reports','events','annualReports','intakeItems']);
const annual=new Set<Collection>(['annualPlans','annualGoals','annualReports','annualAllocations']);
const rows=(s:Workspace,k:Collection)=>(s[k]??[]) as {id:string;projectId?:string}[];
export function workspaceMetadata(s:Workspace){const result:Record<string,unknown>={...s};for(const key of collectionKeys)delete result[key];delete result.members;return result;}
export function workspacePayload(s:Workspace,actor:Actor){
 const visible=visibleWorkspace(s,actor);
 if(Buffer.byteLength(JSON.stringify(visible))<=1_500_000)return {workspace:visible,access:actor};
 const workspace={...workspaceMetadata(visible),members:visible.members,...Object.fromEntries(collectionKeys.map(k=>[k,[]]))} as unknown as Workspace;
 return {workspace,access:actor,workspacePages:collectionKeys.filter(k=>rows(visible,k).length>0)};
}
/** Delta writes share the revision transaction. An old receipt alone cannot authorize a concurrent retry. */
export function workspaceWrites(db:Database,orgId:string,before:Workspace,next:Workspace,storageVersion:number,eventId:string,legacyBody:string,writeToken:string):Statement[]{
 const statements:Statement[]=[],gate="EXISTS(SELECT 1 FROM operations WHERE id=? AND org_id=?) AND current_setting('value_lens.command_token',true)=?";
 if(storageVersion===1)statements.push(db.prepare(`INSERT INTO workspace_checkpoints(org_id,revision,body) SELECT ?,?,? WHERE ${gate} ON CONFLICT(org_id) DO NOTHING`).bind(orgId,before.revision,legacyBody,eventId,orgId,writeToken));
 for(const key of collectionKeys){
  const old=new Map(rows(before,key).map(x=>[x.id,JSON.stringify(x)]));
  const data=rows(next,key),ids=new Set<string>();
  const changed=data.flatMap((x,index)=>{
   if(!x.id||ids.has(x.id))throw new HttpError(400,'중복되거나 비어 있는 기록 번호예요.');ids.add(x.id);
   const encoded=JSON.stringify(x);if(Buffer.byteLength(encoded)>2_000_000)throw new HttpError(413,'한 기록이 2MB를 넘어요. 보고 기간이나 자료 버전을 나누어 주세요.');
   if(storageVersion===2&&old.get(x.id)===encoded)return [];
   return [{id:x.id,project_id:key==='projects'?x.id:x.projectId||null,position:storageVersion===1?index:descending.has(key)?-next.revision:index,data:x}];
  });
  const removed=[...old.keys()].filter(id=>!ids.has(id));
  if(storageVersion===1)statements.push(db.prepare(`DELETE FROM ${workspaceTables[key]} WHERE org_id=? AND ${gate}`).bind(orgId,eventId,orgId,writeToken));
  if(storageVersion===2&&removed.length)statements.push(db.prepare(`DELETE FROM ${workspaceTables[key]} WHERE org_id=? AND id=ANY(?) AND ${gate}`).bind(orgId,removed,eventId,orgId,writeToken));
  if(changed.length)statements.push(db.prepare(`INSERT INTO ${workspaceTables[key]}(org_id,id,project_id,position,data)
   SELECT ?,x.id,x.project_id,x.position,x.data FROM jsonb_to_recordset(CAST(? AS jsonb)) AS x(id text,project_id text,position bigint,data jsonb) WHERE ${gate}
   ON CONFLICT(org_id,id) DO UPDATE SET project_id=excluded.project_id,data=excluded.data`).bind(orgId,JSON.stringify(changed),eventId,orgId,writeToken));
 }
 return statements;
}
export async function workspacePage(db:Database,orgId:string,userId:string,url:URL){
 const key=z.enum(collectionKeys as [Collection,...Collection[]]).parse(url.searchParams.get('collection'));
 const revision=z.coerce.number().int().nonnegative().parse(url.searchParams.get('revision'));
 const offset=z.coerce.number().int().min(0).max(1_000_000).parse(url.searchParams.get('offset')??0);
 const visible=key==='intakeItems'?`(m.role IN ('owner','admin') OR (e.project_id IS NULL AND e.data->>'createdById'=m.id) OR EXISTS(SELECT 1 FROM project_members p WHERE p.org_id=e.org_id AND p.project_id=e.project_id AND p.member_id=m.id))`:annual.has(key)?"m.role IN ('owner','admin')":`(m.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM project_members p WHERE p.org_id=e.org_id AND p.project_id=e.project_id AND p.member_id=m.id))`;
 const [access,result]=await db.batch([
  db.prepare('SELECT o.revision,o.status,m.role FROM organizations o JOIN memberships m ON m.org_id=o.id WHERE o.id=? AND m.user_id=? AND m.active=1').bind(orgId,userId),
  db.prepare(`SELECT e.data FROM ${workspaceTables[key]} e JOIN organizations o ON o.id=e.org_id JOIN memberships m ON m.org_id=o.id WHERE e.org_id=? AND m.user_id=? AND m.active=1 AND o.status='active' AND o.revision=? AND ${visible} ORDER BY e.position,e.id LIMIT 501 OFFSET ?`).bind(orgId,userId,revision,offset)
 ]);
 const row=access.results[0];if(!row||row.status!=='active')throw new HttpError(403,'이 조직에 접근할 권한이 없어요.');
 if(Number(row.revision)!==revision)throw new HttpError(409,'불러오는 동안 자료가 변경됐어요. 최신 내용을 다시 불러와 주세요.');
 const items:unknown[]=[];let bytes=0;
 for(const record of result.results.slice(0,500)){const size=Buffer.byteLength(JSON.stringify(record.data));if(items.length&&bytes+size>1_000_000)break;items.push(record.data);bytes+=size;}
 return {items,revision,nextOffset:result.results.length>items.length?offset+items.length:null};
}
