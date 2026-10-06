import type {Command,Workspace,DocumentVersion} from './types';
import {getProject,uid} from './selectors';
import {applyLifecycle} from './lifecycle';
import {audioMime,transcriptLimit,transcriptionBusy} from './meeting';
export function applyIntake(s:Workspace,c:Command,now:string,actorId:string){
 if(!c.type.startsWith('intake.'))return null;
 s.intakeItems??=[];
 if(c.type==='intake.add'){
  if(!c.title.trim()||c.title.length>160||s.intakeItems.some(x=>x.id===c.id))throw new Error('자료 이름과 번호를 확인해 주세요.');
  let version:DocumentVersion;
  if(c.source.kind==='text'){
   if(!c.source.text.trim()||c.source.text.length>10000)throw new Error('메모를 10,000자 이내로 입력해 주세요.');
   version={id:uid(),name:`${c.title}.txt`,size:new TextEncoder().encode(c.source.text).length,createdAt:now,inlineText:c.source.text};
  }else{
   version=c.source.version;if(!version.blobKey||!version.size)throw new Error('저장한 원본 파일이 필요해요.');
   if(s.intakeItems.some(i=>i.version.id===version.id)||s.documents.some(d=>d.versions.some(v=>v.id===version.id)))throw new Error('이미 등록한 원본이에요.');
  }
  s.intakeItems.unshift({id:c.id,orgId:s.organization.id,title:c.title,note:c.note,version,createdById:actorId,createdAt:now,status:'pending',history:[]});
  return {projectId:'',action:'미분류 자료 등록'};
 }
 if(!('id' in c))return null;
 const item=s.intakeItems.find(i=>i.id===c.id&&i.orgId===s.organization.id);
 if(!item)throw new Error('미분류 자료를 찾지 못했어요.');
 if(c.type==='intake.transcription.start'||c.type==='intake.transcription.finish'||c.type==='intake.meeting.save'){
  if(item.status!=='pending'||!item.version.blobKey||!audioMime(item.version.name))throw new Error('분류 대기 중인 음성 원본에서 회의 기록을 작성해 주세요.');
  if(c.type==='intake.transcription.start'){
   if(item.meeting)throw new Error('이미 작성한 회의 기록이 있어요. 기존 기록을 검토해 주세요.');
   if(transcriptionBusy(item.transcription,Date.parse(now)))throw new Error('전사가 진행 중이에요. 잠시 후 확인해 주세요.');
   item.transcription={id:c.attemptId,status:'processing',startedAt:now};
  }else if(c.type==='intake.transcription.finish'){
   if(item.transcription?.id!==c.attemptId||item.transcription.status!=='processing'||item.meeting)throw new Error('전사 요청 상태가 바뀌었어요. 최신 기록을 확인해 주세요.');
   item.transcription.finishedAt=now;
   if('error' in c.result){item.transcription.status='failed';item.transcription.error=c.result.error;}
   else {
    if(!c.result.text.trim()||c.result.text.length>transcriptLimit)throw new Error('전사문은 30,000자 이내여야 해요.');
    item.transcription.status='completed';
    item.meeting={revision:1,method:'ai',originalText:c.result.text,text:c.result.text,notes:'',model:c.result.model,createdAt:now,updatedAt:now};
   }
  }else{
   if(transcriptionBusy(item.transcription,Date.parse(now)))throw new Error('전사를 마친 뒤 기록을 수정해 주세요.');
   if((item.meeting?.revision??0)!==c.expectedRevision)throw new Error('다른 사람이 회의 기록을 수정했어요. 최신 내용을 확인해 주세요.');
   if(!c.text.trim()||c.text.length>transcriptLimit||c.notes.length>10000||(c.reviewed&&!c.notes.trim()))throw new Error('전사문은 30,000자, 회의 내용은 10,000자 이내로 입력하고 확인할 회의 내용을 남겨 주세요.');
   item.meeting={...(item.meeting??{method:'manual',createdAt:now}),revision:c.expectedRevision+1,text:c.text,notes:c.notes,updatedAt:now,reviewedAt:c.reviewed?now:undefined,reviewedById:c.reviewed?actorId:undefined};
  }
  const action=c.type==='intake.meeting.save'?(c.reviewed?'회의 기록 확인':'회의 초안 저장'):c.type==='intake.transcription.start'?'음성 전사 시작':('error' in c.result?'음성 전사 실패':'음성 전사 초안 저장');
  item.history.push({at:now,actorId,action,reason:''});return {projectId:'',action};
 }
 if(c.type!=='intake.assign'&&c.type!=='intake.archive')return null;
 if(transcriptionBusy(item.transcription,Date.parse(now)))throw new Error('전사가 진행 중이에요. 마친 뒤 분류하거나 보관해 주세요.');
 if(c.type==='intake.archive'){
  if(item.status==='linked'||!c.reason.trim()||(c.archived?item.status!=='pending':item.status!=='archived'))throw new Error('미분류 자료의 보관 상태와 이유를 확인해 주세요.');
  item.status=c.archived?'archived':'pending';item.history.push({at:now,actorId,action:item.status,reason:c.reason});
  return {projectId:'',action:c.archived?'미분류 자료 보관':'미분류 자료 복원'};
 }
 if(item.status!=='pending')throw new Error('분류 대기 중인 자료만 연결할 수 있어요.');
 if(item.meeting&&!item.meeting.reviewedAt)throw new Error('회의 초안을 먼저 검토하고 확인해 주세요.');
 const p=getProject(s,c.projectId),documentId=uid();
 s.documents.push({id:documentId,orgId:s.organization.id,projectId:p.id,title:item.title,versions:[structuredClone(item.version)]});
 const evidence=[{documentId,versionId:item.version.id}];
 if(item.meeting){
  const recordId=uid(),versionId=uid(),inlineText=`${item.title} · 확인한 회의 기록\n원본: ${item.version.name}\n확인: ${item.meeting.reviewedAt}\n\n회의 내용·결정·할 일\n${item.meeting.notes}\n\n검토한 전사문\n${item.meeting.text}`;
  s.documents.push({id:recordId,orgId:s.organization.id,projectId:p.id,title:`${item.title} · 회의 기록`,versions:[{id:versionId,name:'회의 기록.txt',inlineText,size:new TextEncoder().encode(inlineText).length,createdAt:now}]});
  item.meetingDocumentId=recordId;evidence.push({documentId:recordId,versionId});
 }
 if(c.activity){
  const activityId=uid();applyLifecycle(s,{type:'activity.add',activity:{...c.activity,id:activityId,orgId:s.organization.id,projectId:p.id,title:item.title,ownerId:actorId,evidence}},now);item.activityId=activityId;
 }
 item.status='linked';item.projectId=p.id;item.documentId=documentId;item.history.push({at:now,actorId,action:'linked',reason:p.name});
 return {projectId:p.id,action:`자료함에서 연결 · ${item.title}`};
}
