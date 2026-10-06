import {Carryover} from './Carryover';
import {useState} from 'react';
import type {AnnualPlan} from '../domain/types';
import {annualProjects} from '../domain/annual';
import {annualBudget,projectYearBudget} from '../domain/annual-budget';
import {money} from '../domain/selectors';
import {Field,Modal,Pill,type Context} from '../ui/shared';
export function AnnualBudget(ctx:Context&{plan:AnnualPlan}){
 const {s,plan}=ctx,b=annualBudget(s,plan),projects=annualProjects(s,plan);const [editing,setEditing]=useState(false);
 return <section className="panel annual-allocation"><div className="section-title"><div><h2>올해 쓸 돈을 프로젝트에 나눠요.</h2><p>{plan.budgetPolicy==='yearly'?'승인할 때 연도별 배정액을 확인해요. 여러 해 사업도 올해 몫만 계산해요.':'아직 연도별 배분을 적용하지 않았어요. 기존 사업비를 확인하고 올해 금액을 나눠 주세요.'}</p></div><button className="button primary" disabled={plan.status==='closed'} onClick={()=>setEditing(true)}>프로젝트별 배분</button></div>
 <div className="allocation-totals"><div><small>연간 예산</small><strong>{money(plan.budget)}</strong></div><div><small>올해 배정 합계</small><strong>{money(b.allocated)}</strong></div><div><small>아직 나누지 않은 예산</small><strong>{money(b.remaining)}</strong></div></div>
 {plan.budgetPolicy==='yearly'&&<div className="allocation-list">{projects.map(p=>{const row=projectYearBudget(s,p.id,plan),a=b.rows.find(a=>a.projectId===p.id);return <div key={p.id}><div className="section-title compact"><a href={`#/projects/${p.id}/budget`}>{p.name} →</a><strong>{money(row.allocated)}</strong></div><div className="progress" aria-label={`${p.name} 올해 배정 대비 승인 집행`}><span style={{width:`${row.allocated?Math.min(100,row.spent/row.allocated*100):0}%`}}/></div><p className="footnote">연간 승인 {money(row.spent)} · 예정 {money(row.committed)} · 승인 가능 잔액 {money(row.available)} {row.afterPlanned<0&&<Pill tone="amber">예정 포함 {money(-row.afterPlanned)} 부족</Pill>}</p>{a&&<details><summary>배분 변경 이력 {a.changes.length}건</summary>{[...a.changes].reverse().map((c,i)=><p className="footnote" key={i}>{c.at.slice(0,10)} · {s.members.find(m=>m.id===c.actorId)?.name??'이전 구성원'} · 변경 전 {money(c.previous)}<br/>{c.reason}</p>)}</details>}</div>;})}</div>}
 <Carryover {...ctx}/>{editing&&<AllocationForm {...ctx} close={()=>setEditing(false)}/>}</section>;
}
function AllocationForm({s,run,plan,close}:Context&{plan:AnnualPlan;close:()=>void}){
 const projects=annualProjects(s,plan),[values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(projects.map(p=>[p.id,String(projectYearBudget(s,p.id,plan).allocated)]))),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const total=Object.values(values).reduce((n,v)=>n+Number(v||0),0);
 return <Modal title={`${plan.year}년 프로젝트별 예산 배분`} close={close} wide error={error}><form className="form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{if(await run({type:'annual.budget.allocate',planId:plan.id,allocations:projects.map(p=>({projectId:p.id,amount:Number(values[p.id])})),reason}))close();else setError('배분을 저장하지 못했어요. 화면의 안내를 확인하고 금액을 조정해 주세요.');}finally{setBusy(false);}}}>
 <p>이 금액을 적용하면 승인 집행이 올해 배정액을 넘지 않도록 확인해요. 프로젝트 사이의 재배분은 한 번에 저장돼요.</p><div className="allocation-edit-list">{projects.map(p=>{const other=(s.annualAllocations??[]).filter(a=>a.projectId===p.id&&a.planId!==plan.id).reduce((n,a)=>n+a.amount,0),current=projectYearBudget(s,p.id,plan);return <div key={p.id}><Field label={`${p.name} · 올해 배정액`}><input type="number" step={1} min={current.spent} max={p.budget-other} required value={values[p.id]} disabled={busy} onChange={e=>setValues({...values,[p.id]:e.target.value})}/></Field><small>사업 전체 {money(p.budget)} · 다른 연도 배정 {money(other)} · 올해 승인 {money(current.spent)}</small></div>;})}</div>
 <p role="status" className={total>plan.budget?'form-error':'notice'}>배정 합계 {money(total)} / 연간 예산 {money(plan.budget)} · {total>plan.budget?`${money(total-plan.budget)} 초과`:`미배분 ${money(plan.budget-total)}`}</p><Field label="배분·변경 이유"><textarea value={reason} onChange={e=>setReason(e.target.value)} required maxLength={2000} disabled={busy}/></Field><button className="button primary" disabled={busy||total>plan.budget||!projects.length}>{busy?'저장 중…':'배분 적용'}</button></form></Modal>;
}
