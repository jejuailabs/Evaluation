import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createSeed} from '../src/domain/seed';
import {execute} from '../src/domain/commands';
import {commandSchema} from '../server/commands-schema';
import {transcribeAudio,validateAudio} from '../server/meeting-ai';
import {handleApi,type Identity,type Services} from '../server/api';
import {postgresFixture} from './postgres-fixture';
import type {Command,Workspace} from '../src/domain/types';
const now='2026-10-06T10:00:00.000Z',later='2026-10-06T10:03:00.000Z';
const wave=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WAVEfmt '),Buffer.alloc(44)]);
function audioState(){return execute(createSeed(),{type:'intake.add',id:'audio',title:'돌봄 회의',note:'',source:{kind:'file',version:{id:'voice',name:'회의.wav',size:wave.length,blobKey:'voice',createdAt:now}}},now,'m2');}
test('회의: AI 원문 보존, 확인 전 연결 거절, 검토 기록·원본·업무·목표를 원자적으로 연결',()=>{
 let s=audioState();s=execute(s,{type:'intake.transcription.start',id:'audio',attemptId:'first'},now,'m2');
 assert.throws(()=>execute(s,{type:'intake.archive',id:'audio',archived:true,reason:'보관'},now),/진행/);
 s=execute(s,{type:'intake.transcription.finish',id:'audio',attemptId:'first',result:{text:'열 명 방문',model:'model'}},now,'m2');
 assert.throws(()=>execute(s,{type:'intake.assign',id:'audio',projectId:'care'},now),/검토/);
 s=execute(s,{type:'intake.meeting.save',id:'audio',expectedRevision:1,text:'일곱 명 방문',notes:'중복 제외 7명. 명부를 다시 확인한다.',reviewed:true},now,'m2');
 assert.equal(s.intakeItems![0].meeting?.originalText,'열 명 방문');assert.equal(s.intakeItems![0].meeting?.reviewedById,'m2');
 const before=structuredClone(s);
 assert.throws(()=>execute(s,{type:'intake.assign',id:'audio',projectId:'care',activity:{date:'2026-10-05',body:'회의 기록',indicatorIds:['wrong']}},now));assert.deepEqual(s,before);
 s=execute(s,{type:'intake.assign',id:'audio',projectId:'care',activity:{date:'2026-10-05',body:'회의 기록',taskId:'t1',indicatorIds:['i1']}},now,'m2');
 const item=s.intakeItems![0],record=s.documents.find(d=>d.id===item.meetingDocumentId)!;
 assert.match(record.versions[0].inlineText!,/일곱 명/);assert.equal(s.activities![0].evidence.length,2);assert.equal(s.activities![0].taskId,'t1');
 assert.deepEqual(s.documents.find(d=>d.id===item.documentId)!.versions[0],before.intakeItems![0].version);assert.deepEqual(s.measurements,before.measurements);
 assert.throws(()=>execute(s,{type:'intake.meeting.save',id:'audio',expectedRevision:2,text:'수정',notes:'변경',reviewed:true},now),/대기/);
});
test('회의: 중단된 전사 복구, 오래된 응답과 초안 충돌 거절, 수정을 저장하면 재검토 필요',()=>{
 let s=execute(audioState(),{type:'intake.transcription.start',id:'audio',attemptId:'old'},now);
 assert.throws(()=>execute(s,{type:'intake.transcription.start',id:'audio',attemptId:'new'},now),/진행/);
 s=execute(s,{type:'intake.transcription.start',id:'audio',attemptId:'new'},later);
 assert.throws(()=>execute(s,{type:'intake.transcription.finish',id:'audio',attemptId:'old',result:{text:'오래된 결과',model:'model'}},later),/상태/);
 s=execute(s,{type:'intake.transcription.finish',id:'audio',attemptId:'new',result:{error:'시간 초과'}},later);
 s=execute(s,{type:'intake.meeting.save',id:'audio',expectedRevision:0,text:'직접 작성',notes:'결정 사항',reviewed:true},later);
 assert.throws(()=>execute(s,{type:'intake.meeting.save',id:'audio',expectedRevision:0,text:'오래된 편집',notes:'결정',reviewed:true},later),/수정/);
 s=execute(s,{type:'intake.meeting.save',id:'audio',expectedRevision:1,text:'수정한 직접 작성',notes:'결정',reviewed:false},later);
 assert.equal(s.intakeItems![0].meeting?.reviewedAt,undefined);assert.equal(s.intakeItems![0].meeting?.method,'manual');
 for(const type of ['intake.transcription.start','intake.transcription.finish'])assert.equal(commandSchema.safeParse({type,id:'audio',attemptId:'forged',result:{text:'가짜 AI',model:'model'}}).success,false);
 assert.equal(commandSchema.safeParse({type:'intake.meeting.save',id:'audio',expectedRevision:0,text:'직접',notes:'',reviewed:false,originalText:'위조'}).success,false);
});
test('전사 제공자: 실제 multipart 계약, 파일 형식·빈 결과·길이·오류를 검증',async()=>{
 assert.equal(validateAudio('meeting.wav',wave),'audio/wav');assert.throws(()=>validateAudio('meeting.mp3',wave),/확장자/);assert.throws(()=>validateAudio('meeting.txt',wave),/음성/);
 const invoke=(data:unknown,status=200)=>transcribeAudio({OPENAI_API_KEY:'test'},'회의.wav',wave,(async(_url,init)=>{
  assert.equal(_url,'https://api.openai.com/v1/audio/transcriptions');const form=init!.body as FormData;assert.equal(form.get('language'),'ko');assert.equal(form.get('response_format'),'json');assert.equal((form.get('file') as File).size,wave.length);return Response.json(data,{status});
 }) as typeof fetch);
 assert.equal((await invoke({text:' 회의 기록 '})).text,'회의 기록');await assert.rejects(()=>invoke({text:''}),/문장/);await assert.rejects(()=>invoke({text:'x'.repeat(30001)}),/30,000/);await assert.rejects(()=>invoke({error:'provider secret'},500),/원본/);
});

let fixture:Awaited<ReturnType<typeof postgresFixture>>;
after(async()=>{await fixture?.close();});
test('회의 API: 권한 격리·중복 호출·실패 재시도·저장/재조회·프로젝트 권한 이전·사용량 한도',async()=>{
 fixture=await postgresFixture();const objects=new Map<string,Uint8Array>(),owner:Identity={userId:'meeting-owner',email:'owner@meeting.example',displayName:'대표'},member:Identity={userId:'meeting-member',email:'member@meeting.example',displayName:'담당'},peer:Identity={userId:'meeting-peer',email:'peer@meeting.example',displayName:'동료'};
 const env:Services={DB:fixture.db,OPENAI_API_KEY:'test',BUCKET:{put:async()=>{},delete:async()=>{},get:async key=>objects.has(key)?{body:objects.get(key)! as BodyInit}:null,signUpload:async()=>'',head:async key=>objects.has(key)?{size:objects.get(key)!.length}:null}};
 async function call(path:string,data?:unknown,user:Identity|null=owner){const r=await handleApi(new Request(`https://app.example/api/${path}`,{method:data?'POST':'GET',headers:{Origin:'https://app.example','X-Value-Lens':'1'},body:data?JSON.stringify(data):undefined}),env,user);return {status:r.status,...await r.json() as any};}
 const org=(await call('organizations',{name:'회의 검증'})).id,root=`organizations/${org}`;
 const state=async(user=owner)=>(await call(`${root}/workspace`,undefined,user)).workspace as Workspace;
 async function cmd(command:Command,user=owner){return call(`${root}/commands`,{id:crypto.randomUUID(),revision:(await state()).revision,command},user);}
 for(const user of [member,peer]){const invite=await call(`${root}/admin/invitations`,{email:user.email,role:'member'});assert.equal((await call('invitations/accept',{token:invite.url.split('/invite/')[1]},user)).status,200);}
 const mid=(await call(`${root}/workspace`,undefined,member)).access.memberId;
 async function add(id:string,user=member){const uploaded=await call(`${root}/files/prepare`,{projectId:null,name:'회의.wav',size:wave.length},user);objects.set(`${org}/${uploaded.id}`,wave);const v=await call(`${root}/files/complete`,{id:uploaded.id},user);const {status:_,...version}=v;assert.equal((await cmd({type:'intake.add',id,title:'회의',note:'',source:{kind:'file',version}},user)).status,200);return version;}
 await add('audio');const path=`${root}/meeting-ai`;
 assert.equal((await call(path,{id:'audio'},null)).status,401);assert.equal((await call(path,{id:'audio'},peer)).status,403);
 assert.equal((await call(`${root}/commands`,{id:crypto.randomUUID(),revision:(await state()).revision,command:{type:'intake.transcription.start',id:'audio',attemptId:'forged'}})).status,400);
 const originalFetch=globalThis.fetch;let paid=0,fail=true;let release:()=>void=()=>{},entered:()=>void=()=>{};let gate:Promise<void>|undefined;
 globalThis.fetch=(async()=>{paid++;entered();if(gate)await gate;return fail?Response.json({error:'provider details'},{status:500}):Response.json({text:'오늘 방문은 일곱 명입니다.'});}) as typeof fetch;
 try{
  assert.equal((await call(path,{id:'audio'},member)).status,502);assert.equal((await state()).intakeItems![0].transcription?.status,'failed');fail=false;
  const atProvider=new Promise<void>(r=>{entered=r;});gate=new Promise<void>(r=>{release=r;});const pending=call(path,{id:'audio'},member);await atProvider;
  assert.equal((await call(path,{id:'audio'},member)).status,409);assert.equal(paid,2);
  assert.equal((await cmd({type:'intake.add',id:'concurrent',title:'다른 구성원의 메모',note:'',source:{kind:'text',text:'전사 중 별도로 남긴 기록'}})).status,200);
  release();const finished=await pending;assert.equal(finished.status,200);assert.ok((await state()).intakeItems!.some(i=>i.id==='concurrent'));gate=undefined;
  assert.equal((await call(path,{id:'audio'},member)).status,200);assert.equal(paid,2);assert.equal((await state(peer)).intakeItems!.length,0);
  assert.equal((await cmd({type:'intake.meeting.save',id:'audio',expectedRevision:1,text:'오늘 방문은 여섯 명입니다.',notes:'중복 확인 후 명부 보완',reviewed:true},member)).status,200);
  const project={id:'care',orgId:org,name:'돌봄',purpose:'방문',start:'2026-01-01',end:'2027-12-31',ownerId:(await state()).members[0].id,budget:0,category:'돌봄'};
  assert.equal((await cmd({type:'project.add',project})).status,200);
  assert.equal((await cmd({type:'intake.assign',id:'audio',projectId:'care'},member)).status,403);
  assert.equal((await cmd({type:'intake.assign',id:'audio',projectId:'care',activity:{date:'2026-10-05',body:'검토한 회의 내용',indicatorIds:[]}})).status,200);
  assert.equal((await state(member)).intakeItems!.length,0);assert.equal((await call(path,{id:'audio'},member)).status,403);
  await call(`${root}/admin/assignments`,{projectId:'care',memberId:mid,assigned:true});const linked=await state(member);assert.equal(linked.intakeItems![0].meeting?.originalText,'오늘 방문은 일곱 명입니다.');assert.equal(linked.activities![0].evidence.length,2);assert.equal(linked.measurements.length,0);
  await add('limit');for(let i=0;i<18;i++)await fixture.db.prepare("INSERT INTO operations(id,org_id,actor_id,action,request_hash,created_at) VALUES (?,?,?,'intake.transcription.start','',?)").bind(crypto.randomUUID(),org,owner.userId,new Date().toISOString()).run();
  assert.equal((await call(path,{id:'limit'},member)).status,429);assert.equal(paid,2);
 }finally{globalThis.fetch=originalFetch;}
});

test('회의 API: 전사 도중 권한 회수하면 결과를 노출하거나 저장하지 않음',async()=>{
 const owner:Identity={userId:'race-owner',email:'race-owner@meeting.example',displayName:'대표'},member:Identity={userId:'race-member',email:'race-member@meeting.example',displayName:'담당'};
 const env:Services={DB:fixture.db,OPENAI_API_KEY:'test',BUCKET:{put:async()=>{},delete:async()=>{},get:async()=>({body:wave}),signUpload:async()=>'',head:async()=>({size:wave.length})}};
 async function call(path:string,data?:unknown,user=owner){const r=await handleApi(new Request(`https://app.example/api/${path}`,{method:data?'POST':'GET',headers:{Origin:'https://app.example','X-Value-Lens':'1'},body:data?JSON.stringify(data):undefined}),env,user);return {status:r.status,...await r.json() as any};}
 const org=(await call('organizations',{name:'권한 변경'})).id,root=`organizations/${org}`,invite=await call(`${root}/admin/invitations`,{email:member.email,role:'member'});await call('invitations/accept',{token:invite.url.split('/invite/')[1]},member);
 const w=await call(`${root}/workspace`,undefined,member),upload=await call(`${root}/files/prepare`,{projectId:null,name:'voice.wav',size:wave.length},member),v=await call(`${root}/files/complete`,{id:upload.id},member);const {status:_,...version}=v;
 await call(`${root}/commands`,{id:crypto.randomUUID(),revision:w.workspace.revision,command:{type:'intake.add',id:'race',title:'비공개 회의',note:'',source:{kind:'file',version}}},member);
 const originalFetch=globalThis.fetch;globalThis.fetch=(async()=>{await call(`${root}/admin/members/${w.access.memberId}`,{role:'viewer',active:true});return Response.json({text:'비공개 전사 결과'});}) as typeof fetch;
 try{const result=await call(`${root}/meeting-ai`,{id:'race'},member);assert.equal(result.status,403);assert.ok(!JSON.stringify(result).includes('비공개 전사 결과'));assert.equal((await call(`${root}/workspace`)).workspace.intakeItems[0].meeting,undefined);}finally{globalThis.fetch=originalFetch;}
});
