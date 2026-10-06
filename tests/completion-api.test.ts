import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {postgresFixture} from './postgres-fixture';
import {handleApi,type Identity,type Services} from '../server/api';
import {runOneJob} from '../server/jobs';
import {deadlineNotifications} from '../server/deadlines';
import {commandBase} from '../src/domain/command-base';
import type {Workspace,Command} from '../src/domain/types';
import {today} from '../src/domain/selectors';
let fixture:Awaited<ReturnType<typeof postgresFixture>>;after(async()=>fixture?.close());
test('완료 기능 API: 두 사용자·인수인계·격리·비동기 작업·동시 수정·본문 검색·제출 파일 고정',async()=>{
 fixture=await postgresFixture();const objects=new Map<string,ArrayBuffer>(),env:Services={DB:fixture.db,BUCKET:{put:async(k,v)=>{objects.set(k,v);},get:async k=>objects.has(k)?{body:objects.get(k)!}:null,delete:async k=>{objects.delete(k);}},WORKER_SECRET:'x'.repeat(64)};
 const owner:Identity={userId:'finish-owner',email:'owner@finish.example',displayName:'대표'},other:Identity={userId:'finish-other',email:'other@finish.example',displayName:'인수자'};
 async function api(path:string,data?:unknown,user=owner){const r=await handleApi(new Request('https://app.example/api/'+path,{method:data?'POST':'GET',headers:{Origin:'https://app.example','X-Value-Lens':'1'},body:data?JSON.stringify(data):undefined}),env,user);return {status:r.status,...await r.json() as any};}
 const org=(await api('organizations',{name:'완료 통합 검증'})).id,root=`organizations/${org}`,load=async(user=owner)=>(await api(root+'/workspace',undefined,user)).workspace as Workspace;
 const cmd=async(c:Command,user=owner,base?:Workspace)=>api(root+'/commands',{id:crypto.randomUUID(),revision:(base??await load()).revision,command:c,...(base?{baseProjectHash:await commandBase(base,c)}:{})},user);
 const invite=await api(root+'/admin/invitations',{email:other.email,role:'admin'});assert.equal((await api('invitations/accept',{token:invite.url.split('/invite/')[1]},other)).status,200);
 const ownerId=(await api(root+'/workspace')).access.memberId,otherId=(await api(root+'/workspace',undefined,other)).access.memberId;
 for(const id of ['p','q'])assert.equal((await cmd({type:'project.add',project:{id,orgId:org,name:id,purpose:'검증',start:'2026-01-01',end:'2027-12-31',ownerId,budget:10000,category:'검증'}})).status,200);
 assert.equal((await cmd({type:'organization.team.save',team:{id:'team',name:'운영',memberIds:[ownerId,otherId]}})).status,200);
 const stale=await load();await cmd({type:'task.add',task:{id:'qtask',orgId:org,projectId:'q',title:'다른 프로젝트',due:today(),ownerId,status:'todo'}});
 assert.equal((await cmd({type:'task.add',task:{id:'ptask',orgId:org,projectId:'p',title:'기한 알림',due:today(),ownerId,status:'todo'}},owner,stale)).status,200);
 assert.equal((await cmd({type:'task.add',task:{id:'blocked',orgId:org,projectId:'p',title:'같은 프로젝트',due:today(),ownerId,status:'todo'}},owner,stale)).status,409);
 await deadlineNotifications(env.DB);await deadlineNotifications(env.DB);assert.equal((await api(root+'/notifications')).items.filter((n:any)=>n.kind==='task.deadline').length,2);
 async function upload(name:string,text:string){const b=new TextEncoder().encode(text);const r=await handleApi(new Request(`https://app.example/api/${root}/files?project=p`,{method:'POST',headers:{Origin:'https://app.example','X-Value-Lens':'1','X-File-Name':encodeURIComponent(name),'Content-Length':String(b.length)},body:b}),env,owner);assert.equal(r.status,201);return await r.json() as any;}
 const v=await upload('source.txt','안녕하세요. 우리 기관의 고유한 돌봄 기록입니다.');assert.equal((await cmd({type:'document.add',document:{id:'doc',orgId:org,projectId:'p',title:'현장 자료',versions:[v]}})).status,200);
 assert.equal((await api(root+'/document-search?q='+encodeURIComponent('고유한 돌봄'))).items[0].id,'doc');
 assert.equal((await cmd({type:'document.restore',projectId:'p',documentId:'doc',versionId:v.id,reason:'원본 복원'})).status,200);
 const job={id:crypto.randomUUID(),kind:'convert',projectId:'p',documentId:'doc',versionId:v.id,format:'docx'};assert.equal((await api(root+'/jobs',job)).status,200);assert.equal((await api(root+'/jobs',job)).status,200);
 const processed=await Promise.all([runOneJob(env),runOneJob(env)]);assert.equal(processed.filter(p=>p.processed).length,1);
 const jobs=(await api(root+'/jobs')).jobs;assert.equal(jobs[0].state,'succeeded',JSON.stringify(jobs));assert.ok(jobs[0].result.file.name.endsWith('.docx'));assert.equal((await api(root+'/jobs',undefined,other)).jobs.length,0);
 assert.equal((await cmd({type:'report.create',projectId:'p',asOf:today(),note:'근거 확인'})).status,200);let r=(await load()).reports[0];
 for(const op of [{action:'request',recipient:'지원기관',reason:'검토'},{action:'approve',reason:'확인'}] as const){assert.equal((await cmd({type:'report.workflow',kind:'project',reportId:r.id,expectedVersion:r.workflow?.version??0,operation:op})).status,200);r=(await load()).reports[0];}
 const reportFile=await upload('submitted.html','실제 제출 내용'),artifactId=crypto.randomUUID();
 assert.equal((await cmd({type:'report.asset',kind:'project',reportId:r.id,artifact:{id:artifactId,file:reportFile,sha256:createHash('sha256').update('실제 제출 내용').digest('hex')}})).status,200);
 const submission={type:'report.workflow' as const,kind:'project' as const,reportId:r.id,expectedVersion:r.workflow!.version,operation:{action:'submit' as const,date:today(),recipient:'지원기관',channel:'portal' as const,reference:'접수-1',format:'html' as const,reason:'전달'}};
 assert.equal((await cmd(submission)).status,400);assert.equal((await cmd({...submission,operation:{...submission.operation,artifactId}})).status,200);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM report_assets WHERE org_id=?').bind(org).first<any>())!.n,1);await assert.rejects(()=>env.DB.prepare('DELETE FROM report_assets WHERE org_id=?').bind(org).run());
 const revokedJob=crypto.randomUUID();assert.equal((await api(root+'/jobs',{...job,id:revokedJob},other)).status,200);
 assert.equal((await api(root+'/admin/members/'+otherId,{role:'viewer',active:true})).status,200);
 assert.equal((await api(root+'/jobs',undefined,other)).jobs.length,0);await runOneJob(env);
 assert.equal((await env.DB.prepare('SELECT state FROM background_jobs WHERE id=?').bind(revokedJob).first<any>())!.state,'failed');
 assert.equal((await api(root+'/admin/members/'+otherId,{role:'admin',active:true})).status,200);
 const result=await api(root+'/admin/handover',{id:crypto.randomUUID(),revision:(await load()).revision,from:ownerId,to:otherId,deactivate:true,transferOwnership:true,reason:'대표 인수인계'});assert.equal(result.status,200,JSON.stringify(result));assert.equal((await api(root+'/workspace')).status,403);
 const after=await load(other);assert.equal(after.projects.find(p=>p.id==='p')!.ownerId,otherId);assert.equal(after.tasks.find(t=>t.id==='ptask')!.ownerId,otherId);assert.equal(after.reports[0].createdById,ownerId);
});
