import { useEffect, useRef, useState } from 'react';
import type { EvidenceRef, Project } from '../domain/types';
import type { OutcomeAnalysis as Analysis, OutcomeDraft } from '../domain/outcome-analysis';
import { aggregationLabels, assessmentLabels } from '../domain/standards';
import { api } from '../infrastructure/api';
import { readFile } from '../infrastructure/storage';
import { readDocument } from '../infrastructure/document-reader';
import { type Context, Empty, Field, Modal, Pill } from '../ui/shared';

export type OutcomeSelection = { candidate: OutcomeDraft; evidence: EvidenceRef; documentName: string; kind: Analysis['kind'] };
export function OutcomeAnalysis(ctx:Context&{project:Project;close:()=>void;review:(draft:OutcomeSelection)=>void}) {
  const {s,project,cloud,close,review}=ctx;
  const documents=s.documents.filter(d=>d.projectId===project.id), indicators=s.indicators.filter(i=>i.projectId===project.id);
  const [versionKey,setVersionKey]=useState(''),[chosen,setChosen]=useState<string[]>(indicators.slice(0,8).map(i=>i.id));
  const [ready,setReady]=useState(false),[checking,setChecking]=useState(!!cloud),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [result,setResult]=useState<Analysis|null>(null),[preview,setPreview]=useState<EvidenceRef|null>(null);
  const controller=useRef<AbortController|null>(null);
  const [documentId,versionId]=versionKey.split('|');
  const version=documents.find(d=>d.id===documentId)?.versions.find(v=>v.id===versionId);
  const supported=!!version&&(version.inlineText!==undefined||/\.(txt|md|csv|tsv|json|log|docx|hwpx|xlsx|png|jpe?g|webp|pdf)$/i.test(version.name));
  useEffect(()=>{let active=true;if(cloud)api<{ready:boolean}>(`organizations/${s.organization.id}/outcome-ai`).then(r=>{if(active)setReady(r.ready);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setChecking(false);});return()=>{active=false;controller.current?.abort();};},[s.organization.id,cloud]);
  async function analyze(){
    setError('');setResult(null);setBusy(true);const abort=new AbortController();controller.current=abort;
    try{const r=await api<Analysis>(`organizations/${s.organization.id}/outcome-ai`,{documentId,versionId,indicatorIds:chosen},'POST',{signal:abort.signal,timeoutMs:60000});if(!abort.signal.aborted)setResult(r);}
    catch(e){if(!abort.signal.aborted)setError((e as Error).message);}finally{if(!abort.signal.aborted)setBusy(false);}
  }
  return <><Modal wide title="자료에서 실적 찾기" close={close}>
    <div className="reader-heading"><div><Pill>실행 기록 → 확인할 결과</Pill><h3>남긴 자료를 실적으로 연결해요.</h3><p>AI가 찾은 내용은 초안이에요. 원본을 확인해 기록하고, 관리자 확인 후 성과에 반영해요.</p></div></div>
    <div className="reader-layout"><section className="reader-source">
      <Field label="분석할 자료와 버전"><select value={versionKey} disabled={busy} onChange={e=>{setVersionKey(e.target.value);setResult(null);setError('');}}><option value="">원본을 선택해 주세요</option>{documents.flatMap(d=>d.versions.map((v,index)=><option key={v.id} value={`${d.id}|${v.id}`}>{d.title} · v{index+1} · {v.name}</option>))}</select></Field>
      {!documents.length&&<Empty>먼저 프로젝트의 자료·기록에 파일을 올려 주세요. <a href={`#/projects/${project.id}/documents`} onClick={close}>자료·기록 열기 →</a></Empty>}
      {version&&<p><button className="text-button" onClick={()=>setPreview({documentId,versionId})}>선택한 원본 확인 ↗</button></p>}
      <fieldset className="outcome-choices" disabled={busy}><legend>어떤 지표의 실적을 찾을까요? · 최대 8개</legend>{indicators.map(i=><label key={i.id}><input type="checkbox" checked={chosen.includes(i.id)} disabled={!chosen.includes(i.id)&&chosen.length>=8} onChange={e=>{setChosen(e.target.checked?[...chosen,i.id]:chosen.filter(id=>id!==i.id));setResult(null);}}/><span><strong>{i.name}</strong><small className="block">{aggregationLabels[i.aggregation]} · {i.unit}</small></span></label>)}</fieldset>
      {!indicators.length&&<p className="notice">지표를 먼저 설계해 주세요. 정해 둔 목표에 맞춰 결과를 찾아요.</p>}
      <p className="form-hint">HWPX·DOCX·XLSX·텍스트·CSV, JPG·PNG·WEBP, PDF를 읽어요. 파일당 8MB(PDF 5MB), 본문은 3만 자·200행/문단까지예요. 음성·구형 HWP·XLS는 변환 후 이용해 주세요.</p>
      {version&&!supported&&<p className="notice">이 파일은 보관할 수 있지만 아직 직접 분석할 수 없어요. 위 지원 형식으로 변환해 주세요.</p>}
      {!cloud&&<p className="notice">데모에서는 직접 실적을 기록하고 확인할 수 있어요. 실제 AI 분석은 로그인한 조직의 보관 자료로 진행해요.</p>}
      {cloud&&!checking&&!ready&&!error&&<p className="notice">AI 연결 전이에요. 직접 실적을 기록하거나 관리자에게 연결 상태를 확인해 주세요.</p>}
      <button className="button primary" disabled={!ready||busy||!supported||!chosen.length} onClick={analyze}>{busy?'원본에서 결과를 찾고 있어요…':checking?'연결 확인 중…':'AI로 실적 찾기'}</button>
      {cloud&&ready&&<p className="form-hint">선택한 자료의 본문(사진·PDF는 파일 전체), 프로젝트 이름·목적, 선택한 지표 정의를 OpenAI로 보내요. 조직당 24시간에 20회까지예요. 결과는 보통 수십 초 걸려요.</p>}
      {error&&<p className="form-error" role="alert">{error}</p>}
    </section><section className="reader-planning" aria-live="polite">
      {!result&&!busy&&<Empty>자료를 고르면, 지표별로 찾은 수치와 근거를 여기에 정리해 드려요.</Empty>}
      {busy&&<p role="status" className="notice">원문, 지표 정의, 집계 기간을 대조하고 있어요. 아직 실적을 저장하지 않았어요.</p>}
      {result&&<><h3>확인할 제안 {result.candidates.length}개</h3><p>{result.summary}</p>{result.warnings.map(w=><p className="form-hint" key={w}>{w}</p>)}{!result.candidates.length&&<Empty>이 자료에서 확실한 실적 근거를 찾지 못했어요. 숫자를 임의로 채우지 않았어요. 다른 자료를 선택하거나 직접 기록해 주세요.</Empty>}
        {result.candidates.map((c,index)=>{const i=indicators.find(i=>i.id===c.indicatorId)!;return <article className="outcome-draft" key={index}><Pill tone="amber">확인 전 제안</Pill><h3>{i.name}</h3><strong className="draft-value">{c.assessment?assessmentLabels[c.assessment]:c.value===null?'수치 확인 필요':i.aggregation==='ratio'?`${c.value} / ${c.denominator??'분모 확인 필요'}`:`${c.value.toLocaleString()} ${i.unit}`}</strong><p>{c.periodStart?`${c.periodStart} ~ `:''}{c.asOf??'집계 날짜 확인 필요'}</p><small>{c.location}</small><blockquote>{c.quote}</blockquote><p>{c.explanation}</p>{c.uncertainty&&<p className="notice">확인할 점: {c.uncertainty}</p>}<button className="button secondary" onClick={()=>review({candidate:c,evidence:result.evidence,documentName:result.documentName,kind:result.kind})}>검토하고 기록하기 →</button></article>;})}</>}
    </section></div>
  </Modal>{preview&&<EvidenceViewer {...ctx} evidence={preview} close={()=>setPreview(null)}/>}</>;
}

export function EvidenceViewer({s,read,evidence,close}:Context&{evidence:EvidenceRef;close:()=>void}){
  const doc=s.documents.find(d=>d.id===evidence.documentId),version=doc?.versions.find(v=>v.id===evidence.versionId);
  const [url,setUrl]=useState(''),[content,setContent]=useState(''),[error,setError]=useState('');
  const image=!!version&&/\.(jpe?g|png|webp)$/i.test(version.name),pdf=!!version&&/\.pdf$/i.test(version.name);
  useEffect(()=>{let active=true,objectUrl='';(async()=>{try{if(!version)throw new Error('원본 버전을 찾지 못했어요.');const blob=await(read?read(version):readFile(version));if(!active)return;
    const ext=version.name.split('.').at(-1)?.toLowerCase();const type=pdf?'application/pdf':image?`image/${ext==='jpg'?'jpeg':ext}`:'application/octet-stream';
    objectUrl=URL.createObjectURL(new Blob([blob],{type}));setUrl(objectUrl);
    if(!image&&!pdf){const parsed=await readDocument(version.name,blob);if(active)setContent(parsed.blocks.map(b=>`${b.location}\n${b.text}`).join('\n\n'));}
  }catch(e){if(active)setError((e as Error).message);}})();return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[version?.id]);
  return <Modal wide title="기록의 원본 확인" close={close}><p>{doc?.title} · {version?.name} · 버전 {version?.id.slice(0,8)}</p>{url&&<a className="button secondary" href={url} download={version?.name}>원본 내려받기</a>}{error&&<p className="form-error" role="alert">{error}</p>}{!url&&!error&&<p role="status">원본을 불러오고 있어요…</p>}{url&&image&&<img className="evidence-preview" src={url} alt="분석한 원본 자료"/>}{url&&pdf&&<iframe className="evidence-pdf" src={url} title="분석한 원본 PDF"/>}{content&&<pre className="evidence-text">{content}</pre>}</Modal>;
}
