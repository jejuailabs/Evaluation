import type {Command,Workspace,TaskSeries,TaskTemplate} from './types';
import {getProject} from './selectors';
function date(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new Error('반복 기간의 날짜를 확인해 주세요.');}
export function recurrenceDates(schedule:Pick<TaskSeries,'start'|'end'|'frequency'|'interval'>):string[]{
 const {start,end,frequency,interval}=schedule;date(start);date(end);
 if(end<start||!Number.isInteger(interval)||interval<1||interval>12||!['daily','weekly','monthly'].includes(frequency))throw new Error('반복 기간과 간격을 확인해 주세요.');
 const anchor=new Date(start+'T00:00:00Z'),dates:string[]=[];
 for(let n=0;;n++){
  const d=new Date(anchor);
  if(frequency==='monthly'){d.setUTCDate(1);d.setUTCMonth(anchor.getUTCMonth()+n*interval);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(anchor.getUTCDate(),last));}
  else d.setUTCDate(anchor.getUTCDate()+n*interval*(frequency==='weekly'?7:1));
  const value=d.toISOString().slice(0,10);if(value>end)break;
  dates.push(value);if(dates.length>400)throw new Error('한 번에 400회까지 만들 수 있어요. 기간을 나누어 주세요.');
 }
 return dates;
}
function template(s:Workspace,pid:string,fields:TaskTemplate){
 if(!fields.title.trim()||fields.title.length>160)throw new Error('업무 이름을 160자 이내로 입력해 주세요.');
 if(!s.members.some(m=>m.id===fields.ownerId))throw new Error('담당자를 확인해 주세요.');
 if(fields.indicatorId&&!s.indicators.some(i=>i.projectId===pid&&i.id===fields.indicatorId))throw new Error('같은 프로젝트의 목표를 선택해 주세요.');
 return {title:fields.title,ownerId:fields.ownerId,priority:fields.priority,note:fields.note,indicatorId:fields.indicatorId};
}
export function applyRecurrence(s:Workspace,c:Command,now:string,actorId:string){
 if(!c.type.startsWith('task.series.'))return null;
 s.taskSeries??=[];
 if(c.type==='task.series.create'){
  const p=getProject(s,c.series.projectId),v=c.series;
  if(v.orgId!==s.organization.id||s.taskSeries.some(x=>x.id===v.id)||v.id.length>85)throw new Error('반복 업무 번호와 조직을 확인해 주세요.');
  if(v.start<p.start||v.end>p.end)throw new Error('프로젝트 기간 안에 반복 일정을 정해 주세요.');
  const fields=template(s,p.id,v),dates=recurrenceDates(v);
  if(dates.some(d=>s.tasks.some(t=>t.id===`${v.id}:${d}`)))throw new Error('이미 만든 반복 일정이에요.');
  s.taskSeries.push({...v,...fields,status:'active',createdAt:now,createdById:actorId,version:1,changes:[]});
  dates.forEach(d=>s.tasks.push({...fields,id:`${v.id}:${d}`,orgId:v.orgId,projectId:p.id,due:d,status:'todo',seriesId:v.id,occurrence:d}));
  return {projectId:p.id,action:`반복 업무 ${dates.length}회 생성 · ${v.title}`};
 }
 if(c.type!=='task.series.update'&&c.type!=='task.series.stop')return null;
 const series=s.taskSeries.find(x=>x.id===c.seriesId&&x.projectId===c.projectId);
 if(!series||series.status!=='active')throw new Error('진행 중인 반복 업무를 선택해 주세요.');
 date(c.effectiveFrom);if(c.effectiveFrom<now.slice(0,10)||c.effectiveFrom>series.end||!c.reason.trim())throw new Error('오늘부터 반복 종료일까지의 적용일과 변경 이유를 입력해 주세요.');
 const tasks=s.tasks.filter(t=>t.seriesId===series.id&&t.projectId===series.projectId&&!t.cancelled&&t.status==='todo'&&t.due>=c.effectiveFrom);
 if(!tasks.length)throw new Error('적용일 이후에 변경할 예정 업무가 없어요.');
 const previous:TaskTemplate={title:series.title,ownerId:series.ownerId,priority:series.priority,note:series.note,indicatorId:series.indicatorId};
 if(c.type==='task.series.update'){const fields=template(s,series.projectId,c.fields);tasks.forEach(t=>Object.assign(t,fields));Object.assign(series,fields);}
 else {tasks.forEach(t=>{t.cancelled={at:now,actorId,reason:c.reason};});series.status='stopped';}
 series.version++;series.changes.push({at:now,actorId,reason:c.reason,effectiveFrom:c.effectiveFrom,previous,action:c.type==='task.series.stop'?'stop':'update'});
 return {projectId:series.projectId,action:`반복 업무 ${tasks.length}회 ${c.type==='task.series.stop'?'중단':'변경'} · ${c.reason}`};
}
