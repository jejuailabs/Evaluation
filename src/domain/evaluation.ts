import type {Command, Workspace} from './types';
import {resolveEvidence} from './selectors';

export function applyEvaluation(s:Workspace,c:Command,now:string,actorId:string):{projectId:string;action:string}|null {
 if(c.type==='organization.approval.save'){
  if(new Set(c.approverIds).size!==c.approverIds.length||c.approverIds.some(id=>!s.members.some(m=>m.id===id)))throw new Error('중복 없이 결재자를 선택해 주세요.');
  s.organization.approvalPolicy={approverIds:c.approverIds,separateDuties:c.separateDuties};return {projectId:'',action:'집행 결재 순서·직무 분리 정책 변경'};
 }
 if(c.type!=='indicator.definition'&&c.type!=='indicator.forecast')return null;
 const i=s.indicators.find(i=>i.id===c.indicatorId&&i.projectId===c.projectId&&i.orgId===s.organization.id);
 if(!i)throw new Error('지표를 찾지 못했어요.');
 if(c.type==='indicator.definition'){
  if(!c.definition.trim()||!c.unit.trim()||!c.reason.trim())throw new Error('집계 정의·단위·변경 이유를 입력해 주세요.');
  if(c.aggregation!==i.aggregation||c.unit!==i.unit)throw new Error('단위나 집계 방식이 바뀌면 별도 지표로 설계해 주세요.');
  if(c.uniqueParticipants&&!['period-sum','cumulative-snapshot'].includes(c.aggregation))throw new Error('참여자 중복 제거는 수량 지표에서 사용할 수 있어요.');
  (i.definitionHistory??=[]).push({version:i.definitionVersion??1,definition:i.definition,unit:i.unit,aggregation:i.aggregation,at:now,reason:c.reason});
  i.definitionVersion=(i.definitionVersion??1)+1;i.version++;i.definition=c.definition;i.uniqueParticipants=c.uniqueParticipants;
  return {projectId:i.projectId,action:`지표 정의 변경 · ${c.reason}`};
 }
 const calc=c.calculation;
 if(i.aggregation==='qualitative')throw new Error('정성 지표에는 수치 예상을 계산하지 않아요.');
 resolveEvidence(s,i.projectId,calc.source);
 if(!calc.assumptions.trim()||!calc.factors.length||calc.factors.some(f=>!f.name.trim()||![f.low,f.base,f.high].every(n=>Number.isFinite(n)&&n>=0)||f.low>f.base||f.base>f.high))throw new Error('각 가정은 보수 ≤ 기준 ≤ 확대 순서의 0 이상 수로 입력해 주세요.');
 const calculate=(key:'low'|'base'|'high')=>calc.factors.reduce((v,f)=>calc.method==='product'?v*f[key]:v+f[key],calc.method==='product'?1:0);
 const low=calculate('low'),base=calculate('base'),high=calculate('high');
 if(![low,base,high].every(Number.isFinite)||(i.aggregation==='ratio'&&high>100))throw new Error('예상 결과의 범위를 확인해 주세요.');
 (i.revisions??=[]).push({at:now,target:i.target,forecast:i.forecast,forecastNote:i.forecastNote,reason:calc.assumptions,version:i.version});
 i.forecastCalculation={...calc,low,base,high,at:now,actorId};i.forecast=base;i.forecastNote=calc.assumptions;i.version++;
 return {projectId:i.projectId,action:`예상 산식·가정 저장 · ${i.name}`};
}
