import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {createSeed} from '../src/domain/seed';
import {execute} from '../src/domain/commands';
import type {Command,Workspace} from '../src/domain/types';
import {reportStatus,reportVersion,type ReportAction} from '../src/domain/report-workflow';
import {commandSchema} from '../server/commands-schema';
import {authorizeCommand,visibleWorkspace,type Actor} from '../server/policy';
import {handleApi,type Identity,type Services} from '../server/api';
import {reportHTML,annualReportHTML} from '../src/infrastructure/report';
import {reportDOCX} from '../src/infrastructure/report-docx';
import {reportXLSX} from '../src/infrastructure/report-xlsx';
import {postgresFixture} from './postgres-fixture';

const now='2026-10-06T10:00:00.000Z';
function state(){return execute(createSeed(),{type:'report.create',projectId:'care',asOf:'2026-09-30',note:'최초 해석'},now,'m2');}
function operation(s:Workspace,op:ReportAction,id=s.reports[0].id,kind:'project'|'annual'='project'):Extract<Command,{type:'report.workflow'}>{return {type:'report.workflow',kind,reportId:id,expectedVersion:reportVersion((kind==='annual'?s.annualReports!:s.reports).find(r=>r.id===id)!),operation:op};}
const act=(s:Workspace,op:ReportAction,id?:string)=>execute(s,operation(s,op,id),now,'m1');
const request:ReportAction={action:'request',recipient:'제주 지원센터',reason:'분기 결과 검토'};
const submit:ReportAction={action:'submit',date:'2026-10-06',recipient:'제주 지원센터',channel:'portal',reference:'접수 42',format:'pdf',reason:'기관 포털 등록 완료'};
function content(r:any){const {workflow,...snapshot}=r;return snapshot;}

test('보고서: 요청·보완·수정본·승인·제출을 연결하고 원본 스냅샷을 보존',()=>{
 let s=state();const original=structuredClone(s.reports[0]),id=original.id;
 assert.throws(()=>act(s,submit),/상태/);
 s=act(s,request);s=act(s,{action:'return',reason:'현장 해석을 보완해 주세요'});
 assert.throws(()=>act(s,request),/상태/);
 s=act(s,{action:'revise',note:'보완한 해석',reason:'현장 기록 추가'});const revised=s.reports[0];
 assert.equal(revised.previousReportId,id);assert.equal(revised.createdById,'m1');assert.equal(reportStatus(revised),'draft');
 assert.deepEqual(content(s.reports.find(r=>r.id===id)),content(original));assert.equal(s.reports.find(r=>r.id===id)!.workflow!.status,'returned');
 assert.throws(()=>act(s,{action:'revise',note:'중복',reason:'다시'},id),/이미 수정본/);
 s=act(s,request);s=act(s,{action:'approve',reason:'근거·집계 확인'});const before=content(s.reports[0]);s=act(s,submit);
 assert.equal(reportStatus(s.reports[0]),'submitted');assert.deepEqual(content(s.reports[0]),before);assert.equal(s.reports[0].workflow!.submissions[0].actorName,s.members.find(m=>m.id==='m1')!.name);
 assert.throws(()=>act(s,{action:'revoke',reason:'철회'}),/상태/);assert.throws(()=>act(s,submit),/이미/);
 const submissionId=s.reports[0].workflow!.submissions[0].id;s=act(s,{action:'void',submissionId,reason:'접수번호 오기'});
 assert.equal(reportStatus(s.reports[0]),'approved');assert.equal(s.reports[0].workflow!.submissions.length,1);assert.equal(s.reports[0].workflow!.submissions[0].voided!.reason,'접수번호 오기');
 s=act(s,{action:'revoke',reason:'재검토 필요'});assert.equal(reportStatus(s.reports[0]),'draft');
});

test('보고서: 충돌·미래/승인 전 제출·공백 사유 거절, 철회와 보관 프로젝트 지원',()=>{
 let s=state();const old=operation(s,request);s=execute(s,old,now,'m2');const frozen=structuredClone(s);
 assert.throws(()=>execute(s,old,now),/다른 사람/);assert.deepEqual(s,frozen);
 s=act(s,{action:'withdraw',reason:'기간 확인'});assert.equal(reportStatus(s.reports[0]),'draft');
 s.projects.find(p=>p.id==='care')!.status='archived';s=act(s,request);s=act(s,{action:'approve',reason:'확인'});
 for(const date of ['2026-02-30','2026-10-07','2026-10-05'])assert.throws(()=>act(s,{...submit,action:'submit',date}),/제출|승인일/);
 assert.throws(()=>act(s,{action:'revoke',reason:'  '}),/사유/);
 const oldReport=s.reports[0].id;s=act(s,{action:'revise',reason:'마감 후 정정',note:'최종 정정'});assert.equal(s.reports[0].previousReportId,oldReport);assert.equal(reportStatus(s.reports[0]),'draft');
});

test('보고서: 작성자·관리자 권한, 프로젝트와 연간 자료 격리, 외부 상태 위조 거절',()=>{
 const s=state(),member:Actor={userId:'member',memberId:'m2',role:'member',projects:['care']},requestCommand=operation(s,request);
 authorizeCommand(member,requestCommand,s);assert.throws(()=>authorizeCommand({...member,memberId:'m3'},requestCommand,s),/본인/);
 assert.throws(()=>authorizeCommand({...member,projects:[]},requestCommand,s),/참여/);
 assert.throws(()=>authorizeCommand({...member,role:'viewer'},requestCommand,s),/읽기/);
 for(const action of ['approve','return','revoke'] as const)assert.throws(()=>authorizeCommand(member,operation(s,{action,reason:'위조'}),s),/관리자/);
 assert.equal(commandSchema.safeParse({...requestCommand,actorId:'admin'}).success,false);
 assert.equal(commandSchema.safeParse({...requestCommand,operation:{...request,history:[]}}).success,false);
 assert.equal(visibleWorkspace(s,{...member,projects:[]}).reports.length,0);
});

test('연간 보고서: 동일한 승인 절차, 새 수정본에 최신 기록 반영, 일반 구성원 차단',()=>{
 let s=createSeed();const plan=s.annualPlans![0];
 s=execute(s,{type:'annual.report.create',planId:plan.id,start:'2026-01-01',end:'2026-09-30',note:'연간 점검'},now,'m1');const id=s.annualReports![0].id;
 const step=(op:ReportAction)=>{s=execute(s,operation(s,op,id,'annual'),now,'m1');};
 assert.throws(()=>authorizeCommand({userId:'x',memberId:'m2',role:'member',projects:['care']},operation(s,request,id,'annual'),s),/관리자/);
 step(request);step({action:'approve',reason:'연간 근거 확인'});step(submit);const before=content(s.annualReports![0]);
 s.annualPlans![0].purpose='새 계획 설명';step({action:'revise',reason:'계획 변경 반영',note:'수정 점검'});
 assert.deepEqual(content(s.annualReports!.find(r=>r.id===id)),before);assert.equal(s.annualReports![0].purpose,'새 계획 설명');assert.equal(s.annualReports![0].previousReportId,id);assert.equal(reportStatus(s.annualReports![0]),'draft');
 assert.match(annualReportHTML(s.annualReports![1]),/제출 기록 있음/);
});

test('보고서 출력: Word·Excel·HTML에 동일한 승인·제출/무효 이력, HTML·수식 주입 방어',async()=>{
 let s=act(act(state(),request),{action:'approve',reason:'<script>검토</script>'});s=act(s,{...submit,action:'submit',reference:'=HYPERLINK("악성")'});
 s=act(s,{action:'void',submissionId:s.reports[0].workflow!.submissions[0].id,reason:'잘못된 번호'});const r=s.reports[0];
 const html=reportHTML(r);assert.match(html,/내부 승인/);assert.match(html,/무효 기록: 잘못된 번호/);assert.doesNotMatch(html,/<script>/);
 const doc=unzipSync(new Uint8Array(await(await reportDOCX(r)).arrayBuffer()));const word=strFromU8(doc['word/document.xml']);assert.match(word,/승인·제출 이력/);assert.match(word,/잘못된 번호/);assert.match(word,/접수·승인을 자동 확인하지/);
 const excel=Object.values(unzipSync(reportXLSX(r))).map(v=>strFromU8(v)).join('');assert.match(excel,/잘못된 번호/);assert.match(excel,/HYPERLINK/);assert.doesNotMatch(excel,/<f>/);
});

let fixture:Awaited<ReturnType<typeof postgresFixture>>;
after(async()=>{await fixture?.close();});
test('보고서 API: 실 DB 저장·작성자 식별·권한·알림·중복 재시도·동시 승인·재조회',async()=>{
 fixture=await postgresFixture();const env:Services={DB:fixture.db,BUCKET:{put:async()=>{},delete:async()=>{},get:async()=>null}},owner:Identity={userId:'report-owner',email:'owner@report.example',displayName:'대표'},member:Identity={userId:'report-member',email:'member@report.example',displayName:'보고 담당'},peer:Identity={userId:'report-peer',email:'peer@report.example',displayName:'동료'};
 async function call(path:string,data?:unknown,user=owner){const response=await handleApi(new Request(`https://app.example/api/${path}`,{method:data?'POST':'GET',headers:{Origin:'https://app.example','X-Value-Lens':'1'},body:data?JSON.stringify(data):undefined}),env,user);return {status:response.status,...await response.json() as any};}
 const org=(await call('organizations',{name:'보고서 검증'})).id,root=`organizations/${org}`,load=async(user=owner)=>(await call(`${root}/workspace`,undefined,user)).workspace as Workspace;
 const cmd=async(command:Command,user=owner,id=crypto.randomUUID(),revision?:number)=>call(`${root}/commands`,{id,revision:revision??(await load()).revision,command},user);
 for(const user of [member,peer]){const invite=await call(`${root}/admin/invitations`,{email:user.email,role:'member'});assert.equal((await call('invitations/accept',{token:invite.url.split('/invite/')[1]},user)).status,200);}
 const mid=(await call(`${root}/workspace`,undefined,member)).access.memberId;
 const initial=await load();await cmd({type:'project.add',project:{id:'care',orgId:org,name:'돌봄',purpose:'지역 지원',start:'2026-01-01',end:'2027-12-31',ownerId:initial.members[0].id,budget:0,category:'돌봄'}});
 const create:Command={type:'report.create',projectId:'care',asOf:'2026-09-30',note:'분기 보고'};assert.equal((await cmd(create,member)).status,403);
 await call(`${root}/admin/assignments`,{projectId:'care',memberId:mid,assigned:true});assert.equal((await cmd(create,member)).status,200);
 let s=await load();const rid=s.reports[0].id;assert.equal(s.reports[0].createdById,mid);assert.equal((await load(peer)).reports.length,0);
 const requestCommand=operation(s,request),requestId=crypto.randomUUID();assert.equal((await cmd(requestCommand,member,requestId,s.revision)).status,200);assert.equal((await cmd(requestCommand,member,requestId,s.revision)).status,200);
 let notifications=await call(`${root}/notifications`);assert.equal(notifications.items.filter((x:any)=>x.kind==='report.workflow').length,1);assert.equal(notifications.items[0].target.id,rid);
 s=await load();const approval=operation(s,{action:'approve',reason:'대조 완료'});
 assert.equal((await cmd(approval,member)).status,403);assert.equal((await cmd(approval,peer)).status,403);
 const decisions=await Promise.all([cmd(approval,owner,crypto.randomUUID(),s.revision),cmd(operation(s,{action:'return',reason:'보완'}),owner,crypto.randomUUID(),s.revision)]);
 assert.deepEqual(decisions.map(x=>x.status).sort(),[200,409]);s=await load();assert.equal(s.reports[0].workflow!.history.length,2);
 notifications=await call(`${root}/notifications`,undefined,member);assert.equal(notifications.items.filter((x:any)=>x.kind==='report.workflow').length,1);
 assert.equal((await cmd({...requestCommand,expectedVersion:0},member)).status,400);
 const result=await cmd(operation(s,{action:'revise',reason:'자료 추가',note:'수정본'}),member);assert.equal(result.status,200);const latest=await load(member);assert.equal(latest.reports[0].previousReportId,rid);assert.equal(latest.reports[0].createdById,mid);
 await call(`${root}/admin/assignments`,{projectId:'care',memberId:mid,assigned:false});assert.equal((await load(member)).reports.length,0);assert.equal((await call(`${root}/notifications`,undefined,member)).items.length,0);assert.equal((await cmd(operation(latest,request),member)).status,403);
});
