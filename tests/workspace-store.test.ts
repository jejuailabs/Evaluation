import {test} from 'node:test';
import assert from 'node:assert/strict';
import {postgresFixture} from './postgres-fixture';
import {handleApi,type Identity} from '../server/api';
import {workspaceWrites} from '../server/workspace-store';
import {hydrateWorkspacePages} from '../src/infrastructure/workspace-pages';
import {collectionKeys} from '../src/domain/workspace-collections';
import {createSeed} from '../src/domain/seed';
import type {Workspace} from '../src/domain/types';
const user:Identity={userId:'store-owner',email:'store@example.test',displayName:'관리자'};
async function setup(){
 const f=await postgresFixture(),env={DB:f.db};
 const call=async(path:string,data?:unknown,actor:Identity|null=user):Promise<any>=>{const response=await handleApi(new Request('https://app.example/api/'+path,{method:data?'POST':'GET',headers:{Origin:'https://app.example','X-Value-Lens':'1'},body:data?JSON.stringify(data):undefined}),env,actor);return {status:response.status,...await response.json() as Record<string,any>};};
 const org=(await call('organizations',{name:'저장 검증 조직'})).id;return {...f,call,org};
}
test('행 저장: 이전 JSON 무손실 전환·체크포인트·변경 항목만 기록·충돌 롤백',async()=>{
 const f=await setup();try{
 const initial=await f.call(`organizations/${f.org}/workspace`),seed=createSeed();seed.organization=initial.workspace.organization;seed.members=initial.workspace.members;seed.projects.forEach(p=>{p.orgId=f.org;p.ownerId=seed.members[0].id;});
 for(const k of collectionKeys)for(const row of (seed[k]??[]) as any[])if('orgId' in row)row.orgId=f.org;
 seed.tasks.forEach(t=>t.ownerId=seed.members[0].id);seed.expenses.forEach(e=>e.ownerId=seed.members[0].id);seed.revision=0;
 const legacy=JSON.stringify(seed);await f.db.prepare('UPDATE organizations SET body=?,storage_version=1 WHERE id=?').bind(legacy,f.org).run();
 const id=crypto.randomUUID(),command={type:'task.status',projectId:'care',taskId:seed.tasks[0].id,status:'doing'};
 const first=await f.call(`organizations/${f.org}/commands`,{id,revision:0,command});assert.equal(first.status,200);
 const raw=await f.db.prepare('SELECT body,storage_version FROM organizations WHERE id=?').bind(f.org).first<any>();assert.equal(raw.storage_version,2);assert.ok(Buffer.byteLength(raw.body)<1000);assert.equal(JSON.parse(raw.body).tasks,undefined);
 assert.equal((await f.db.prepare('SELECT body FROM workspace_checkpoints WHERE org_id=?').bind(f.org).first<any>())!.body,legacy);
 assert.deepEqual(first.workspace.documents,seed.documents);assert.deepEqual(first.workspace.measurements,seed.measurements);assert.equal(first.workspace.tasks[0].status,'doing');
 const before=first.workspace as Workspace,after=structuredClone(before);after.tasks[0].status='done';after.revision++;
 const writes=workspaceWrites(f.db,f.org,before,after,2,'operation','','test-token');assert.equal(writes.length,1);
 const other=before.tasks[1];const responses=await Promise.all(['doing','done'].map(status=>f.call(`organizations/${f.org}/commands`,{id:crypto.randomUUID(),revision:1,command:{type:'task.status',projectId:other.projectId,taskId:other.id,status}})));
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal((await f.call(`organizations/${f.org}/workspace`)).workspace.revision,2);
 const retry=await f.call(`organizations/${f.org}/commands`,{id,revision:0,command});assert.equal(retry.status,200);assert.equal((await f.db.prepare('SELECT count(*) n FROM workspace_checkpoints WHERE org_id=?').bind(f.org).first<any>())!.n,1);
 // Returning to the compatible JSON representation reconstructs current data, not the old checkpoint.
 const current=(await f.call(`organizations/${f.org}/workspace`)).workspace;
 await f.db.prepare('UPDATE organizations SET body=read_workspace(id),storage_version=1,revision=revision+1 WHERE id=?').bind(f.org).run();
 const restored=(await f.call(`organizations/${f.org}/workspace`)).workspace;assert.deepEqual(restored.tasks,current.tasks);assert.deepEqual(restored.reports,current.reports);
 }finally{await f.close();}
});
test('행 저장: 1년 합성 자료 5천 업무·365 현장 기록·52 보고서의 분할 조회와 1MiB 이후 저장',async()=>{
 const f=await setup();try{
 let s=(await f.call(`organizations/${f.org}/workspace`)).workspace as Workspace;const member=s.members[0].id,pid='annual-project';s.projects.push({id:pid,orgId:f.org,name:'한 해 운영',purpose:'장기 검증',start:'2026-01-01',end:'2026-12-31',budget:0,ownerId:member,category:'지역'});
 s.tasks=Array.from({length:5000},(_,i)=>({id:`task-${i}`,orgId:f.org,projectId:pid,title:`업무 ${i}`,due:`2026-${String(i%12+1).padStart(2,'0')}-01`,ownerId:member,status:'todo',note:'현장 운영 기록 '.repeat(25)}));
 s.activities=Array.from({length:365},(_,i)=>({id:`activity-${i}`,orgId:f.org,projectId:pid,title:`현장 ${i}`,body:'현장에서 관찰한 내용과 참석 기록을 함께 보관합니다. '.repeat(20),date:'2026-01-01',ownerId:member,indicatorIds:[],evidence:[],documentId:`doc-${i}`,createdAt:'2026-01-01T00:00:00Z'}));
 s.documents=s.activities.map(a=>({id:a.documentId,orgId:f.org,projectId:pid,title:a.title,versions:[{id:`v-${a.id}`,name:a.title+'.txt',size:Buffer.byteLength(a.body),inlineText:a.body,createdAt:a.createdAt}]}));
 s.reports=Array.from({length:52},(_,i)=>({id:`report-${i}`,orgId:f.org,projectId:pid,title:`주간 ${i}`,projectName:'한 해 운영',purpose:'기록',periodStart:'2026-01-01',asOf:'2026-09-30',createdAt:'2026-10-06T00:00:00Z',budget:{allocated:0,committed:0,spent:0,paid:0,available:0,unpaid:0},metrics:[],evidence:[],completedTasks:0,totalTasks:5000,pendingMeasurements:0,note:'보고서 해석 '.repeat(1000)}));
 const bytes=Buffer.byteLength(JSON.stringify(s));assert.ok(bytes>4_500_000);
 await f.db.prepare('UPDATE organizations SET body=?,storage_version=1 WHERE id=?').bind(JSON.stringify(s),f.org).run();
 const start=performance.now();const saved=await f.call(`organizations/${f.org}/commands`,{id:crypto.randomUUID(),revision:0,command:{type:'task.status',projectId:pid,taskId:'task-0',status:'doing'}});
 assert.equal(saved.status,200);assert.ok(saved.workspacePages.includes('tasks'));assert.ok(Buffer.byteLength(JSON.stringify(saved))<1_500_000);
 let maxBytes=0,requests=0;
 const hydrated=await hydrateWorkspacePages(saved,async(key,offset)=>{requests++;const page=await f.call(`organizations/${f.org}/workspace/page?collection=${key}&revision=1&offset=${offset}`);assert.equal(page.status,200);maxBytes=Math.max(maxBytes,Buffer.byteLength(JSON.stringify(page)));return page;});
 assert.equal(hydrated.workspace.tasks.length,5000);assert.equal(hydrated.workspace.activities!.length,365);assert.equal(hydrated.workspace.reports.length,52);assert.equal(hydrated.workspace.tasks[0].status,'doing');assert.deepEqual(hydrated.workspace.reports,s.reports);assert.ok(maxBytes<2_100_000);
 const next=await f.call(`organizations/${f.org}/commands`,{id:crypto.randomUUID(),revision:1,command:{type:'task.status',projectId:pid,taskId:'task-1',status:'done'}});assert.equal(next.status,200);
 assert.equal((await f.call(`organizations/${f.org}/workspace/page?collection=tasks&revision=1&offset=0`)).status,409);
 const outsider={userId:'foreign',email:'foreign@example.test',displayName:'다른 조직'};
 assert.equal((await f.call(`organizations/${f.org}/workspace/page?collection=tasks&revision=2`,undefined,outsider)).status,403);
 assert.equal((await f.call(`organizations/${f.org}/workspace/page?collection=users&revision=2`)).status,400);
 console.log(JSON.stringify({yearFixtureBytes:bytes,pageRequests:requests,maxPageBytes:maxBytes,migrationAndReadsMs:Math.round(performance.now()-start)}));
 }finally{await f.close();}
});
test('분할 조회는 서로 다른 버전이나 반복 커서를 섞어 반환하지 않음',async()=>{
 const payload={workspace:createSeed(),workspacePages:['tasks' as const]};payload.workspace.revision=4;const original=structuredClone(payload);
 await assert.rejects(()=>hydrateWorkspacePages(payload,async()=>({items:[],revision:5,nextOffset:null})),/바뀌/);assert.deepEqual(payload,original);
 await assert.rejects(()=>hydrateWorkspacePages(payload,async()=>({items:[],revision:4,nextOffset:0})),/이어서/);
});

test('늦게 도착한 동일 요청은 기존 작업 영수증으로 최신 항목을 덮어쓸 수 없음',async()=>{
 const f=await setup();let release:()=>void=()=>{};
 try{
  const initial=(await f.call(`organizations/${f.org}/workspace`)).workspace as Workspace,mid=initial.members[0].id,pid='p';
  initial.projects=[{id:pid,orgId:f.org,name:'동시 저장',purpose:'검증',start:'2026-01-01',end:'2026-12-31',budget:0,ownerId:mid,category:'돌봄'}];initial.tasks=[{id:'task',orgId:f.org,projectId:pid,title:'업무',due:'2026-10-06',ownerId:mid,status:'todo'}];
  await f.db.prepare('UPDATE organizations SET body=?,storage_version=1 WHERE id=?').bind(JSON.stringify(initial),f.org).run();
  const original=f.db.batch.bind(f.db);let hold=true,ready:()=>void=()=>{};const waiting=new Promise<void>(r=>{ready=r;}),gate=new Promise<void>(r=>{release=r;});
  f.db.batch=async statements=>{if(hold&&String((statements[0] as any)?.sql).startsWith('UPDATE organizations SET body')){hold=false;ready();await gate;}return original(statements);};
  const command={type:'task.status',projectId:pid,taskId:'task',status:'done'},payload={id:crypto.randomUUID(),revision:0,command};
  const delayed=f.call(`organizations/${f.org}/commands`,payload);await waiting;
  assert.equal((await f.call(`organizations/${f.org}/commands`,payload)).status,200);
  assert.equal((await f.call(`organizations/${f.org}/commands`,{id:crypto.randomUUID(),revision:1,command:{...command,status:'doing'}})).status,200);
  release();assert.equal((await delayed).status,409);
  const current=(await f.call(`organizations/${f.org}/workspace`)).workspace;assert.equal(current.revision,2);assert.equal(current.tasks[0].status,'doing');assert.equal(current.events.length,2);
 }finally{release();await f.close();}
});
