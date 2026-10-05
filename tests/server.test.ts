import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleApi, type Identity, type Services } from '../server/api';
import type { Command } from '../src/domain/types';

let sqlite:DatabaseSync, env:Services;
const owner:Identity={userId:'owner-a',email:'owner@test.example',displayName:'대표'}, member:Identity={userId:'member-b',email:'member@test.example',displayName:'구성원'}, outsider:Identity={userId:'outsider-c',email:'outsider@test.example',displayName:'다른 조직 사람'};
class Statement {
 values:any[]=[];constructor(public sql:string){}
 bind(...values:any[]){this.values=values;return this;}
 async first(){return sqlite.prepare(this.sql).get(...this.values)??null;}
 async all(){return{results:sqlite.prepare(this.sql).all(...this.values),success:true};}
 async run(){const r=sqlite.prepare(this.sql).run(...this.values);return{success:true,meta:{changes:r.changes},results:[]};}
}
beforeEach(()=>{sqlite?.close();sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');sqlite.exec(readFileSync(new URL('../drizzle/0000_fair_flatman.sql',import.meta.url),'utf8'));
 const files=new Map<string,ArrayBuffer>();
 env={DB:{prepare:(sql:string)=>new Statement(sql),batch:async(statements:Statement[])=>{sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database,BUCKET:{put:async(key:string,value:ArrayBuffer)=>{files.set(key,value);},get:async(key:string)=>files.has(key)?{body:files.get(key)}:null,delete:async(key:string)=>{files.delete(key);}} as any};
});
async function call(path:string,user:Identity|null=owner,data?:unknown,method=data===undefined?'GET':'POST',headers:Record<string,string>={}){const response=await handleApi(new Request(`https://app.example/api/${path}`,{method,headers:{Origin:'https://app.example','X-Value-Lens':'1','Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)}),env,user);const result:any=await response.json();return{status:response.status,...result};}
async function create(user=owner){const o=await call('organizations',user,{name:'함께하는 조직'});assert.equal(o.status,201);return o.id as string;}
async function load(id:string,user=owner){return call(`organizations/${id}/workspace`,user);}
async function cmd(orgId:string,command:Command,user=owner,revision?:number,id=crypto.randomUUID()){const w=await load(orgId,user);return call(`organizations/${orgId}/commands`,user,{id,revision:revision??w.workspace?.revision,command});}
async function project(orgId:string){const w=await load(orgId);const id=crypto.randomUUID();const p={id,orgId,name:'돌봄 사업',purpose:'함께 기록해요',start:'2026-01-01',end:'2027-12-31',ownerId:w.workspace.members[0].id,budget:1000000,category:'돌봄'};assert.equal((await cmd(orgId,{type:'project.add',project:p})).status,200);return id;}
async function invite(orgId:string,role='member'){const r=await call(`organizations/${orgId}/admin/invitations`,owner,{email:member.email,role});assert.equal(r.status,200);return r.url.split('/invite/')[1];}
async function join(orgId:string,role='member'){const token=await invite(orgId,role);const accepted=await call('invitations/accept',member,{token});assert.equal(accepted.status,200);const w=await load(orgId,member);return w.access.memberId as string;}

test('서버에서 연간 계획→현장 기록→지표 확인→연간 보고를 저장하고 역할별로 분리',async()=>{
 const orgId=await create(),pid=await project(orgId),mid=await join(orgId);
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:true});
 const planId=crypto.randomUUID(),indicatorId=crypto.randomUUID();
 const plan:Command={type:'annual.plan.save',plan:{id:planId,orgId,year:2026,title:'올해 계획',purpose:'이웃의 참여',budget:1000000},reason:''};
 assert.equal((await cmd(orgId,plan,member)).status,403);assert.equal((await cmd(orgId,plan)).status,200);
 assert.equal((await cmd(orgId,{type:'indicator.add',indicator:{id:indicatorId,orgId,projectId:pid,name:'이용자',unit:'명',target:100,forecast:120,forecastNote:'10명 × 12회, 중복 없음 가정',definition:'중복 제거 이용자',source:'우리 조직 지표',standardId:'iris-pi4060',aggregation:'cumulative-snapshot',direction:'higher',version:1}})).status,200);
 assert.equal((await cmd(orgId,{type:'annual.goal.save',goal:{id:crypto.randomUUID(),orgId,planId,name:'100명 연결',unit:'명',target:100,definition:'중복 제거',direction:'higher',aggregation:'sum',linkIds:[indicatorId],deduplication:'한 사업의 고유 개인 기준'},reason:''})).status,200);
 assert.equal((await cmd(orgId,{type:'activity.add',activity:{id:crypto.randomUUID(),orgId,projectId:pid,title:'방문 기록',body:'명부에서 15명 확인',date:'2026-09-30',ownerId:'spoofed-author',indicatorIds:[indicatorId],evidence:[]}},member)).status,200);
 const w=await load(orgId),a=w.workspace.activities[0],d=w.workspace.documents.find((d:any)=>d.id===a.documentId);assert.equal(a.ownerId,mid);
 const measurementId=crypto.randomUUID();assert.equal((await cmd(orgId,{type:'measurement.add',measurement:{id:measurementId,orgId,projectId:pid,indicatorId,asOf:'2026-09-30',value:15,note:'명부 대조',evidence:{documentId:d.id,versionId:d.versions[0].id},status:'pending',createdAt:''}},member)).status,200);
 assert.equal((await cmd(orgId,{type:'measurement.confirm',projectId:pid,measurementId},member)).status,403);
 assert.equal((await cmd(orgId,{type:'measurement.confirm',projectId:pid,measurementId})).status,200);
 assert.equal((await cmd(orgId,{type:'annual.report.create',planId,start:'2026-01-01',end:'2026-09-30',note:'다음 분기 방문 확대'})).status,200);
 const final=await load(orgId);assert.equal(final.workspace.annualReports[0].goals[0].actual,15);assert.equal(final.workspace.indicators[0].source,'IRIS+ PI4060 참고');
 const restricted=await load(orgId,member);assert.deepEqual(restricted.workspace.annualReports,[]);assert.deepEqual(restricted.workspace.annualPlans,[]);assert.equal(restricted.workspace.activities.length,1);
});

test('인증·CSRF·조직 경계: 익명 쓰기, 다른 조직 직접 접근, 외부 Origin을 거부',async()=>{
 assert.equal((await call('session',null)).user,null);
 assert.equal((await call('organizations',null,{name:'불가'})).status,401);
 const orgId=await create();assert.equal((await load(orgId,outsider)).status,403);
 assert.equal((await call('organizations',owner,{name:'불가'},'POST',{Origin:'https://evil.example'})).status,403);
 const w=await load(orgId);assert.equal(w.workspace.projects.length,0);assert.equal(w.workspace.documents.length,0);assert.equal(w.workspace.members.length,1);
});
test('초대: 지정 이메일만 수락, 한 번 사용, 취소·만료 초대와 대표 권한 변경 거부',async()=>{
 const orgId=await create();const token=await invite(orgId);
 assert.equal((await call('invitations/accept',outsider,{token})).status,403);
 assert.equal((await call('invitations/accept',member,{token})).status,200);
 assert.equal((await call('invitations/accept',member,{token})).status,410);
 const ownerId=(await load(orgId)).access.memberId;
 assert.equal((await call(`organizations/${orgId}/admin/members/${ownerId}`,owner,{role:'member',active:false})).status,403);
 const expired=await invite(orgId);sqlite.exec("UPDATE invitations SET expires_at='2000-01-01' WHERE status='pending'");
 assert.equal((await call('invitations/accept',member,{token:expired})).status,410);
 const canceled=await invite(orgId);const a=await call(`organizations/${orgId}/admin`);const pending=a.invitations.find((i:any)=>i.status==='pending'&&i.expires_at>'2026-01-01');
 assert.equal((await call(`organizations/${orgId}/admin/invitations/${pending.id}`,owner,{},'DELETE')).status,200);
 assert.equal((await call('invitations/accept',member,{token:canceled})).status,410);
});
test('프로젝트 배정과 퇴사: 미배정 데이터 숨김, 배정 후 접근, 회수 즉시 쓰기 거부',async()=>{
 const orgId=await create(),pid=await project(orgId),mid=await join(orgId);
 assert.equal((await load(orgId,member)).workspace.projects.length,0);
 const task:Command={type:'task.add',task:{id:crypto.randomUUID(),orgId,projectId:pid,title:'현장 방문',due:'2026-10-05',ownerId:mid,status:'todo'}};
 assert.equal((await cmd(orgId,task,member)).status,403);
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:true});
 assert.equal((await load(orgId,member)).workspace.projects.length,1);
 assert.equal((await cmd(orgId,task,member)).status,200);
 assert.equal((await call(`organizations/${orgId}/admin`,member)).status,403);
 await call(`organizations/${orgId}/admin/members/${mid}`,owner,{role:'viewer',active:true});
 assert.equal((await cmd(orgId,{type:'task.status',projectId:pid,taskId:task.task.id,status:'done'},member)).status,403);
 await call(`organizations/${orgId}/admin/members/${mid}`,owner,{role:'member',active:false});
 assert.equal((await load(orgId,member)).status,403);
});
test('동시 저장·재시도: 동일 요청은 한 번, 다른 내용 재사용과 오래된 버전 거부',async()=>{
 const orgId=await create();const w=await load(orgId);const command:Command={type:'project.add',project:{id:crypto.randomUUID(),orgId,name:'첫 사업',purpose:'목적',start:'2026-01-01',end:'2026-12-31',ownerId:w.workspace.members[0].id,budget:0,category:'사업'}};
 const operationId=crypto.randomUUID();assert.equal((await cmd(orgId,command,owner,0,operationId)).status,200);
 assert.equal((await cmd(orgId,command,owner,0,operationId)).status,200);
 assert.equal((await load(orgId)).workspace.projects.length,1);
 const other:Command={...command,project:{...command.project,id:crypto.randomUUID(),name:'다른 사업'}};
 assert.equal((await cmd(orgId,other,owner,0)).status,409);
 assert.equal((await cmd(orgId,other,owner,1,operationId)).status,409);
});
test('원본 파일: 조직·프로젝트 권한 검증, 서버 메타데이터 사용, 정지 후 다운로드 차단',async()=>{
 const orgId=await create(),pid=await project(orgId);const file=new TextEncoder().encode('현장 기록');
 const response=await handleApi(new Request(`https://app.example/api/organizations/${orgId}/files?project=${pid}`,{method:'POST',headers:{Origin:'https://app.example','X-Value-Lens':'1','X-File-Name':encodeURIComponent('기록.txt'),'Content-Length':String(file.byteLength)},body:file}),env,owner);
 const version:any=await response.json();assert.equal(response.status,201);
 const c:Command={type:'document.add',document:{id:crypto.randomUUID(),orgId,projectId:pid,title:'현장 기록',versions:[{...version,name:'조작한 이름'}]}};
 assert.equal((await cmd(orgId,c)).status,200);assert.equal((await load(orgId)).workspace.documents[0].versions[0].name,'기록.txt');
 const get=(user:Identity)=>handleApi(new Request(`https://app.example/api/organizations/${orgId}/files/${version.id}`),env,user);
 assert.equal((await get(outsider)).status,403);assert.equal(await(await get(owner)).text(),'현장 기록');
 env.PLATFORM_ADMIN_USER_IDS=outsider.userId;await call(`platform/${orgId}`,outsider,{status:'suspended',reason:'권한 검증 테스트'});
 assert.equal((await get(owner)).status,403);
});
test('전체 관리자: 기본 권한 없음, 지정 계정만 메타데이터 조회·사유 있는 상태 변경',async()=>{
 const orgId=await create();assert.equal((await call('platform',owner)).status,403);
 env.PLATFORM_ADMIN_USER_IDS=owner.userId;const result=await call('platform');assert.equal(result.status,200);
 assert.equal('body' in result.organizations[0],false);assert.equal('email' in result.organizations[0],false);
 assert.equal((await call(`platform/${orgId}`,owner,{status:'suspended',reason:''})).status,400);
 assert.equal((await call(`platform/${orgId}`,owner,{status:'suspended',reason:'일시 점검'})).status,200);
 assert.equal((await load(orgId)).status,403);
 assert.equal((await call('platform')).audit.length,1);
});
