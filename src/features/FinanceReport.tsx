import type {FinanceSnapshot,Workspace} from '../domain/types';
import {expenseLabels,money,ownerName} from '../domain/selectors';
import {expensePaid} from '../domain/finance-selectors';

export function FinanceInbox({s,canManage,memberId}:{s:Workspace;canManage:boolean;memberId?:string}){
  const rows=s.expenses.filter(e=>canManage?e.status==='submitted'||e.status==='confirmed':e.ownerId===memberId&&e.status==='returned');
  if(!rows.length)return null;
  return <section className="finance-inbox"><div><h2>{canManage?'처리할 지출':'보완할 지출'} <small>{rows.length}건</small></h2><p>{canManage?'검토할 요청과 남은 지급을 확인하세요.':'검토 의견을 확인하고 다시 요청하세요.'}</p></div><div>{rows.slice(0,4).map(e=><a key={e.id} href={`#/projects/${e.projectId}/budget`}><span><strong>{e.title}</strong><small>{s.projects.find(p=>p.id===e.projectId)?.name} · {ownerName(s,e.ownerId)}</small></span><span>{expenseLabels[e.status]}<strong>{money(e.status==='confirmed'?e.amount-expensePaid(e):e.amount)}</strong></span></a>)}</div></section>;
}
export function FinanceReport({finance:f}:{finance?:FinanceSnapshot}){
  if(!f)return null;
  return <section className="finance-report"><h3>집행·지급 명세</h3><p className="form-hint">집행액은 집행일, 지급액은 지급일 기준이에요. 미지급은 보고 종료일까지의 잔액이며, 처리 상태는 보고서를 만든 당시 기준이에요.</p><div className="table-wrap"><table><thead><tr><th>요청 / 담당자</th><th>세목 / 재원</th><th>기간 집행 / 지급</th><th>상태</th></tr></thead><tbody>{f.expenses.map(e=><tr key={e.id}><td>{e.title}<small className="block">{e.projectName} · {e.ownerName}</small></td><td>{e.budgetLineName}<small className="block">{e.fundingSource}</small></td><td>{money(e.periodSpent)}<small className="block">지급 {money(e.periodPaid)}</small></td><td>{expenseLabels[e.status]}</td></tr>)}</tbody></table></div>{!f.expenses.length&&<p>이 기간에 해당하는 집행·지급이 없어요.</p>}</section>;
}
