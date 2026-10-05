import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestPlan, validatePlanningResult, planningRequestSchema, type PlanningInput } from '../server/planning-ai';
const input:PlanningInput={documentId:'d1',versionId:'v1',blocks:[{id:'line:1',location:'1행',text:'고유 참여자 목표는 100명이다. 월 10명씩 10개월, 중복 없이 모집한다.'}]};
const candidate={name:'고유 참여자',unit:'명',target:100,forecast:null,forecastNote:'',definition:'사업 기간 내 중복을 제외한 참여자',aggregation:'cumulative-snapshot',direction:'higher',rubric:'',standardId:null,blockId:'line:1',quote:'고유 참여자 목표는 100명이다.',uncertainty:'참여자 식별과 중복 제외 방법을 확인해 주세요.'};
const result={summary:'사업계획의 목표 후보',candidates:[candidate]};
test('AI 초안은 구조와 실제 발췌·기준·비율을 함께 검증',()=>{
  assert.equal(validatePlanningResult(result,input).candidates[0].target,100);
  for(const extra of [{quote:'문서에 없는 내용'},{blockId:'foreign'},{standardId:'fake-standard'},{aggregation:'ratio',unit:'%',target:200},{forecast:200,forecastNote:''},{aggregation:'qualitative',target:null,forecast:null,rubric:''}])assert.throws(()=>validatePlanningResult({...result,candidates:[{...candidate,...extra}]},input));
  assert.throws(()=>planningRequestSchema.parse({...input,blocks:[{...input.blocks[0],text:'x'.repeat(6001)}]}));
});
test('AI는 설정 없으면 외부 요청하지 않고 설정 후에도 읽기 전용 초안만 생성',async()=>{
  let calls=0;const mock=async(_url:any,init:any)=>{calls++;const body=JSON.parse(init.body);assert.equal(body.store,false);assert.equal(body.text.format.type,'json_schema');assert.equal(body.text.format.strict,true);assert.equal(body.tools,undefined);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]});};
  await assert.rejects(suggestPlan({},input,{name:'사업',purpose:'참여'},mock as typeof fetch),/연결 전/);assert.equal(calls,0);
  const r=await suggestPlan({OPENAI_API_KEY:'test-key',OPENAI_MODEL:'configured-test-model'},input,{name:'사업',purpose:'참여'},mock as typeof fetch);assert.equal(r.candidates.length,1);assert.equal(calls,1);
});
test('AI 거부·중단·잘못된 JSON·서비스 오류를 저장 없이 처리하고 비밀 응답을 노출하지 않음',async()=>{
  for(const response of [Response.json({status:'incomplete',output:[]}),Response.json({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]}),new Response('secret upstream info',{status:429})]){
    await assert.rejects(suggestPlan({OPENAI_API_KEY:'test-key',OPENAI_MODEL:'configured-test-model'},input,{name:'사업',purpose:'참여'},(async()=>response) as typeof fetch),e=>!String(e).includes('secret upstream'));
  }
});
