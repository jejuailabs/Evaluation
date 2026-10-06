import type {Command,Workspace,DocumentVersion} from './types';
import {getProject,uid} from './selectors';
import {applyLifecycle} from './lifecycle';
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
 if(c.type!=='intake.assign'&&c.type!=='intake.archive')return null;
 const item=s.intakeItems.find(i=>i.id===c.id&&i.orgId===s.organization.id);
 if(!item)throw new Error('미분류 자료를 찾지 못했어요.');
 if(c.type==='intake.archive'){
  if(item.status==='linked'||!c.reason.trim()||(c.archived?item.status!=='pending':item.status!=='archived'))throw new Error('미분류 자료의 보관 상태와 이유를 확인해 주세요.');
  item.status=c.archived?'archived':'pending';item.history.push({at:now,actorId,action:item.status,reason:c.reason});
  return {projectId:'',action:c.archived?'미분류 자료 보관':'미분류 자료 복원'};
 }
 if(item.status!=='pending')throw new Error('분류 대기 중인 자료만 연결할 수 있어요.');
 const p=getProject(s,c.projectId),documentId=uid();
 s.documents.push({id:documentId,orgId:s.organization.id,projectId:p.id,title:item.title,versions:[structuredClone(item.version)]});
 if(c.activity){
  const activityId=uid();applyLifecycle(s,{type:'activity.add',activity:{...c.activity,id:activityId,orgId:s.organization.id,projectId:p.id,title:item.title,ownerId:actorId,evidence:[{documentId,versionId:item.version.id}]}},now);item.activityId=activityId;
 }
 item.status='linked';item.projectId=p.id;item.documentId=documentId;item.history.push({at:now,actorId,action:'linked',reason:p.name});
 return {projectId:p.id,action:`자료함에서 연결 · ${item.title}`};
}
