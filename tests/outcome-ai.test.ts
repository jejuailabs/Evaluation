import {test} from 'node:test';
import assert from 'node:assert/strict';
import {strToU8,zipSync} from 'fflate';
import {outcomeInput,validateOutcomes,suggestOutcomes,signOutcome,verifyOutcome} from '../server/outcome-ai';
import type {Indicator,Measurement,Project} from '../src/domain/types';
import type {OutcomeCandidate} from '../src/domain/outcome-analysis';

const project:Project={id:'p',orgId:'o',name:'돌봄',purpose:'고립 완화',start:'2026-01-01',end:'2026-12-31',ownerId:'m',budget:0,category:'돌봄'};
const indicator:Indicator={id:'i',orgId:'o',projectId:'p',name:'고유 참여자',unit:'명',definition:'중복 제외 실제 참여자',aggregation:'cumulative-snapshot',direction:'higher',target:100,forecast:null,forecastNote:'',source:'우리 조직 지표',version:1};
const text='2026-09-30 기준 실제 고유 참여자는 15명이다. 중복은 제외했다.';
const source=outcomeInput({name:'결과.txt'},strToU8(text));
const candidate:OutcomeCandidate={indicatorId:'i',value:15,denominator:null,assessment:null,asOf:'2026-09-30',periodStart:null,blockId:'line:1',location:'조작한 위치',quote:text,explanation:'중복 제외 실제 인원을 기록했다.',uncertainty:'명부와 재확인'};
const result={summary:'실행 결과',candidates:[candidate]};
const env={OPENAI_API_KEY:'test-only-key',OPENAI_MODEL:'configured-model'};

test('현장 원본: 서버가 Office·텍스트를 읽고 행 위치를 보존, 초과는 부분 분석 대신 명시적 거절',()=>{
 assert.equal(source.blocks[0].location,'1행');
 assert.throws(()=>outcomeInput({name:'기록.txt'},strToU8(Array(201).fill('기록').join('\n'))),/분석 한도/);
 assert.throws(()=>outcomeInput({name:'기록.txt'},strToU8('x'.repeat(30001))),/분석 한도/);
 assert.throws(()=>outcomeInput({name:'file.hwp'},strToU8('old')),/지원/);
 assert.throws(()=>outcomeInput({name:'fake.png'},strToU8('not image')),/확장자/);
 assert.throws(()=>outcomeInput({name:'huge.pdf'},new Uint8Array(5*1024*1024+1)),/5MB/);
 const xlsx=zipSync({'xl/worksheets/sheet1.xml':strToU8('<worksheet><sheetData><row r="7"><c r="A7" t="inlineStr"><is><t>실제 참여자 15명</t></is></c></row></sheetData></worksheet>')});
 const sheet=outcomeInput({name:'현장.xlsx'},xlsx);assert.match(sheet.blocks[0].location,/7행/);assert.match(sheet.blocks[0].text,/A7: 실제 참여자 15명/);
});
test('AI 결과는 실제 인용·지표·집계 단위·날짜를 검증하고 모르는 수치는 null 보존',()=>{
 assert.equal(validateOutcomes(result,source,[indicator],project).candidates[0].location,'1행');
 assert.equal(validateOutcomes({...result,candidates:[{...candidate,value:null,asOf:null}]},source,[indicator],project).candidates[0].value,null);
 for(const change of [{quote:'없는 문장'},{indicatorId:'foreign'},{asOf:'2026-02-30'},{asOf:'2025-12-31'},{asOf:'2099-12-31'},{periodStart:'2026-10-01'},{value:-1},{denominator:20},{assessment:'achieved'}])assert.throws(()=>validateOutcomes({...result,candidates:[{...candidate,...change}]},source,[indicator],project));
 const ratio={...indicator,aggregation:'ratio' as const};assert.throws(()=>validateOutcomes({...result,candidates:[{...candidate,denominator:10}]},source,[ratio],project));
 assert.throws(()=>validateOutcomes(result,source,[{...indicator,aggregation:'qualitative'}],project));
});
test('이미지/PDF는 서버가 고른 원본만 전송하고 텍스트 인용 대조로 잘못 표시하지 않음',async()=>{
 for(const [name,data,kind,field] of [['scan.png',Buffer.from('89504e470d0a1a0a','hex'),'image','image_url'],['report.pdf',strToU8('%PDF-1.4 test fixture'),'pdf','file_data']] as const){
  const input=outcomeInput({name},data);assert.equal(input.kind,kind);assert.deepEqual(input.blocks,[]);assert.match(String(input.media?.[field]),/^data:/);
  const r=await suggestOutcomes(env,input,[indicator],project,(async(_url,init)=>{const b=JSON.parse(init!.body as string);assert.equal(b.store,false);assert.equal(b.tools,undefined);assert.equal(b.text.format.strict,true);assert.equal(b.input[0].content[1][field],input.media?.[field]);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({...result,candidates:[{...candidate,blockId:null,location:'1페이지 표'}]})}]}]});}) as typeof fetch);
  assert.equal(r.candidates[0].location,'1페이지 표');
 }
});
test('설정·거부·중단·오류에서 비밀 원문을 노출하거나 실적을 생성하지 않음',async()=>{
 let calls=0;await assert.rejects(suggestOutcomes({},source,[indicator],project,(async()=>{calls++;return new Response();}) as typeof fetch),/연결되지/);assert.equal(calls,0);
 for(const response of [new Response('upstream-secret',{status:429}),Response.json({status:'incomplete'}),Response.json({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]})])await assert.rejects(suggestOutcomes(env,source,[indicator],project,(async()=>response) as typeof fetch),e=>!String(e).includes('upstream-secret'));
});
test('서명된 제안은 조직·작성자·지표 버전·원본에 묶이고 값 수정 후에도 최초 제안을 보존',()=>{
 const evidence={documentId:'d',versionId:'v'}, token=signOutcome(env,{orgId:'o',projectId:'p',userId:'u',evidence},candidate,indicator,source);
 const measurement:Measurement={id:'m',orgId:'o',projectId:'p',indicatorId:'i',evidence,asOf:'2026-09-30',value:14,note:'중복 1명 추가 제외',createdAt:'',status:'pending'};
 const provenance=verifyOutcome(env,token,'u','member',measurement,indicator);assert.equal(provenance.proposed.value,15);assert.equal(provenance.reviewedBy,'member');assert.equal(measurement.value,14);
 for(const m of [{...measurement,orgId:'other'},{...measurement,projectId:'other'},{...measurement,indicatorId:'other'},{...measurement,evidence:{...evidence,versionId:'other'}}])assert.throws(()=>verifyOutcome(env,token,'u','member',m,indicator),/変|만료/);
 assert.throws(()=>verifyOutcome(env,token,'other','member',measurement,indicator),/만료/);
 assert.throws(()=>verifyOutcome(env,token,'u','member',measurement,{...indicator,version:2}),/만료/);
 const [payload,sig]=token.split('.'),tampered=JSON.parse(Buffer.from(payload,'base64url').toString());tampered.source.proposed.value=999;
 assert.throws(()=>verifyOutcome(env,Buffer.from(JSON.stringify(tampered)).toString('base64url')+'.'+sig,'u','member',measurement,indicator),/만료/);
 const now=Date.now;try{Date.now=()=>now()+86400001;assert.throws(()=>verifyOutcome(env,token,'u','member',measurement,indicator),/만료/);}finally{Date.now=now;}
});
