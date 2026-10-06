import {ReportDeliverables} from './ReportDeliverables';
import { useState } from 'react';
import type { AnnualReport, Report } from '../domain/types';
import { reportActionLabels, reportStatus, reportStatusLabels, reportVersion, submissionChannels, type ReportAction } from '../domain/report-workflow';
import { savedDate, today } from '../domain/selectors';
import { type Context, Field, Form, Modal, Pill, textValue } from '../ui/shared';

type Action=ReportAction['action'];
export function ReportWorkflow(ctx:Context & {report:Report|AnnualReport;select:(id:string)=>void}){
  const {s,report:r,run,canManage=true,canWrite=true,memberId=s.members[0]?.id,select}=ctx;
  const [modal,setModal]=useState<{action:Action;version:number;submissionId?:string}|null>(null),[busy,setBusy]=useState(false);
  const status=reportStatus(r),kind='planId' in r?'annual':'project',w=r.workflow;
  const mine=canWrite&&(canManage||r.createdById===memberId),rows=kind==='annual'?s.annualReports??[]:s.reports;
  const next=rows.find(x=>x.previousReportId===r.id),previous=rows.find(x=>x.id===r.previousReportId);
  function open(action:Action,submissionId?:string){ctx.clearError?.();setModal({action,version:reportVersion(r),submissionId});}
  async function submit(f:FormData){
    if(!modal)return;setBusy(true);
    const reason=textValue(f,'reason');let operation:ReportAction;
    if(modal.action==='request')operation={action:'request',recipient:textValue(f,'recipient'),reason};
    else if(modal.action==='submit')operation={action:'submit',date:textValue(f,'date'),recipient:textValue(f,'recipient'),channel:textValue(f,'channel') as keyof typeof submissionChannels,format:textValue(f,'format') as 'docx'|'xlsx'|'html'|'pdf'|'hwpx'|'zip',artifactId:textValue(f,'artifactId')||undefined,reference:textValue(f,'reference'),reason};
    else if(modal.action==='void')operation={action:'void',submissionId:modal.submissionId!,reason};
    else if(modal.action==='revise')operation={action:'revise',note:textValue(f,'note'),reason};
    else operation={action:modal.action,reason};
    try{if(await run({type:'report.workflow',kind,reportId:r.id,expectedVersion:modal.version,operation})){setModal(null);ctx.notify(`${reportActionLabels[operation.action]}을 저장했어요.`);}}finally{setBusy(false);}
  }
  return <section className="panel report-workflow" aria-label="보고서 승인·제출">
    <div className="section-title compact"><div><h3>검토에서 제출 기록까지</h3><Pill tone={status==='approved'||status==='submitted'?'green':''}>{reportStatusLabels[status]}</Pill><small className="block">보고서 {r.id.slice(0,8)}{w?.recipient?` · 제출 예정: ${w.recipient}`:''}</small></div></div>
    <p className="muted">내용은 보고서 생성 시점에 고정돼요. 조직 내부 승인 후 실제 제출한 내역을 남길 수 있어요.</p>
    {status==='returned'&&<p className="notice">보완 의견을 확인하고 원본 기록을 고친 뒤, 수정본을 만들어 다시 검토 요청해 주세요.</p>}
    <div className="actions">
      {mine&&status==='draft'&&!next&&<button className="button primary" onClick={()=>open('request')}>검토 요청</button>}
      {mine&&status==='in-review'&&<button className="button secondary" onClick={()=>open('withdraw')}>검토 요청 철회</button>}
      {canWrite&&canManage&&status==='in-review'&&<><button className="button primary" onClick={()=>open('approve')}>내부 승인</button><button className="button secondary" onClick={()=>open('return')}>보완 요청</button></>}
      {canWrite&&canManage&&(status==='approved'||status==='submitted')&&<button className="button primary" onClick={()=>open('submit')}>제출 기록 남기기</button>}
      {canWrite&&canManage&&status==='approved'&&<button className="text-button" onClick={()=>open('revoke')}>승인 철회</button>}
      {mine&&status!=='in-review'&&!next&&<button className="button secondary" onClick={()=>open('revise')}>수정본 만들기</button>}
      {next&&<button className="text-button" onClick={()=>select(next.id)}>수정본 열기 →</button>}
      {previous&&<button className="text-button" onClick={()=>select(previous.id)}>이전 보고서 보기</button>}
    </div>
    {r.revisionReason&&<p className="form-hint">수정 이유: {r.revisionReason}</p>}
    {!!w?.submissions.length&&<div className="report-submissions"><h4>제출 기록</h4>{w.submissions.map(x=><article key={x.id}><strong>{x.date} · {x.recipient}</strong><Pill>{x.voided?'무효 기록':submissionChannels[x.channel]}</Pill><p>{x.format.toUpperCase()} · {x.reference}<br/>{x.note}</p><small>{x.actorName} · 기록 {savedDate(x.at)}{x.voided?` · 무효 사유: ${x.voided.reason}`:''}</small>{canWrite&&canManage&&!x.voided&&<button className="text-button" onClick={()=>open('void',x.id)}>잘못된 기록 무효화</button>}</article>)}</div>}
    {!!w?.history.length&&<details className="report-history"><summary>처리 이력 {w.history.length}건</summary><ol>{[...w.history].reverse().map(h=><li key={h.id}><strong>{reportActionLabels[h.action]}</strong> · {h.actorName} · {savedDate(h.at)}<p className="preserve">{h.reason}</p></li>)}</ol></details>}
    <ReportDeliverables {...ctx}/><small className="block muted">외부 전송 기능은 없어요. 제출 기록은 담당자의 입력이며, 수신 기관의 접수·승인을 자동 확인하지 않아요.</small>
    {modal&&<Modal title={reportActionLabels[modal.action]} close={()=>{if(!busy)setModal(null);}} error={ctx.saveError}><Form label={reportActionLabels[modal.action]} submit={submit}>
      {(modal.action==='request'||modal.action==='submit')&&<Field label={modal.action==='request'?'제출 예정 기관':'실제 제출처'}><input name="recipient" required maxLength={200} defaultValue={w?.recipient??''}/></Field>}
      {modal.action==='approve'&&<p className="form-hint">현재 보고서의 수치·근거·해석을 확인한 뒤 조직 내부 승인으로 기록해요.</p>}
      {modal.action==='submit'&&<><p className="notice">실제 제출을 마친 뒤 기록해 주세요. 이 버튼은 파일을 보내지 않아요.</p><div className="form-grid"><Field label="제출일"><input name="date" type="date" required max={today()} defaultValue={today()}/></Field><Field label="제출 경로"><select name="channel">{Object.entries(submissionChannels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field></div><Field label="제출한 파일 형식"><select name="format"><option value="hwpx">한글 HWPX</option><option value="zip">근거 묶음 ZIP</option><option value="docx">Word 문서</option><option value="xlsx">Excel 집계표</option><option value="pdf">PDF</option><option value="html">웹 문서</option></select></Field><Field label="고정한 실제 제출 파일"><select name="artifactId" required={!!ctx.cloud} onChange={e=>{const format=r.artifacts?.find(a=>a.id===e.target.value)?.file.name.split('.').at(-1)?.toLowerCase();const field=e.currentTarget.form?.elements.namedItem('format');if(format&&field instanceof HTMLSelectElement)field.value=format;}}><option value="">제출 파일 선택</option>{r.artifacts?.map(a=><option key={a.id} value={a.id}>{a.file.name}</option>)}</select></Field><Field label="접수번호 또는 제출 확인 정보"><input name="reference" required maxLength={500} placeholder="예: 기관 접수번호, 발송 메일 제목과 시각"/></Field></>}
      {modal.action==='void'&&<p className="notice">입력 오류를 무효 기록으로 남겨요. 이미 외부에 보낸 자료를 회수하는 기능은 아니에요.</p>}
      {modal.action==='revise'&&<><p className="notice">같은 보고 기간의 최신 원본 기록으로 새 초안을 만들어요. 이전 보고서와 처리 이력은 보존해요.</p><Field label="수정본의 결과 해석과 다음 계획"><textarea name="note" rows={5} maxLength={10000} defaultValue={r.note}/></Field></>}
      <Field label={modal.action==='return'?'보완할 내용':'처리 사유·메모'}><textarea name="reason" required rows={3} maxLength={10000}/></Field>
    </Form></Modal>}
  </section>;
}
