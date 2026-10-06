import type { AnnualReport, Command, Report, Workspace } from './types';
import { annualSnapshot } from './annual';
import { projectSnapshot } from './report-snapshot';
import { uid } from './selectors';

export type ReportKind = 'project' | 'annual';
export type ReportStatus = 'draft' | 'in-review' | 'returned' | 'approved' | 'submitted';
export const reportStatusLabels: Record<ReportStatus, string> = { draft:'초안', 'in-review':'검토 대기', returned:'보완 요청', approved:'내부 승인', submitted:'제출 기록 있음' };
export const submissionChannels = { email:'이메일', portal:'기관 시스템', visit:'방문·우편', other:'기타' };
export type ReportAction =
  | { action:'request'; recipient:string; reason:string }
  | { action:'approve'|'return'|'withdraw'|'revoke'; reason:string }
  | { action:'submit'; date:string; recipient:string; channel:keyof typeof submissionChannels; reference:string; format:'docx'|'xlsx'|'html'|'pdf'; reason:string }
  | { action:'void'; submissionId:string; reason:string }
  | { action:'revise'; note:string; reason:string };
export interface ReportHistory { id:string; at:string; actorId:string; actorName:string; action:ReportAction['action']; reason:string; status:ReportStatus; relatedId?:string }
export interface ReportSubmission { id:string; date:string; recipient:string; channel:keyof typeof submissionChannels; reference:string; format:'docx'|'xlsx'|'html'|'pdf'; note:string; at:string; actorId:string; actorName:string; voided?:{at:string;actorId:string;actorName:string;reason:string} }
export interface ReportMetadata { createdById?:string; previousReportId?:string; revisionReason?:string; workflow?:{ version:number; status:ReportStatus; recipient:string; history:ReportHistory[]; submissions:ReportSubmission[] } }
export const reportStatus = (r:ReportMetadata):ReportStatus => r.workflow?.status??'draft';
export const reportVersion = (r:ReportMetadata) => r.workflow?.version??0;
export const reportActionLabels:Record<ReportAction['action'],string> = {request:'검토 요청',approve:'내부 승인',return:'보완 요청',withdraw:'검토 요청 철회',revoke:'승인 철회',submit:'제출 기록',void:'제출 기록 무효화',revise:'수정본 생성'};
export function findReport(s:Workspace,kind:ReportKind,id:string):Report|AnnualReport {
  const r=(kind==='annual'?s.annualReports??[]:s.reports).find(r=>r.id===id&&r.orgId===s.organization.id);
  if(!r)throw new Error('보고서를 찾지 못했어요.');
  return r;
}
function required(v:string,label:string){if(!v.trim())throw new Error(`${label}을 입력해 주세요.`);}
export function applyReportWorkflow(s:Workspace,c:Command,now:string,actorId:string):{projectId:string;action:string}|null {
  if(c.type!=='report.workflow')return null;
  const r=findReport(s,c.kind,c.reportId),op=c.operation;
  if(c.expectedVersion!==reportVersion(r))throw new Error('다른 사람이 보고서를 처리했어요. 최신 상태를 확인하고 다시 시도해 주세요.');
  required(op.reason,'처리 사유');
  const w=r.workflow??={version:0,status:'draft',recipient:'',history:[],submissions:[]};
  const actorName=s.members.find(m=>m.id===actorId)?.name??actorId;
  const active=w.submissions.filter(x=>!x.voided);
  let relatedId:string|undefined;
  const allow=(...states:ReportStatus[])=>{if(!states.includes(w.status))throw new Error('현재 보고서 상태에서는 이 작업을 할 수 없어요.');};
  switch(op.action){
    case 'request': allow('draft');if((c.kind==='annual'?s.annualReports??[]:s.reports).some(x=>x.previousReportId===r.id))throw new Error('새 수정본에서 검토를 요청해 주세요.');required(op.recipient,'제출 예정 기관');w.recipient=op.recipient.trim();w.status='in-review';break;
    case 'approve': allow('in-review');w.status='approved';break;
    case 'return': allow('in-review');w.status='returned';break;
    case 'withdraw': allow('in-review');w.status='draft';break;
    case 'revoke': allow('approved');w.status='draft';break;
    case 'submit': {
      allow('approved','submitted');required(op.recipient,'제출처');required(op.reference,'접수번호 또는 제출 확인 정보');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(op.date)||!Number.isFinite(Date.parse(op.date))||new Date(op.date).toISOString().slice(0,10)!==op.date||op.date>new Date(Date.parse(now)+9*3600000).toISOString().slice(0,10))throw new Error('제출일은 오늘까지의 실제 날짜로 입력해 주세요.');
      const approval=[...w.history].reverse().find(h=>h.action==='approve');
      if(!approval||op.date<new Date(Date.parse(approval.at)+9*3600000).toISOString().slice(0,10))throw new Error('승인일 이후의 제출만 기록할 수 있어요.');
      if(active.some(x=>x.date===op.date&&x.recipient===op.recipient.trim()&&x.reference===op.reference.trim()&&x.format===op.format))throw new Error('같은 제출 기록이 이미 있어요.');
      relatedId=uid();w.submissions.push({id:relatedId,date:op.date,recipient:op.recipient.trim(),channel:op.channel,reference:op.reference.trim(),format:op.format,note:op.reason,at:now,actorId,actorName});w.status='submitted';break;
    }
    case 'void': {
      allow('submitted');const entry=w.submissions.find(x=>x.id===op.submissionId&&!x.voided);
      if(!entry)throw new Error('유효한 제출 기록을 선택해 주세요.');
      entry.voided={at:now,actorId,actorName,reason:op.reason};relatedId=entry.id;
      w.status=w.submissions.some(x=>!x.voided)?'submitted':'approved';break;
    }
    case 'revise': {
      allow('draft','returned','approved','submitted');
      const rows=c.kind==='annual'?s.annualReports??[]:s.reports;
      if(rows.some(x=>x.previousReportId===r.id))throw new Error('이미 수정본이 있어요. 해당 수정본을 열어 주세요.');
      let next:Report|AnnualReport;
      if('planId' in r){
        const plan=s.annualPlans?.find(p=>p.id===r.planId);if(!plan)throw new Error('연간 계획을 찾지 못했어요.');
        next=annualSnapshot(s,plan,r.start,r.end,op.note,now);(s.annualReports??=[]).unshift(next);
      }else{next=projectSnapshot(s,{projectId:r.projectId,asOf:r.asOf,periodStart:r.periodStart,note:op.note},now);s.reports.unshift(next);}
      Object.assign(next,{createdById:actorId,previousReportId:r.id,revisionReason:op.reason});relatedId=next.id;break;
    }
  }
  w.version++;w.history.push({id:uid(),at:now,actorId,actorName,action:op.action,reason:op.reason,status:w.status,...(relatedId?{relatedId}:{})});
  return {projectId:'projectId' in r?r.projectId:'',action:`보고서 ${reportActionLabels[op.action]} · ${r.title}`};
}
