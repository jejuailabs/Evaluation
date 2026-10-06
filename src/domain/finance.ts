import type {Command,Expense,ExpenseFields,Workspace} from './types';
import {getProject,projectRows,resolveEvidence,today,uid} from './selectors';
import {expensePaid,isApproved} from './finance-selectors';
const text=(v:string,label:string)=>{if(!v.trim())throw new Error(`${label}을 입력해 주세요.`);};
const money=(v:number)=>{if(!Number.isSafeInteger(v)||v<0)throw new Error('금액은 0 이상의 원 단위 숫자로 입력해 주세요.');};
function date(v:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new Error('날짜를 확인해 주세요.');}
function fields(s:Workspace,pid:string,e:ExpenseFields){
  const p=getProject(s,pid);text(e.title,'집행 내용');money(e.amount);if(!e.amount)throw new Error('집행액은 0원보다 커야 해요.');date(e.date);
  if(e.date<p.start||e.date>p.end)throw new Error('집행일은 프로젝트 기간 안으로 정해 주세요.');
  if(!s.members.some(m=>m.id===e.ownerId))throw new Error('조직의 담당자를 선택해 주세요.');
  if(e.evidence)resolveEvidence(s,pid,e.evidence);
  if(e.budgetLineId&&!s.budgetLines?.some(l=>l.id===e.budgetLineId&&l.projectId===pid&&l.orgId===s.organization.id))throw new Error('이 프로젝트의 예산 세목을 선택해 주세요.');
}
export function applyFinance(s:Workspace,c:Command,now:string,actorId:string):{projectId:string;action:string}|null {
  if(!c.type.startsWith('expense.')&&c.type!=='budget.line.save')return null;
  if(c.type==='budget.line.save'){
    const l=c.line,p=getProject(s,l.projectId);if(l.orgId!==s.organization.id)throw new Error('다른 조직의 예산이에요.');text(l.name,'세목 이름');text(l.fundingSource,'재원');money(l.allocated);
    s.budgetLines??=[];const old=s.budgetLines.find(x=>x.id===l.id);if(old&&(old.orgId!==l.orgId||old.projectId!==l.projectId))throw new Error('다른 프로젝트의 세목이에요.');
    if(s.budgetLines.some(x=>x.projectId===p.id&&x.id!==l.id&&x.name===l.name&&x.fundingSource===l.fundingSource))throw new Error('같은 재원과 이름의 세목이 있어요.');
    if(s.budgetLines.filter(x=>x.projectId===p.id&&x.id!==l.id).reduce((n,x)=>n+x.allocated,0)+l.allocated>p.budget)throw new Error('세목 배정 합계가 프로젝트 전체 예산을 넘을 수 없어요.');
    if(s.expenses.filter(e=>e.projectId===p.id&&e.budgetLineId===l.id&&isApproved(e)).reduce((n,e)=>n+e.amount,0)>l.allocated)throw new Error('이미 승인한 집행보다 세목 예산을 줄일 수 없어요.');
    if(old){text(c.reason,'변경 이유');const {name,fundingSource,allocated}=old;old.changes.push({at:now,actorId,reason:c.reason,previous:{name,fundingSource,allocated}});Object.assign(old,{name:l.name,fundingSource:l.fundingSource,allocated:l.allocated});}else s.budgetLines.push({...l,changes:[]});
    return {projectId:p.id,action:`예산 세목 ${old?'변경':'배정'} · ${l.name}`};
  }
  if(c.type==='expense.add'){
    const e=c.expense;getProject(s,e.projectId);if(e.orgId!==s.organization.id)throw new Error('다른 조직의 집행이에요.');if(s.expenses.some(x=>x.id===e.id))throw new Error('이미 처리한 항목이에요.');fields(s,e.projectId,e);
    if(e.status!=='planned'){if(!e.evidence)throw new Error('증빙을 연결하고 검토 요청을 먼저 해 주세요.');throw new Error('새 지출은 집행 예정으로 등록한 뒤 검토 요청해 주세요.');}
    const clean:Expense={id:e.id,orgId:e.orgId,projectId:e.projectId,title:e.title,amount:e.amount,date:e.date,ownerId:e.ownerId,evidence:e.evidence,budgetLineId:e.budgetLineId,description:e.description,status:'planned',workflowVersion:1,requestedById:actorId,payments:[],history:[{id:uid(),at:now,actorId,action:'집행 예정 등록',reason:'',status:'planned'}]};
    s.expenses.push(clean);return {projectId:e.projectId,action:`집행 예정 등록 · ${e.title}`};
  }
  if(!('expenseId' in c))return null;
  const e=projectRows(s,s.expenses,c.projectId).find(e=>e.id===c.expenseId);if(!e)throw new Error('집행 기록을 찾지 못했어요.');
  const editable=()=>{if(!['planned','returned'].includes(e.status))throw new Error('집행 예정·보완 요청 상태에서만 내용을 수정할 수 있어요.');};
  const log=(action:string,reason='',previous?:ExpenseFields)=>{(e.history??=[]).push({id:uid(),at:now,actorId,action,reason,status:e.status,previous});return {projectId:e.projectId,action:`${action} · ${e.title}`};};
  const checkApproval=()=>{
    if(!e.evidence)throw new Error('증빙을 연결한 뒤 검토 요청해 주세요.');resolveEvidence(s,e.projectId,e.evidence);
    const approved=projectRows(s,s.expenses,e.projectId).filter(x=>x.id!==e.id&&isApproved(x));
    if(approved.reduce((n,x)=>n+x.amount,0)+e.amount>getProject(s,e.projectId).budget)throw new Error('승인하면 프로젝트 예산을 초과해요. 예산이나 요청 금액을 먼저 조정해 주세요.');
    if(e.budgetLineId){const line=s.budgetLines?.find(l=>l.id===e.budgetLineId&&l.projectId===e.projectId);if(!line||approved.filter(x=>x.budgetLineId===e.budgetLineId).reduce((n,x)=>n+x.amount,0)+e.amount>line.allocated)throw new Error('승인하면 해당 세목의 배정액을 초과해요.');}
  };
  switch(c.type){
    case 'expense.update':{
      editable();text(c.reason,'수정 이유');fields(s,e.projectId,c.fields);
      const {title,amount,date,ownerId,evidence,budgetLineId,description}=e;const previous={title,amount,date,ownerId,evidence,budgetLineId,description};
      Object.assign(e,{title:c.fields.title,amount:c.fields.amount,date:c.fields.date,ownerId:c.fields.ownerId,evidence:c.fields.evidence,budgetLineId:c.fields.budgetLineId,description:c.fields.description});e.workflowVersion=1;return log('집행 내용 수정',c.reason,previous);
    }
    case 'expense.evidence':{editable();resolveEvidence(s,e.projectId,c.evidence);e.evidence=c.evidence;return log('집행 증빙 연결');}
    case 'expense.submit':{editable();fields(s,e.projectId,e);if(!e.evidence)throw new Error('견적서나 지출 근거를 자료함에 등록하고 연결해 주세요.');e.status='submitted';e.workflowVersion=1;return log('검토 요청');}
    case 'expense.review':{if(e.status!=='submitted')throw new Error('검토 요청된 지출만 검토할 수 있어요.');text(c.reason,'검토 의견');if(c.decision==='confirmed')checkApproval();else if(c.decision!=='returned')throw new Error('검토 결과를 선택해 주세요.');e.status=c.decision;return log(c.decision==='confirmed'?'집행 승인':'보완 요청',c.reason);}
    case 'expense.cancel':{if(e.status==='cancelled')throw new Error('이미 취소한 요청이에요.');if(expensePaid(e)>0)throw new Error('유효한 지급 기록이 있어요. 실제 환불은 별도 정산이 필요해요.');text(c.reason,'취소 이유');e.status='cancelled';return log('집행 취소',c.reason);}
    case 'expense.pay':{
      if(e.status!=='confirmed')throw new Error('승인된 미지급 지출에만 지급을 기록할 수 있어요.');const p=c.payment;money(p.amount);if(!p.amount||p.amount>e.amount-expensePaid(e))throw new Error('지급액은 0원보다 크고 남은 미지급액 이하여야 해요.');
      if(s.expenses.some(x=>x.payments?.some(y=>y.id===p.id)))throw new Error('이미 등록한 지급 기록이에요.');date(p.date);const project=getProject(s,e.projectId);if(p.date<e.date||p.date>project.end||p.date>today())throw new Error('지급일은 집행일부터 오늘 또는 프로젝트 종료일까지예요.');text(p.note,'지급 메모');resolveEvidence(s,e.projectId,p.evidence);
      (e.payments??=[]).push({...p,recordedAt:now,actorId});if(expensePaid(e)===e.amount)e.status='paid';return log('지급 기록',`${p.amount}원 · ${p.date} · ${p.note}`);
    }
    case 'expense.payment.void':{
      const p=e.payments?.find(p=>p.id===c.paymentId);if(!p||p.voided||!isApproved(e))throw new Error('정정할 지급 기록을 찾지 못했어요.');text(c.reason,'정정 이유');p.voided={at:now,actorId,reason:c.reason};e.status='confirmed';return log('지급 기록 무효 처리',c.reason);
    }
    case 'expense.status':{
      // Compatibility for pre-workflow records only. New requests cannot bypass review or payment detail.
      if(e.workflowVersion||e.history?.length||e.payments!==undefined)throw new Error('검토 요청·승인·지급 기록 화면에서 처리해 주세요.');
      const next=e.status==='planned'?'confirmed':e.status==='confirmed'?'paid':null;if(c.status!==next)throw new Error('집행 예정 → 확정 → 지급 순서로 처리해 주세요.');checkApproval();e.status=c.status;return log('이전 집행 상태 변경');
    }
    default:return null;
  }
}
