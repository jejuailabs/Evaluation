import {useEffect,useState} from 'react';
import type {IntakeItem} from '../domain/types';
import {audioLimit,audioMime,transcriptionBusy} from '../domain/meeting';
import {savedDate,ownerName} from '../domain/selectors';
import {api,type CloudWorkspace} from '../infrastructure/api';
import {readFile} from '../infrastructure/storage';
import {type Context,Field,Form,Modal,Pill} from '../ui/shared';

export function MeetingReview(ctx:Context&{item:IntakeItem;close:()=>void}){
 const {item,cloud,close}=ctx,current=ctx.s.intakeItems?.find(i=>i.id===item.id)??item;
 const [text,setText]=useState(item.meeting?.text??''),[notes,setNotes]=useState(item.meeting?.notes??''),[revision,setRevision]=useState(item.meeting?.revision??0),[reviewed,setReviewed]=useState(false);
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[url,setUrl]=useState(''),[now,setNow]=useState(Date.now());
 const writable=ctx.canWrite!==false&&current.status==='pending'&&(ctx.canManage!==false||current.createdById===ctx.memberId);
 const processing=transcriptionBusy(current.transcription,now),changed=(current.meeting?.revision??0)!==revision;
 useEffect(()=>{let active=true,objectUrl='';if(cloud&&writable)api<{ready:boolean}>(`organizations/${ctx.s.organization.id}/meeting-ai`).then(r=>{if(active)setReady(r.ready);}).catch(e=>{if(active)setError(e.message);});
  (async()=>{try{const original=await(ctx.read?ctx.read(item.version):readFile(item.version));if(!active)return;objectUrl=URL.createObjectURL(new Blob([original],{type:audioMime(item.version.name)}));setUrl(objectUrl);}catch(e){if(active)setError((e as Error).message);}})();
  const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{active=false;clearInterval(timer);if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[item.id]);
 function useSaved(saved:IntakeItem){setText(saved.meeting?.text??'');setNotes(saved.meeting?.notes??'');setRevision(saved.meeting?.revision??0);setReviewed(false);}
 async function transcribe(){setBusy(true);setError('');try{const result=await api<CloudWorkspace>(`organizations/${ctx.s.organization.id}/meeting-ai`,{id:item.id},'POST',{timeoutMs:75000});const saved=result.workspace.intakeItems?.find(i=>i.id===item.id);if(saved)useSaved(saved);await ctx.refresh?.();}catch(e){setError((e as Error).message);await ctx.refresh?.().catch(()=>{});}finally{setBusy(false);}}
 return <Modal wide title="회의 기록 검토" close={()=>{if(!busy)close();}} error={ctx.saveError}><p><strong>{current.title}</strong> · {current.version.name}</p>{url&&<audio className="meeting-audio" controls src={url}/>}
  <p className="form-hint">녹음과 대조해 이름·숫자·결정 사항을 확인해 주세요. 전사문은 화자를 구분하지 않으며 성과를 자동 확정하지 않아요.</p>
  {current.meeting?.reviewedAt&&<p><Pill>확인한 기록</Pill> {ownerName(ctx.s,current.meeting.reviewedById??'')} · {savedDate(current.meeting.reviewedAt)}</p>}
  {writable&&!current.meeting&&<div className="meeting-transcribe"><button className="button secondary" disabled={!ready||busy||processing||!!text||!!notes||item.version.size>audioLimit} onClick={transcribe}>{busy||processing?'음성을 글로 옮기고 있어요…':current.transcription?.status==='failed'?'음성 전사 다시 시도':'AI로 음성 전사'}</button><p className="form-hint">선택한 녹음 전체를 OpenAI로 보내요. 파일당 25MB, 조직당 24시간에 20회까지예요. 긴 녹음은 나누어 주세요. 직접 작성한 내용이 있으면 먼저 초안으로 저장해 주세요.</p>{!cloud&&<p className="notice">데모에서는 녹음 보관과 직접 작성·검토를 체험해요. AI 전사는 로그인한 조직에서 사용할 수 있어요.</p>}{cloud&&!ready&&!error&&<p className="form-hint">전사 연결을 확인 중이거나 연결되지 않았어요. 직접 작성할 수 있어요.</p>}</div>}
  {current.transcription?.status==='failed'&&!current.meeting&&<p className="notice">{current.transcription.error} 원본은 그대로 보관돼 있어요.</p>}
  {processing&&!busy&&<button className="text-button" onClick={()=>ctx.refresh?.().catch(e=>setError(e.message))}>전사 상태 새로고침</button>}
  {changed&&<p className="notice">저장된 회의 기록이 바뀌었어요. 작성 중인 입력은 유지했어요. <button className="text-button" onClick={()=>useSaved(current)}>최신 기록 불러오기</button></p>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  {current.meeting?.originalText&&<details className="meeting-original"><summary>AI가 처음 옮긴 원문 보기</summary><pre className="intake-text">{current.meeting.originalText}</pre></details>}
  {writable?<Form label={reviewed?'검토한 회의 기록 확인':'회의 초안 저장'} submit={async()=>{if(busy||processing||changed)throw new Error('전사 또는 다른 사람의 변경을 확인해 주세요.');if(await ctx.run({type:'intake.meeting.save',id:item.id,expectedRevision:revision,text,notes,reviewed}))close();}}><Field label="전사문 · 직접 수정 가능"><textarea rows={10} required maxLength={30000} value={text} disabled={busy||processing} onChange={e=>{setText(e.target.value);setReviewed(false);}}/></Field><Field label="회의 내용·결정·할 일"><textarea rows={6} required={reviewed} maxLength={10000} value={notes} disabled={busy||processing} placeholder="확인한 내용, 결정한 사항, 후속 업무를 적어 주세요." onChange={e=>{setNotes(e.target.value);setReviewed(false);}}/></Field><label className="check-row"><input type="checkbox" checked={reviewed} disabled={busy||processing} onChange={e=>setReviewed(e.target.checked)}/>원본과 대조했고 프로젝트에 연결할 회의 내용을 확인했어요.</label><p className="form-hint">확인 후 자료함의 프로젝트 연결에서 활동일·업무·목표를 고를 수 있어요.</p></Form>:<><h3>회의 내용·결정·할 일</h3><pre className="intake-text">{current.meeting?.notes||'아직 작성한 회의 내용이 없어요.'}</pre><h3>검토한 전사문</h3><pre className="intake-text">{current.meeting?.text||'아직 전사하지 않았어요.'}</pre></>}
 </Modal>;
}
