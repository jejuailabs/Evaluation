import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { postgresFixture } from './postgres-fixture';

import { handleApi, type Identity, type Services } from '../server/api';
import type { Command } from '../src/domain/types';
import { reportSheets, outcomeEvidenceText } from '../src/infrastructure/report-data';
import { reportHTML } from '../src/infrastructure/report';
import { reportDOCX } from '../src/infrastructure/report-docx';
import { unzipSync, strFromU8 } from 'fflate';

let fixture:Awaited<ReturnType<typeof postgresFixture>>, env:Services;
after(async()=>{await fixture?.close();});
const owner:Identity={userId:'owner-a',email:'owner@test.example',displayName:'대표'}, member:Identity={userId:'member-b',email:'member@test.example',displayName:'구성원'}, outsider:Identity={userId:'outsider-c',email:'outsider@test.example',displayName:'다른 조직 사람'};
beforeEach(async()=>{
 await fixture?.close();fixture=await postgresFixture();
 const files=new Map<string,ArrayBuffer>();
 env={DB:fixture.db,BUCKET:{put:async(key:string,value:ArrayBuffer)=>{files.set(key,value);},get:async(key:string)=>files.has(key)?{body:files.get(key)!}:null,delete:async(key:string)=>{files.delete(key);}}};
});
async function call(path:string,user:Identity|null=owner,data?:unknown,method=data===undefined?'GET':'POST',headers:Record<string,string>={}){const response=await handleApi(new Request(`https://app.example/api/${path}`,{method,headers:{Origin:'https://app.example','X-Value-Lens':'1','Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)}),env,user);const result:any=await response.json();return{status:response.status,...result};}
async function create(user=owner){const o=await call('organizations',user,{name:'함께하는 조직'});assert.equal(o.status,201);return o.id as string;}
async function load(id:string,user=owner){return call(`organizations/${id}/workspace`,user);}
async function cmd(orgId:string,command:Command,user=owner,revision?:number,id=crypto.randomUUID()){const w=await load(orgId,user);return call(`organizations/${orgId}/commands`,user,{id,revision:revision??w.workspace?.revision,command});}
async function project(orgId:string){const w=await load(orgId);const id=crypto.randomUUID();const p={id,orgId,name:'돌봄 사업',purpose:'함께 기록해요',start:'2026-01-01',end:'2027-12-31',ownerId:w.workspace.members[0].id,budget:1000000,category:'돌봄'};assert.equal((await cmd(orgId,{type:'project.add',project:p})).status,200);return id;}
async function invite(orgId:string,role='member'){const r=await call(`organizations/${orgId}/admin/invitations`,owner,{email:member.email,role});assert.equal(r.status,200);return r.url.split('/invite/')[1];}
async function join(orgId:string,role='member'){const token=await invite(orgId,role);const accepted=await call('invitations/accept',member,{token});assert.equal(accepted.status,200);const w=await load(orgId,member);return w.access.memberId as string;}

async function outcomeCase(){
 const orgId=await create(),pid=await project(orgId),mid=await join(orgId),indicatorId=crypto.randomUUID();
 await cmd(orgId,{type:'indicator.add',indicator:{id:indicatorId,orgId,projectId:pid,name:'고유 참여자',unit:'명',target:100,forecast:null,forecastNote:'',definition:'중복 제외 실제 참여자',source:'우리 조직 지표',aggregation:'cumulative-snapshot',direction:'higher',version:1}});
 const text='2026-09-30 기준 실제 고유 참여자는 15명이다. 중복은 제외했다.',bytes=new TextEncoder().encode(text);
 const uploaded=await handleApi(new Request(`https://app.example/api/organizations/${orgId}/files?project=${pid}`,{method:'POST',headers:{Origin:'https://app.example','X-Value-Lens':'1','X-File-Name':encodeURIComponent('현장 결과.txt'),'Content-Length':String(bytes.length)},body:bytes}),env,owner);
 assert.equal(uploaded.status,201);const version:any=await uploaded.json(),documentId=crypto.randomUUID();
 assert.equal((await cmd(orgId,{type:'document.add',document:{id:documentId,orgId,projectId:pid,title:'현장 결과',versions:[version]}})).status,200);
 const input={documentId,versionId:version.id,indicatorIds:[indicatorId]},path=`organizations/${orgId}/outcome-ai`;
 const candidate={indicatorId,value:15,denominator:null,assessment:null,asOf:'2026-09-30',periodStart:null,blockId:'line:1',location:'1행',quote:text,explanation:'명부의 실제 인원',uncertainty:'중복 제외 재확인'};
 return {orgId,pid,mid,indicatorId,input,path,candidate};
}
test('현장 AI → 구성원 검토 → 관리자 확인 → 보고: 서명·중복·근거 이력을 보존하고 확정 전 집계 차단',async()=>{
 const {orgId,pid,mid,indicatorId,input,path,candidate}=await outcomeCase();
 assert.equal((await call(path,member,input)).status,403);assert.equal((await call(path,outsider,input)).status,403);
 assert.equal((await call(path,owner,input)).status,503);
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:true});
 env.OPENAI_API_KEY='test-only-key';env.OPENAI_MODEL='configured-model';let paid=0;const original=globalThis.fetch;
 globalThis.fetch=(async(_url,init)=>{paid++;const sent=JSON.parse(init!.body as string);assert.match(sent.input[0].content[0].text,/15명/);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'실행 결과',candidates:[candidate]})}]}]});}) as typeof fetch;
 try{
  assert.equal((await call(path,member,{...input,indicatorIds:['foreign']})).status,400);assert.equal(paid,0);
  const draft=await call(path,member,input);assert.equal(draft.status,200);assert.equal(draft.kind,'text');assert.equal(paid,1);
  assert.equal((await load(orgId)).workspace.measurements.length,0);
  const measurement:any={id:crypto.randomUUID(),orgId,projectId:pid,indicatorId,asOf:'2026-09-30',value:14,note:'중복 1명 추가 확인하여 제외',evidence:{documentId:input.documentId,versionId:input.versionId},status:'pending',createdAt:''};
  const command:Command={type:'measurement.add',aiReceipt:draft.candidates[0].receipt,measurement};
  assert.equal((await cmd(orgId,command,owner)).status,409); // receipt belongs to the reviewing member
  assert.equal((await cmd(orgId,{...command,measurement:{...measurement,analysisSource:{id:'forged'}}} as any,member)).status,400);
  assert.equal((await cmd(orgId,command,member)).status,200);
  const saved=(await load(orgId)).workspace.measurements[0];assert.equal(saved.value,14);assert.equal(saved.analysisSource.proposed.value,15);assert.equal(saved.analysisSource.reviewedBy,mid);
  assert.equal((await cmd(orgId,{...command,measurement:{...measurement,id:crypto.randomUUID()}},member)).status,400);
  await cmd(orgId,{type:'report.create',projectId:pid,asOf:'2026-09-30',note:''});
  const before=(await load(orgId)).workspace.reports[0];assert.equal(before.metrics[0].actual,null);assert.deepEqual(before.metrics[0].outcomeRecords,[]);assert.equal(before.pendingMeasurements,1);
  assert.equal((await cmd(orgId,{type:'measurement.confirm',projectId:pid,measurementId:measurement.id},member)).status,403);
  assert.equal((await cmd(orgId,{type:'measurement.confirm',projectId:pid,measurementId:measurement.id})).status,200);
  await cmd(orgId,{type:'report.create',projectId:pid,asOf:'2026-09-30',note:''});
  const report=(await load(orgId)).workspace.reports[0];assert.equal(report.metrics[0].actual,14);assert.ok(Math.abs(report.metrics[0].rate-14)<1e-9);
  assert.match(outcomeEvidenceText(report.metrics[0]).join('\n'),/최초 제안: 15/);assert.match(reportHTML(report),/중복 1명 추가/);
  assert.ok(reportSheets(report).find(s=>s.name==='AI 실적 검토'));
  const docx=unzipSync(new Uint8Array(await(await reportDOCX(report)).arrayBuffer()));assert.match(strFromU8(docx['word/document.xml']),/최초 제안: 15/);
  const planId=crypto.randomUUID();await cmd(orgId,{type:'annual.plan.save',plan:{id:planId,orgId,year:2026,title:'연간 계획',purpose:'돌봄',budget:0},reason:''});
  await cmd(orgId,{type:'annual.goal.save',goal:{id:crypto.randomUUID(),orgId,planId,name:'고유 참여자',unit:'명',target:100,definition:'중복 제외',direction:'higher',aggregation:'sum',linkIds:[indicatorId],deduplication:'단일 프로젝트'},reason:''});
  await cmd(orgId,{type:'annual.report.create',planId,start:'2026-01-01',end:'2026-09-30',note:''});
  const annual=(await load(orgId)).workspace.annualReports[0];assert.equal(annual.goals[0].actual,14);assert.equal(annual.goals[0].metrics[0].outcomeRecords[0].analysisSource.proposed.value,15);
  // Prior report is an immutable snapshot, not silently changed by later confirmation.
  assert.equal((await load(orgId)).workspace.reports.find((r:any)=>r.id===before.id).metrics[0].actual,null);
 }finally{globalThis.fetch=original;}
});
test('현장 AI는 변경된 권한·서명 버전·일일 한도·완료 프로젝트를 다시 검사',async()=>{
 const {orgId,pid,mid,input,path,candidate}=await outcomeCase();env.OPENAI_API_KEY='test-key';env.OPENAI_MODEL='configured-model';
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:true});
 const original=globalThis.fetch;let paid=0;
 globalThis.fetch=(async()=>{paid++;await call(`organizations/${orgId}/admin/members/${mid}`,owner,{role:'viewer',active:true});return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'결과',candidates:[candidate]})}]}]});}) as typeof fetch;
 try{
  assert.equal((await call(path,member,input)).status,403);assert.equal(paid,1);assert.equal((await call(path,member)).status,403);
  assert.equal((await load(orgId)).workspace.measurements.length,0);
  for(let n=0;n<19;n++)await env.DB.prepare('INSERT INTO operations (id,org_id,actor_id,action,request_hash,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),orgId,owner.userId,'outcomes.ai','test',new Date().toISOString()).run();
  assert.equal((await call(path,owner,input)).status,429);assert.equal(paid,1);
  const state=(await load(orgId)).workspace;state.projects[0].status='completed';await env.DB.prepare('UPDATE organizations SET body=? WHERE id=?').bind(JSON.stringify(state),orgId).run();
  assert.equal((await call(path,owner,input)).status,400);assert.equal(paid,1);
 }finally{globalThis.fetch=original;}
});

test('인증된 신규 계정은 소속 조직 없이 로그인하며 조직 정책은 그다음 적용',async()=>{
 const organizationId=await create();
 const newcomer:Identity={userId:'new-public-account',email:'new-member@gmail.com',displayName:'새 사용자'};
 const first=await call('session',newcomer);
 assert.equal(first.status,200);assert.equal(first.user.userId,newcomer.userId);
 assert.deepEqual(first.organizations,[]);assert.equal(first.platformAdmin,false);
 assert.equal((await load(organizationId,newcomer)).status,403);
 assert.equal((await call('organizations',null,{name:'미인증 조직'})).status,401);
 const created=await call('organizations',newcomer,{name:'첫 조직'});
 assert.equal(created.status,201);
 const workspace=await load(created.id,newcomer);
 assert.equal(workspace.access.role,'owner');assert.deepEqual(workspace.workspace.projects,[]);
 assert.equal((await call('session',newcomer)).organizations.length,1);
 assert.equal((await load(organizationId,newcomer)).status,403);
});

test('작업실 첫 로딩은 한 요청·두 DB 트랜잭션으로 끝내며 조직과 프로젝트 권한을 유지',async()=>{
 const orgId=await create(),pid=await project(orgId),mid=await join(orgId);
 const originalBatch=env.DB.batch.bind(env.DB);let transactions=0,statements=0;
 env.DB.batch=async queries=>{transactions++;statements+=queries.length;return originalBatch(queries);};
 const boot=await call(`session?org=${orgId}`);
 assert.equal(boot.status,200);assert.equal(boot.user.userId,owner.userId);
 assert.equal(boot.initialWorkspace.workspace.organization.id,orgId);
 assert.equal(boot.initialWorkspace.workspace.projects[0].id,pid);
 assert.equal(transactions,2);assert.equal(statements,5);
 env.DB.batch=originalBatch;
 const hidden=await call(`session?org=${orgId}`,member);
 assert.equal(hidden.status,200);assert.deepEqual(hidden.initialWorkspace.workspace.projects,[]);
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:true});
 assert.equal((await call(`session?org=${orgId}`,member)).initialWorkspace.workspace.projects[0].id,pid);
 assert.equal((await call(`session?org=${orgId}`,outsider)).status,403);
 const anonymous=await call(`session?org=${orgId}`,null);
 assert.equal(anonymous.user,null);assert.equal(anonymous.initialWorkspace,undefined);
 await call(`organizations/${orgId}/admin/members/${mid}`,owner,{role:'member',active:false});
 assert.equal((await call(`session?org=${orgId}`,member)).status,403);
 await env.DB.prepare("UPDATE organizations SET status='suspended' WHERE id=?").bind(orgId).run();
 assert.equal((await call(`session?org=${orgId}`)).status,403);
});

function directStore(){
 const objects=new Map<string,number>();
 env.BUCKET={put:async()=>{},get:async()=>null,delete:async key=>{objects.delete(key);},
  signUpload:async key=>`https://storage.example/upload/${key}?token=test-only`,head:async key=>objects.has(key)?{size:objects.get(key)!}:null,
  signDownload:async(key,name)=>`https://storage.example/download/${key}?download=${encodeURIComponent(name)}`};
 return objects;
}
test('직접 업로드: 권한 검사→원본 확인→등록·재시도→권한 있는 서명 다운로드',async()=>{
 const orgId=await create(),pid=await project(orgId),mid=await join(orgId),objects=directStore();
 const path=`organizations/${orgId}/files`,input={projectId:pid,name:'원본.hwpx',size:8*1024*1024};
 assert.equal((await call(`${path}/prepare`,member,input)).status,403);
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:true});
 const prepared=await call(`${path}/prepare`,member,input);assert.equal(prepared.status,201);assert.ok(prepared.uploadUrl.includes(prepared.id));
 assert.equal((await call(`${path}/complete`,owner,{id:prepared.id})).status,410);
 assert.equal((await call(`${path}/complete`,member,{id:prepared.id})).status,409);
 objects.set(`${orgId}/${prepared.id}`,input.size);
 const version=await call(`${path}/complete`,member,{id:prepared.id});assert.equal(version.status,201);assert.equal(version.size,input.size);
 assert.equal((await call(`${path}/complete`,member,{id:prepared.id})).status,200);
 assert.equal((await call(`${path}/${prepared.id}/url`,owner)).status,403);
 assert.equal((await call(`${path}/${prepared.id}/url`,member)).status,200);
 assert.equal((await call(`${path}/${prepared.id}/url`,outsider)).status,403);
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:false});
 assert.equal((await call(`${path}/${prepared.id}/url`,member)).status,403);
});
test('직접 업로드: 파일 크기 변조·만료·권한 회수는 원본 등록을 막음',async()=>{
 const orgId=await create(),pid=await project(orgId),mid=await join(orgId),objects=directStore(),path=`organizations/${orgId}/files`;
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:true});
 const reserve=()=>call(`${path}/prepare`,member,{projectId:pid,name:'field.xlsx',size:100});
 const wrong=await reserve();objects.set(`${orgId}/${wrong.id}`,101);assert.equal((await call(`${path}/complete`,member,{id:wrong.id})).status,400);assert.equal(objects.size,0);
 const expired=await reserve();objects.set(`${orgId}/${expired.id}`,100);await env.DB.prepare('UPDATE file_uploads SET expires_at=? WHERE id=?').bind('2000-01-01',expired.id).run();
 assert.equal((await call(`${path}/complete`,member,{id:expired.id})).status,410);
 const revoked=await reserve();objects.set(`${orgId}/${revoked.id}`,100);
 env.BUCKET!.head=async()=>{await call(`organizations/${orgId}/admin/members/${mid}`,owner,{role:'viewer',active:true});return{size:100};};
 assert.equal((await call(`${path}/complete`,member,{id:revoked.id})).status,403);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM files').first<{n:number}>())!.n,0);
});
test('직접 업로드: 미완료 예약도 조직 저장 한도에 포함하고 완료·읽기 전용 상태를 검사',async()=>{
 const orgId=await create(),pid=await project(orgId),path=`organizations/${orgId}/files`;directStore();
 // Even a declared one-byte upload reserves the bucket maximum until verified.
 const input={projectId:pid,name:'limit.bin',size:1};
 for(let i=0;i<20;i++)assert.equal((await call(`${path}/prepare`,owner,input)).status,201);
 assert.equal((await call(`${path}/prepare`,owner,input)).status,409);
 assert.equal((await call(`${path}/prepare`,owner,{...input,size:25*1024*1024+1})).status,400);
 const mid=await join(orgId,'viewer');await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:true});
 assert.equal((await call(`${path}/prepare`,member,{...input,size:1})).status,403);
});
test('PostgreSQL: 배치 실패는 전부 롤백하고 서버 역할은 DDL 권한이 없음',async()=>{
 const orgId=await create();
 await assert.rejects(env.DB.batch([env.DB.prepare('UPDATE organizations SET name=? WHERE id=?').bind('롤백될 이름',orgId),env.DB.prepare('INSERT INTO users (id,email,name,created_at) VALUES (?,?,?,?)').bind(owner.userId,'duplicate','duplicate','now')]));
 assert.equal((await load(orgId)).workspace.organization.name,'함께하는 조직');
 await assert.rejects(env.DB.prepare('CREATE TABLE value_lens.unwanted (id text)').run());
 await fixture.pg.exec('CREATE ROLE browser_anon NOLOGIN; SET ROLE browser_anon;');
 try{await assert.rejects(fixture.pg.query('SELECT * FROM value_lens.organizations'));}finally{await fixture.pg.exec('RESET ROLE');}
});
test('PostgreSQL: 같은 버전의 동시 수정 중 하나만 반영하고 감사 기록을 한 번 남김',async()=>{
 const orgId=await create(),pid=await project(orgId),w=await load(orgId),p=w.workspace.projects[0];
 const results=await Promise.all(['변경 A','변경 B'].map(name=>call(`organizations/${orgId}/commands`,owner,{id:crypto.randomUUID(),revision:w.workspace.revision,command:{type:'project.update',project:{...p,name},reason:'이름 수정'}})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM operations WHERE org_id=? AND action='project.update'").bind(orgId).first<{n:number}>())!.n,1);
});

test('집행 협업: 담당자 요청·보완·재요청과 관리자 승인·부분 지급을 서버 권한으로 구분',async()=>{
 const orgId=await create(),pid=await project(orgId),mid=await join(orgId),ownerMid=(await load(orgId)).access.memberId;
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:true});
 const line:Command={type:'budget.line.save',line:{id:'activities',orgId,projectId:pid,name:'현장 활동',fundingSource:'자체 재원',allocated:800000},reason:''};
 assert.equal((await cmd(orgId,line,member)).status,403);assert.equal((await cmd(orgId,line)).status,200);
 await cmd(orgId,{type:'activity.add',activity:{id:crypto.randomUUID(),orgId,projectId:pid,title:'견적과 지급 확인',body:'검증용 가상 자료',date:'2026-09-20',ownerId:mid,indicatorIds:[],evidence:[]}},member);
 const doc=(await load(orgId)).workspace.documents[0],evidence={documentId:doc.id,versionId:doc.versions[0].id};
 const expense={id:'req',orgId,projectId:pid,title:'활동 재료',amount:600000,date:'2026-09-20',ownerId:mid,status:'planned' as const,budgetLineId:'activities',evidence};
 assert.equal((await cmd(orgId,{type:'expense.add',expense:{...expense,ownerId:ownerMid}},member)).status,403);
 assert.equal((await cmd(orgId,{type:'expense.add',expense},member)).status,200);
 const before=(await load(orgId)).workspace;assert.equal(before.expenses[0].requestedById,mid);
 assert.equal((await cmd(orgId,{type:'expense.status',projectId:pid,expenseId:'req',status:'confirmed'})).status,400);
 const submit:Command={type:'expense.submit',projectId:pid,expenseId:'req'};assert.equal((await cmd(orgId,submit,member)).status,200);
 const review:Command={type:'expense.review',projectId:pid,expenseId:'req',decision:'returned',reason:'수량 기재'};
 assert.equal((await cmd(orgId,review,member)).status,403);assert.equal((await cmd(orgId,review)).status,200);
 assert.equal((await cmd(orgId,{type:'expense.update',projectId:pid,expenseId:'req',fields:{title:'재료 30개',amount:600000,date:'2026-09-20',ownerId:mid,evidence,budgetLineId:'activities'},reason:'단가·수량 확인'},member)).status,200);
 assert.equal((await cmd(orgId,submit,member)).status,200);assert.equal((await cmd(orgId,{...review,decision:'confirmed',reason:'견적 확인'})).status,200);
 assert.equal((await cmd(orgId,{type:'expense.cancel',projectId:pid,expenseId:'req',reason:'취소'},member)).status,403);
 const payment:Command={type:'expense.pay',projectId:pid,expenseId:'req',payment:{id:'payment',amount:200000,date:'2026-10-01',note:'가상 이체',evidence}};
 assert.equal((await cmd(orgId,payment,member)).status,403);
 const revision=(await load(orgId)).workspace.revision,operation=crypto.randomUUID();assert.equal((await cmd(orgId,payment,owner,revision,operation)).status,200);assert.equal((await cmd(orgId,payment,owner,revision,operation)).status,200);
 const paid=(await load(orgId)).workspace;assert.equal(paid.expenses[0].payments.length,1);assert.equal(paid.expenses[0].payments[0].actorId,ownerMid);assert.equal(paid.expenses[0].status,'confirmed');
 const forged={type:'expense.pay',projectId:pid,expenseId:'req',payment:{...payment.payment,id:'forged',actorId:mid}};
 assert.equal((await call(`organizations/${orgId}/commands`,owner,{id:crypto.randomUUID(),revision:paid.revision,command:forged})).status,400);
 assert.equal((await cmd(orgId,{type:'report.create',projectId:pid,asOf:'2026-10-05',periodStart:'2026-10-01',note:'월별 지급'})).status,200);
 const report=(await load(orgId)).workspace.reports[0];assert.equal(report.budget.spent,0);assert.equal(report.budget.paid,200000);assert.equal(report.finance.expenses[0].periodPaid,200000);
 await call(`organizations/${orgId}/admin/members/${mid}`,owner,{role:'viewer',active:true});assert.equal((await cmd(orgId,submit,member)).status,403);
});

test('예산 세목도 미배정 프로젝트에는 보이지 않고 타인 지출 변경은 거부',async()=>{
 const orgId=await create(),pid=await project(orgId),mid=await join(orgId);const ownerMid=(await load(orgId)).access.memberId;
 await cmd(orgId,{type:'budget.line.save',line:{id:'private-line',orgId,projectId:pid,name:'비공개 사업비',fundingSource:'사업 재원',allocated:1000000},reason:''});
 assert.deepEqual((await load(orgId,member)).workspace.budgetLines,[]);
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:true});assert.equal((await load(orgId,member)).workspace.budgetLines.length,1);
 await cmd(orgId,{type:'expense.add',expense:{id:'other-request',orgId,projectId:pid,title:'관리자 요청',amount:100,date:'2026-09-30',ownerId:ownerMid,status:'planned'}});
 assert.equal((await cmd(orgId,{type:'expense.cancel',projectId:pid,expenseId:'other-request',reason:'변경'},member)).status,403);
 assert.equal((await cmd(orgId,{type:'expense.submit',projectId:pid,expenseId:'other-request'},outsider)).status,403);
});

test('문서 AI 설계는 관리자·조직·원본 버전·설정·호출 한도를 검사하며 자동 실적을 만들지 않음',async()=>{
 const orgId=await create(),pid=await project(orgId);await join(orgId);
 await cmd(orgId,{type:'activity.add',activity:{id:crypto.randomUUID(),orgId,projectId:pid,title:'계획 메모',body:'올해 목표는 100명',date:'2026-09-30',ownerId:(await load(orgId)).access.memberId,indicatorIds:[],evidence:[]}});
 const before=(await load(orgId)).workspace,d=before.documents[0],input={documentId:d.id,versionId:d.versions[0].id,blocks:[{id:'1',location:'1행',text:'올해 목표는 100명'}]};
 const path=`organizations/${orgId}/planning-ai`;
 assert.equal((await call(path,member,input)).status,403);assert.equal((await call(path,outsider,input)).status,403);
 assert.equal((await call(path,owner,{...input,versionId:'not-here'})).status,404);assert.equal((await call(path,owner,input)).status,503);
 assert.equal((await call(path)).ready,false);
 env.OPENAI_API_KEY='test-key';env.OPENAI_MODEL='configured-test-model';assert.equal((await call(path)).ready,true);
 const fetchBefore=globalThis.fetch;let calls=0;
 globalThis.fetch=(async()=>{calls++;return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'확인할 내용',candidates:[]})}]}]});}) as typeof fetch;
 try {
  assert.equal((await call(path,owner,input)).status,200);
  for(let n=0;n<19;n++)await env.DB.prepare('INSERT INTO operations (id,org_id,actor_id,action,request_hash,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),orgId,owner.userId,'planning.ai','test',new Date().toISOString()).run();
  assert.equal((await call(path,owner,input)).status,429);assert.equal(calls,1);
  assert.deepEqual((await load(orgId)).workspace,before);
 } finally {globalThis.fetch=fetchBefore;}
});

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
 const expired=await invite(orgId);await env.DB.prepare("UPDATE invitations SET expires_at='2000-01-01' WHERE status='pending'").run();
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

async function issueKey(orgId:string,options={role:'member',days:7,maxUses:20}){const r=await call(`organizations/${orgId}/admin/join-keys`,owner,options);assert.equal(r.status,201);return r;}
test('조직 가입키: 이메일 사전 등록 없이 가입, 해시 보관, 프로젝트 접근은 별도 배정',async()=>{
 const orgId=await create(),pid=await project(orgId),key=await issueKey(orgId);
 assert.match(key.code,/^VL-([A-Z2-9]{4}-){3}[A-Z2-9]{4}$/);
 const stored=await env.DB.prepare('SELECT * FROM organization_join_keys WHERE id=?').bind(key.id).first<any>();
 assert.equal(stored.token_hash.length,64);assert.ok(!JSON.stringify(stored).includes(key.code));
 assert.equal((await call('organizations/join',null,{code:key.code})).status,401);
 const joined=await call('organizations/join',member,{code:key.code.toLowerCase().replaceAll('-',' ')});assert.equal(joined.status,200);assert.equal(joined.id,orgId);
 const workspace=await load(orgId,member);assert.equal(workspace.access.role,'member');assert.deepEqual(workspace.workspace.projects,[]);
 const repeated=await call('organizations/join',member,{code:key.code});assert.equal(repeated.alreadyMember,true);
 const list=await call(`organizations/${orgId}/admin/join-keys`);assert.equal(list.keys[0].uses,1);assert.equal(list.keys[0].token_hash,undefined);assert.equal(list.keys[0].code,undefined);
 assert.equal((await call(`organizations/${orgId}/admin/join-keys`,member)).status,403);
 assert.equal((await call(`organizations/${orgId}/admin/join-keys`,member,{role:'member',days:7,maxUses:3})).status,403);
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:workspace.access.memberId,assigned:true});
 assert.equal((await load(orgId,member)).workspace.projects.length,1);
});
test('가입키 갱신·폐기·만료·중지 조직·관리자 권한 발급 거부',async()=>{
 const orgId=await create(),old=await issueKey(orgId),fresh=await issueKey(orgId,{role:'viewer',days:1,maxUses:2});
 assert.equal((await call('organizations/join',member,{code:old.code})).status,410);
 assert.equal((await call(`organizations/${orgId}/admin/join-keys`,owner,{role:'admin',days:1,maxUses:1})).status,400);
 assert.equal((await call('organizations/join',member,{code:fresh.code})).status,200);
 const memberId=(await load(orgId,member)).access.memberId;
 assert.equal((await load(orgId,member)).access.role,'viewer');
 await call(`organizations/${orgId}/admin/members/${memberId}`,owner,{role:'viewer',active:false});
 assert.equal((await call('organizations/join',member,{code:fresh.code})).status,403);
 await call(`organizations/${orgId}/admin/join-keys/${fresh.id}`,owner,{},'DELETE');
 assert.equal((await call('organizations/join',outsider,{code:fresh.code})).status,410);
 const expired=await issueKey(orgId);await env.DB.prepare("UPDATE organization_join_keys SET expires_at='2020-01-01' WHERE id=?").bind(expired.id).run();
 assert.equal((await call('organizations/join',outsider,{code:expired.code})).status,410);
 const paused=await issueKey(orgId);await env.DB.prepare("UPDATE organizations SET status='suspended' WHERE id=?").bind(orgId).run();
 assert.equal((await call('organizations/join',outsider,{code:paused.code})).status,410);
});
test('가입키 인원 한도는 동시에 참여해도 초과되지 않으며 실패한 가입은 권한을 만들지 않음',async()=>{
 const orgId=await create(),key=await issueKey(orgId,{role:'member',days:7,maxUses:1});
 const results=await Promise.all([call('organizations/join',member,{code:key.code}),call('organizations/join',outsider,{code:key.code})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,410]);
 const list=await call(`organizations/${orgId}/admin/join-keys`);assert.equal(list.keys[0].uses,1);
 const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM memberships WHERE org_id=?').bind(orgId).first<any>();assert.equal(Number(count.n),2);
 const failed=results[0].status===410?member:outsider;assert.equal((await load(orgId,failed)).status,403);
});
test('가입키 추측 요청은 사용자별 10분 10회로 제한되고 시간 경과 뒤 다시 허용',async()=>{
 const orgId=await create(),key=await issueKey(orgId);
 for(let i=0;i<10;i++)assert.equal((await call('organizations/join',member,{code:'invalid-key'})).status,410);
 assert.equal((await call('organizations/join',member,{code:key.code})).status,429);
 assert.equal((await call('organizations/join',outsider,{code:key.code})).status,200);
 await env.DB.prepare("UPDATE join_key_attempts SET window_start='2020-01-01' WHERE user_id=?").bind(member.userId).run();
 assert.equal((await call('organizations/join',member,{code:key.code})).status,200);
});

test('협업: 댓글·확인 요청·수정 이력·삭제와 조직/프로젝트 권한',async()=>{
 const orgId=await create(),pid=await project(orgId),mid=await join(orgId),ownerId=(await load(orgId)).access.memberId;
 const path=`organizations/${orgId}/discussions`,list=`${path}?project=${pid}&type=project&target=${pid}`,alerts=`organizations/${orgId}/notifications`;
 const post={id:crypto.randomUUID(),target:{projectId:pid,type:'project',id:pid},body:'회의 결과를 확인해 주세요.',mentions:[mid]};
 assert.equal((await call(path,owner,post)).status,400); // not yet a project participant
 assert.equal((await call(list,member)).status,403);assert.equal((await call(list,outsider)).status,403);
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:true});
 assert.equal((await call(path,owner,post)).status,200);assert.equal((await call(path,owner,post)).status,200);
 assert.equal((await call(path,owner,{...post,body:'다른 요청'})).status,409);
 let page=await call(list,member);assert.equal(page.comments.length,1);assert.equal(page.comments[0].canEdit,false);
 let inbox=await call(alerts,member);assert.equal(inbox.unread,1);assert.equal((await call(alerts)).unread,0);
 assert.equal((await call(`organizations/${orgId}/changes`,member)).unread,1);
 await call(alerts,owner,{ids:[inbox.items[0].id]});assert.equal((await call(alerts,member)).unread,1);
 await call(alerts,member,{ids:[inbox.items[0].id]});assert.equal((await call(alerts,member)).unread,0);
 assert.equal((await call(`${path}/${post.id}`,member,{version:1,body:'침범',mentions:[]},'PATCH')).status,403);
 assert.equal((await call(`${path}/${post.id}`,owner,{version:1,body:'수정한 결과',mentions:[mid]},'PATCH')).status,200);
 assert.equal((await call(`${path}/${post.id}`,owner,{version:1,body:'오래된 탭',mentions:[]},'PATCH')).status,409);
 page=await call(list,member);assert.equal(page.comments[0].edits[0].body,post.body);assert.equal(page.comments[0].version,2);
 const reply={id:crypto.randomUUID(),target:post.target,body:'구성원 확인했습니다.',mentions:[ownerId]};
 assert.equal((await call(path,member,reply)).status,200);assert.equal((await call(alerts)).unread,1);
 assert.equal((await call(`${path}/${reply.id}`,owner,{version:1},'DELETE')).status,200); // manager moderation
 assert.equal((await call(`${path}/${post.id}`,owner,{version:2},'DELETE')).status,200);
 page=await call(list,member);assert.ok(page.comments.every((c:any)=>c.deletedAt&&c.body===''&&c.edits.length===0));
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:false});
 assert.equal((await call(alerts,member)).items.length,0);assert.equal((await call(`organizations/${orgId}/changes`,member)).unread,0);
 assert.equal((await call(list,member)).status,403);
 await call(`organizations/${orgId}/admin/members/${mid}`,owner,{role:'viewer',active:true});
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:true});
 assert.equal((await call(list,member)).canPost,false);
 assert.equal((await call(path,member,{...reply,id:crypto.randomUUID()})).status,403);
 const otherOrg=await create(outsider),otherPid=await project(orgId);
 assert.equal((await call(path,owner,{...post,id:crypto.randomUUID(),target:{projectId:otherPid,type:'project',id:pid}})).status,404);
 assert.equal((await call(`organizations/${otherOrg}/discussions/${post.id}`,outsider,{version:3},'DELETE')).status,404);
});

test('협업: 업무 배정/완료 및 실적 보완 알림은 성공한 저장에만 한 번 생성',async()=>{
 const {orgId,pid,mid,indicatorId,input}=await outcomeCase();
 await call(`organizations/${orgId}/admin/assignments`,owner,{projectId:pid,memberId:mid,assigned:true});
 const task={id:crypto.randomUUID(),orgId,projectId:pid,title:'현장 명부 확인',due:'2026-10-30',ownerId:mid,status:'todo' as const},command:Command={type:'task.add',task},requestId=crypto.randomUUID();
 const alerts=`organizations/${orgId}/notifications`;
 assert.equal((await cmd(orgId,command,owner,0)).status,409);assert.equal((await call(alerts,member)).unread,0);
 assert.equal((await cmd(orgId,command,owner,undefined,requestId)).status,200);assert.equal((await cmd(orgId,command,owner,undefined,requestId)).status,200);
 assert.equal((await call(alerts,member)).items.length,1);
 assert.equal((await cmd(orgId,{type:'task.status',projectId:pid,taskId:task.id,status:'done'},member)).status,200);
 assert.equal((await call(alerts)).items[0].kind,'task.status');
 const measurement={id:crypto.randomUUID(),orgId,projectId:pid,indicatorId,asOf:'2026-09-30',value:15,note:'현장 집계',evidence:{documentId:input.documentId,versionId:input.versionId},status:'pending' as const,createdAt:''};
 assert.equal((await cmd(orgId,{type:'measurement.add',measurement:{...measurement,createdById:'forged'}} as any,member)).status,400);
 assert.equal((await cmd(orgId,{type:'measurement.add',measurement},member)).status,200);
 assert.equal((await load(orgId)).workspace.measurements[0].createdById,mid);
 assert.equal((await call(alerts)).items[0].kind,'measurement.add');
 assert.equal((await cmd(orgId,{type:'measurement.reject',projectId:pid,measurementId:measurement.id,reason:'중복 확인 필요'})).status,200);
 assert.equal((await call(alerts,member)).items[0].kind,'measurement.reject');
 const pulse=await call(`organizations/${orgId}/changes`,member);assert.equal(pulse.revision,(await load(orgId,member)).workspace.revision);assert.ok(!('workspace' in pulse));
 await call(`organizations/${orgId}/admin/members/${mid}`,owner,{role:'member',active:false});
 assert.equal((await call(`organizations/${orgId}/changes`,member)).status,403);
});

test('협업: 댓글 페이지 분할·연속 작성 제한·보관 후 읽기 전용',async()=>{
 const orgId=await create(),pid=await project(orgId),path=`organizations/${orgId}/discussions`,list=`${path}?project=${pid}&type=project&target=${pid}`;
 for(let i=0;i<53;i++)await env.DB.prepare('INSERT INTO project_comments(id,org_id,project_id,target_type,target_id,author_id,body,request_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),orgId,pid,'project',pid,owner.userId,`댓글 ${i}`,'fixture',new Date().toISOString()).run();
 const recent=await call(list);assert.equal(recent.comments.length,50);assert.equal(recent.comments[0].body,'댓글 3');assert.ok(recent.nextCursor);
 const old=await call(`${list}&before=${recent.nextCursor}`);assert.equal(old.comments.length,3);assert.equal(old.nextCursor,null);
 assert.equal((await call(path,owner,{id:crypto.randomUUID(),target:{projectId:pid,type:'project',id:pid},body:'너무 빠른 작성',mentions:[]})).status,429);
 const state=(await load(orgId)).workspace;state.projects[0].status='archived';await env.DB.prepare('UPDATE organizations SET body=?,revision=revision+1 WHERE id=?').bind(JSON.stringify(state),orgId).run();
 assert.equal((await call(list)).canPost,false);
 assert.equal((await call(`${path}/${recent.comments[0].id}`,owner,{version:1},'DELETE')).status,403);
 // Browser roles never receive grants to these private application tables.
 await fixture.pg.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN');
 const grants=await fixture.pg.query("SELECT has_table_privilege('anon','value_lens.project_comments','SELECT') AS comments,has_table_privilege('authenticated','value_lens.notifications','SELECT') AS notifications");
 assert.deepEqual(grants.rows,[{comments:false,notifications:false}]);
});
