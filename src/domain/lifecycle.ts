import type { Command, Workspace } from './types';
import { annualSnapshot } from './annual';
import { getProject, resolveEvidence, today, uid } from './selectors';
import {expensePaid,isApproved} from './finance-selectors';

function text(v:string,label:string){if(!v.trim())throw new Error(`${label}을 입력해 주세요.`);}
function positive(v:number|null){if(v!==null&&(!Number.isFinite(v)||v<0))throw new Error('0 이상의 유효한 숫자를 입력해 주세요.');}
function date(v:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new Error('날짜를 확인해 주세요.');}
function plan(s:Workspace,id:string){const p=s.annualPlans?.find(p=>p.id===id&&p.orgId===s.organization.id);if(!p)throw new Error('연간 계획을 찾지 못했어요.');return p;}
export function applyLifecycle(s:Workspace,c:Command,now:string):{projectId:string;action:string}|null {
  s.annualPlans??=[];s.annualGoals??=[];s.annualReports??=[];s.activities??=[];
  let projectId='',action='';
  switch(c.type){
    case 'annual.plan.save': {
      const p=c.plan;if(p.orgId!==s.organization.id)throw new Error('다른 조직의 계획이에요.');
      if(!Number.isInteger(p.year)||p.year<2000||p.year>2100)throw new Error('계획 연도를 확인해 주세요.');
      text(p.title,'계획 이름');text(p.purpose,'올해 만들 변화');positive(p.budget);if(!Number.isSafeInteger(p.budget))throw new Error('예산은 원 단위로 입력해 주세요.');
      const old=s.annualPlans.find(x=>x.id===p.id);
      if(s.annualPlans.some(x=>x.year===p.year&&x.id!==p.id))throw new Error('그 연도의 계획이 이미 있어요. 기존 계획을 수정해 주세요.');
      if(old){if(old.status==='closed')throw new Error('마감된 계획을 다시 진행 상태로 변경해 주세요.');if(old.year!==p.year)throw new Error('기존 계획의 연도는 바꿀 수 없어요.');text(c.reason,'변경 이유');old.changes.push({at:now,reason:c.reason,previous:{title:old.title,purpose:old.purpose,budget:old.budget}});Object.assign(old,p,{version:old.version+1,changes:old.changes,status:old.status});}
      else s.annualPlans.push({...p,status:'draft',version:1,changes:[]});
      action=old?'연간 계획 변경':'연간 계획 시작';break;
    }
    case 'annual.plan.status': {
      const p=plan(s,c.planId);text(c.reason,'변경 이유');
      if(c.status==='closed'&&!s.annualReports.some(r=>r.planId===p.id&&r.start===`${p.year}-01-01`&&r.end===`${p.year}-12-31`))throw new Error('연말까지의 최종 보고서를 먼저 만들어 주세요.');
      if(c.status==='closed'&&s.measurements.some(m=>m.status==='pending'&&m.asOf.startsWith(String(p.year))))throw new Error('확인 전 실적을 먼저 검토해 주세요.');
      p.status=c.status;p.version++;action=`연간 계획 상태 변경 · ${c.reason}`;break;
    }
    case 'annual.goal.save': {
      const g=c.goal,p=plan(s,g.planId);if(g.orgId!==p.orgId)throw new Error('조직이 일치하지 않아요.');if(p.status==='closed')throw new Error('마감된 연간 계획이에요.');
      text(g.name,'목표 이름');text(g.definition,'집계 기준');text(g.unit,'단위');positive(g.target);
      if(g.direction==='higher'&&g.target===0)throw new Error('증가 목표는 0보다 크게 입력해 주세요.');
      if(new Set(g.linkIds).size!==g.linkIds.length)throw new Error('같은 지표를 중복 연결할 수 없어요.');
      const linked=g.linkIds.map(id=>{const i=s.indicators.find(i=>i.id===id&&i.orgId===p.orgId);if(!i)throw new Error('연결할 지표를 확인해 주세요.');const project=getProject(s,i.projectId);if(project.start>`${p.year}-12-31`||project.end<`${p.year}-01-01`)throw new Error('이 연도에 진행하는 프로젝트의 지표만 연결해 주세요.');return i;});
      if(g.aggregation==='sum'){
        text(g.deduplication,'중복 제외 및 합산 근거');
        if(linked.some(i=>i.unit!==g.unit||i.direction!==g.direction||['ratio','qualitative'].includes(i.aggregation)))throw new Error('단위와 방향이 같은 수량만 합산할 수 있어요. 비율·정성 결과는 개별 보기로 설정해 주세요.');
      }
      const old=s.annualGoals.find(x=>x.id===g.id);
      if(old){if(old.planId!==g.planId)throw new Error('목표를 다른 연도에 옮길 수 없어요.');text(c.reason,'변경 이유');const {changes,...previous}=structuredClone(old);old.changes.push({at:now,reason:c.reason,previous});Object.assign(old,g,{version:old.version+1,changes:old.changes});}
      else s.annualGoals.push({...g,version:1,changes:[]});
      action='연간 목표와 프로젝트 지표 연결';break;
    }
    case 'annual.report.create': {
      const p=plan(s,c.planId);date(c.start);date(c.end);if(c.start<`${p.year}-01-01`||c.end>`${p.year}-12-31`||c.end<c.start||c.end>today())throw new Error('올해 안에서 오늘까지의 보고 기간을 선택해 주세요.');
      s.annualReports.unshift(annualSnapshot(s,p,c.start,c.end,c.note,now));action='기간 점검 보고서 저장';break;
    }
    case 'project.update': {
      const p=getProject(s,c.project.id);if(c.project.orgId!==s.organization.id)throw new Error('조직이 일치하지 않아요.');
      text(c.reason,'계획 변경 이유');text(c.project.name,'프로젝트 이름');text(c.project.purpose,'목적');date(c.project.start);date(c.project.end);
      if(c.project.end<c.project.start)throw new Error('종료일은 시작일 이후로 정해 주세요.');positive(c.project.budget);if(!Number.isSafeInteger(c.project.budget))throw new Error('예산은 원 단위로 입력해 주세요.');
      if((s.budgetLines??[]).filter(l=>l.projectId===p.id).reduce((n,l)=>n+l.allocated,0)>c.project.budget)throw new Error('세목에 배정한 금액보다 프로젝트 예산을 줄일 수 없어요.');
      if(s.expenses.filter(e=>e.projectId===p.id&&isApproved(e)).reduce((n,e)=>n+e.amount,0)>c.project.budget)throw new Error('승인한 집행보다 프로젝트 예산을 줄일 수 없어요.');
      if(s.expenses.filter(e=>e.projectId===p.id).flatMap(e=>e.payments??[]).some(x=>x.date<c.project.start||x.date>c.project.end))throw new Error('지급 기록의 날짜를 포함하는 프로젝트 기간으로 정해 주세요.');
      if(!s.members.some(m=>m.id===c.project.ownerId))throw new Error('담당자를 확인해 주세요.');
      const dates=[...s.expenses.filter(e=>e.projectId===p.id).map(e=>e.date),...s.measurements.filter(m=>m.projectId===p.id).flatMap(m=>[m.asOf,m.periodStart??m.asOf]),...s.tasks.filter(t=>t.projectId===p.id&&!t.cancelled).map(t=>t.due),...s.activities.filter(a=>a.projectId===p.id).map(a=>a.date)];
      if(dates.some(d=>d<c.project.start||d>c.project.end))throw new Error('기존 업무·집행·실적·기록을 포함하는 기간으로 설정해 주세요.');
      const targetStatus=c.project.status??'active';
      if(targetStatus==='archived'&&!['completed','archived'].includes(p.status??''))throw new Error('완료한 프로젝트만 보관할 수 있어요.');
      if(targetStatus==='completed'&&p.status!=='completed'){
        if(s.expenses.some(e=>e.projectId===p.id&&(['planned','submitted','returned'].includes(e.status)||(isApproved(e)&&expensePaid(e)<e.amount))))throw new Error('남은 집행 요청과 미지급액을 먼저 정리해 주세요.');
        if(s.tasks.some(t=>t.projectId===p.id&&!t.cancelled&&t.status!=='done')||s.measurements.some(m=>m.projectId===p.id&&m.status==='pending'))throw new Error('남은 업무와 확인 전 실적을 먼저 정리해 주세요.');
        if(!s.reports.some(r=>r.projectId===p.id&&r.asOf>=(p.end<today()?p.end:today())))throw new Error('마감 시점의 프로젝트 보고서를 먼저 만들어 주세요.');
        text(c.project.closeNote??'','마무리 기록');
      }
      Object.assign(p,c.project);projectId=p.id;action=`사업 계획 변경 · ${c.reason}`;break;
    }
    case 'task.update': {
      const old=s.tasks.find(t=>t.id===c.task.id&&t.projectId===c.task.projectId&&t.orgId===s.organization.id);if(!old||c.task.orgId!==s.organization.id)throw new Error('업무를 찾지 못했어요.');
      if(old.cancelled)throw new Error('중단한 반복 일정은 변경할 수 없어요.');
      const p=getProject(s,old.projectId);text(c.task.title,'업무');date(c.task.due);if(c.task.due<p.start||c.task.due>p.end)throw new Error('프로젝트 기간 안에 기한을 정해 주세요.');
      if(!s.members.some(m=>m.id===c.task.ownerId))throw new Error('담당자를 확인해 주세요.');
      if(c.task.indicatorId&&!s.indicators.some(i=>i.id===c.task.indicatorId&&i.projectId===p.id))throw new Error('이 프로젝트의 목표를 선택해 주세요.');
      Object.assign(old,c.task,{seriesId:old.seriesId,occurrence:old.occurrence,cancelled:old.cancelled,completedAt:c.task.status==='done'?(old.completedAt??now):undefined});projectId=p.id;action=`업무 수정 · ${old.title}`;break;
    }
    case 'activity.add': {
      const a=c.activity,p=getProject(s,a.projectId);if(a.orgId!==s.organization.id)throw new Error('조직이 일치하지 않아요.');if(s.activities.some(x=>x.id===a.id))throw new Error('이미 저장된 기록이에요.');text(a.title,'기록 이름');text(a.body,'내용');date(a.date);
      if(a.date<p.start||a.date>p.end||a.date>today())throw new Error('프로젝트 기간 안에서 오늘까지의 날짜로 기록해 주세요.');
      if(!s.members.some(m=>m.id===a.ownerId))throw new Error('작성자를 확인해 주세요.');
      if(a.taskId&&!s.tasks.some(t=>t.id===a.taskId&&t.projectId===p.id&&!t.cancelled))throw new Error('같은 프로젝트의 업무를 연결해 주세요.');
      if(a.indicatorIds.some(id=>!s.indicators.some(i=>i.id===id&&i.projectId===p.id)))throw new Error('같은 프로젝트의 지표를 연결해 주세요.');
      a.evidence.forEach(ref=>resolveEvidence(s,p.id,ref));
      const documentId=uid();const content=`${a.title}\n${a.date}\n\n${a.body}`;
      s.documents.push({id:documentId,orgId:a.orgId,projectId:p.id,title:a.title,versions:[{id:uid(),name:`${a.title}.txt`,size:new TextEncoder().encode(content).length,createdAt:now,inlineText:content}]});
      s.activities.unshift({...a,documentId,createdAt:now});projectId=p.id;action=`현장 기록 · ${a.title}`;break;
    }
    case 'indicator.revise': {
      const i=s.indicators.find(i=>i.id===c.indicatorId&&i.projectId===c.projectId&&i.orgId===s.organization.id);if(!i)throw new Error('지표를 찾지 못했어요.');
      positive(c.target);positive(c.forecast);if(i.direction==='higher'&&c.target===0)throw new Error('증가 목표는 0보다 크게 입력해 주세요.');
      if(i.aggregation==='ratio'&&((c.target??0)>100||(c.forecast??0)>100))throw new Error('비율은 100% 이내로 입력해 주세요.');
      if(i.aggregation==='qualitative'&&(c.target!==null||c.forecast!==null))throw new Error('정성 목표는 숫자로 바꾸지 않아요.');
      text(c.reason,'목표 변경 이유');if(c.forecast!==null)text(c.forecastNote,'예상 근거');
      (i.revisions??=[]).push({at:now,target:i.target,forecast:i.forecast,forecastNote:i.forecastNote,reason:c.reason,version:i.version});
      i.target=c.target;i.forecast=c.forecast;i.forecastNote=c.forecastNote;i.version++;projectId=i.projectId;action=`목표·예상 수정 · ${c.reason}`;break;
    }
    case 'measurement.reject': {
      const m=s.measurements.find(m=>m.id===c.measurementId&&m.projectId===c.projectId&&m.orgId===s.organization.id);if(!m||m.status!=='pending')throw new Error('검토할 실적을 찾지 못했어요.');text(c.reason,'보완 이유');m.status='rejected';m.reviewNote=c.reason;projectId=m.projectId;action='실적 보완 요청';break;
    }
    default:return null;
  }
  return {projectId,action};
}
