import type {Command, Task, Workspace} from './types';
import {getProject, uid} from './selectors';

export function validateTaskGraph(s:Workspace) {
  const tasks=new Map(s.tasks.filter(t=>!t.cancelled).map(t=>[t.id,t]));
  const children=new Map<string,string[]>();for(const t of tasks.values())if(t.parentId)children.set(t.parentId,[...(children.get(t.parentId)??[]),t.id]);
  const visited=new Set<string>(),visiting=new Set<string>();
  const visit=(t:Task)=>{
    if(visiting.has(t.id))throw new Error('상위 업무와 선행 업무가 순환할 수 없어요.');
    if(visited.has(t.id))return;visiting.add(t.id);
    const edges=[...(t.dependencyIds??[]),...(children.get(t.id)??[])];
    if(t.parentId){const p=tasks.get(t.parentId);if(!p||p.projectId!==t.projectId||p.id===t.id)throw new Error('같은 프로젝트의 다른 업무를 상위 업무로 선택해 주세요.');}
    for(const id of edges){const other=tasks.get(id);if(!other||other.projectId!==t.projectId)throw new Error('같은 프로젝트의 유효한 선행 업무를 선택해 주세요.');visit(other);if(t.status==='done'&&other.status!=='done')throw new Error('선행 업무와 하위 업무를 완료한 뒤 완료할 수 있어요.');}
    visiting.delete(t.id);visited.add(t.id);
  };tasks.forEach(visit);
}
export function markChangedSource(s:Workspace,documentId:string,now:string) {
  const doc=s.documents.find(d=>d.id===documentId)!;
  for(const i of s.indicators)if(i.planningSource?.evidence.documentId===documentId)i.needsReview={at:now,reason:'설계 근거에 새 버전이 등록됐어요.',sourceVersionId:doc.versions.at(-1)!.id};
  for(const m of s.measurements)if(m.status!=='rejected'&&m.evidence.documentId===documentId)m.needsReview={at:now,reason:'증빙에 새 버전이 등록됐어요.',sourceVersionId:doc.versions.at(-1)!.id};
}
export function applyWorkManagement(s:Workspace,c:Command,now:string,actorId:string):{projectId:string;action:string}|null {
  switch(c.type){
    case 'organization.team.save':{
      const team=c.team;if(!team.name.trim()||new Set(team.memberIds).size!==team.memberIds.length||team.memberIds.some(id=>!s.members.some(m=>m.id===id)))throw new Error('팀 이름과 구성원을 확인해 주세요.');
      const teams=s.organization.teams??=[];const old=teams.find(t=>t.id===team.id);
      if(!old&&teams.length>=200)throw new Error('팀은 200개까지 만들 수 있어요.');
      if(teams.some(t=>t.id!==team.id&&t.name===team.name))throw new Error('같은 이름의 팀이 있어요.');
      if(old)Object.assign(old,team);else teams.push(team);return {projectId:'',action:`팀 구성 변경 · ${team.name}`};
    }
    case 'document.restore':{
      const d=s.documents.find(d=>d.id===c.documentId&&d.projectId===c.projectId),v=d?.versions.find(v=>v.id===c.versionId);
      if(!d||!v)throw new Error('복원할 버전을 찾지 못했어요.');if(!c.reason.trim())throw new Error('복원 이유를 남겨 주세요.');
      d.versions.push({...v,id:uid(),createdAt:now,restoredFromId:v.id});markChangedSource(s,d.id,now);return {projectId:d.projectId,action:`자료 버전 복원 · ${d.title} · ${c.reason}`};
    }
    case 'document.reference':{
      const d=s.documents.find(d=>d.id===c.documentId&&d.projectId===c.sourceProjectId);getProject(s,c.projectId);
      if(!d||c.projectId===d.projectId)throw new Error('다른 프로젝트의 자료를 선택해 주세요.');
      if(!c.linked&&(s.measurements.some(m=>m.projectId===c.projectId&&m.evidence.documentId===d.id)||s.expenses.some(e=>e.projectId===c.projectId&&e.evidence?.documentId===d.id)||s.indicators.some(i=>i.projectId===c.projectId&&(i.planningSource?.evidence.documentId===d.id||i.forecastCalculation?.source?.documentId===d.id))))throw new Error('이 프로젝트의 지표·실적·집행에서 사용 중인 근거는 참조를 해제할 수 없어요.');
      d.referenceProjectIds=[...new Set([...(d.referenceProjectIds??[]).filter(id=>id!==c.projectId),...(c.linked?[c.projectId]:[])])];
      return {projectId:c.projectId,action:`프로젝트 자료 참조 ${c.linked?'연결':'해제'} · ${d.title}`};
    }
    case 'source.review':{
      const row=c.kind==='indicator'?s.indicators.find(i=>i.id===c.id&&i.projectId===c.projectId):s.measurements.find(m=>m.id===c.id&&m.projectId===c.projectId);
      if(!row?.needsReview||!c.reason.trim())throw new Error('재확인할 항목과 검토 의견을 확인해 주세요.');
      (row.sourceReviews??=[]).push({...row.needsReview,reviewedAt:now,actorId,reason:c.reason});delete row.needsReview;
      return {projectId:c.projectId,action:`원본 변경 영향 재확인 · ${c.reason}`};
    }
    default:return null;
  }
}
