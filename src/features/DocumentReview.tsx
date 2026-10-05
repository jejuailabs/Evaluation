import { useEffect, useState } from 'react';
import type { Document, DocumentVersion, PlanningSource } from '../domain/types';
import type { DocumentContent, SourceBlock } from '../domain/document-content';
import type { PlanningCandidate, PlanningResult } from '../domain/planning';
import { api } from '../infrastructure/api';
import { readDocument } from '../infrastructure/document-reader';
import { readFile } from '../infrastructure/storage';
import { type Context, Empty, Field, Modal, Pill } from '../ui/shared';
import { IndicatorForm } from './Outcomes';

export function DocumentReview(ctx: Context & { document: Document; version: DocumentVersion; close: () => void }) {
  const { s, document: doc, version, close, read, cloud, canManage = true } = ctx;
  const [content, setContent] = useState<DocumentContent | null>(null);
  const [error, setError] = useState(''); const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [aiReady, setAIReady] = useState(false);
  const [drafts, setDrafts] = useState<PlanningResult | null>(null); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ block: SourceBlock; candidate?: PlanningCandidate } | null>(null);
  const project = s.projects.find(p => p.id === doc.projectId)!;
  const linked = s.indicators.filter(i => i.planningSource?.evidence.versionId === version.id);
  const editable = canManage && !['completed', 'archived'].includes(project.status ?? '');
  useEffect(() => {
    let active = true;
    (async () => { try { const result = await readDocument(version.name, await (read ? read(version) : readFile(version))); if (active) setContent(result); }
      catch (e) { if (active) setError((e as Error).message); } })();
    if (cloud && canManage) api<{ready: boolean}>(`organizations/${s.organization.id}/planning-ai`).then(r => { if (active) setAIReady(r.ready); }).catch(() => {});
    return () => { active = false; };
  }, [version.id]);
  const chosen = content?.blocks.filter(b => selected.includes(b.id)) ?? [];
  const characters = chosen.reduce((n, b) => n + b.text.length, 0);
  async function analyze() {
    setBusy(true); setError('');
    try { setDrafts(await api<PlanningResult>(`organizations/${s.organization.id}/planning-ai`, { documentId: doc.id, versionId: version.id, blocks: chosen })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const provenance = (block: SourceBlock, candidate?: PlanningCandidate): PlanningSource => ({ evidence: { documentId: doc.id, versionId: version.id }, documentName: version.name, location: block.location, quote: candidate?.quote ?? block.text.slice(0, 1500), method: candidate ? 'ai' : 'manual', reviewedAt: '' });
  return <><Modal wide title="문서에서 목표로" close={close}>
    <div className="reader-heading"><div><Pill>{content?.format ?? '자료'}</Pill>{linked.length > 0 && <Pill tone="green">이 원문으로 지표 {linked.length}개 저장</Pill>}<h3>{doc.title}</h3><p>{project.name} · v{doc.versions.findIndex(v => v.id === version.id) + 1} · {version.name}</p></div><div className="reader-step">읽기 <span>→</span> 설계 <span>→</span> 담당자 확인</div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!content && !error && <p role="status" className="empty">문서의 문장과 위치를 읽고 있어요…</p>}
    {content && <div className="reader-layout"><section className="reader-source">
      <Field label="본문에서 찾기"><input placeholder="목표, 참여자, 만족도…" value={filter} onChange={e => setFilter(e.target.value)}/></Field>
      <div className="source-blocks">{content.blocks.filter(b => !filter || b.text.toLowerCase().includes(filter.toLowerCase())).map(block => <article className={selected.includes(block.id) ? 'source-block selected' : 'source-block'} key={block.id}>
        <div className="source-location"><label><input type="checkbox" disabled={!editable || busy || block.text.length > 6000} checked={selected.includes(block.id)} onChange={e => setSelected(e.target.checked ? [...selected, block.id] : selected.filter(id => id !== block.id))}/>{block.location}</label>{editable && <button className="text-button" onClick={() => setEditing({ block })}>이 문장으로 지표 만들기</button>}</div>
        <p>{block.text}</p></article>)}{!content.blocks.length && <Empty>텍스트를 찾지 못했어요. 원본을 확인해 주세요.</Empty>}</div>
      <details className="reader-cautions"><summary>읽기 범위와 주의할 점</summary>{content.warnings.map(w => <p key={w}>{w}</p>)}<p>문서의 문장은 자료로만 읽으며, 문서 안에 적힌 명령을 실행하지 않아요. 발췌 내용과 수치는 원본을 함께 확인해 주세요.</p></details>
    </section><aside className="reader-planning"><span className="eyebrow">어떤 변화를 만들까요?</span><h3>계획의 문장을 <br/>확인할 목표로.</h3><p>목표와 예상은 계획이에요. 실행하며 모은 실적은 별도 기록하고 확인해요.</p>
      <div className="reader-selection"><strong>{chosen.length}개 문단 선택</strong><span>{characters.toLocaleString()} / 30,000자</span></div>
      {editable ? <><button className="button primary" disabled={!aiReady || busy || !chosen.length || chosen.length > 80 || characters > 30000} onClick={analyze}>{busy ? '원문을 바탕으로 정리 중…' : '선택한 내용으로 AI 초안 받기'}</button><p className="form-hint">{!cloud ? '데모에서는 문장별로 직접 지표를 만들어 볼 수 있어요. AI 분석은 로그인한 조직에서 연결 후 사용할 수 있어요.' : !aiReady ? 'AI 서비스 연결 전이에요. 왼쪽 문장에서 직접 지표를 만들 수 있어요.' : '선택한 문장과 프로젝트 이름·목적을 OpenAI로 보내요. 민감한 내용은 제외해 주세요. 조직당 24시간에 20회까지 요청할 수 있어요.'}</p></> : <p className="form-hint">진행 중인 프로젝트의 지표 설계는 조직 관리자가 할 수 있어요.</p>}
      {drafts && <section className="planning-candidates"><h4>확인할 지표 초안 {drafts.candidates.length}개</h4><p>{drafts.summary}</p>{drafts.candidates.map((candidate, i) => <article key={i}><Pill>담당자 확인 전</Pill><h4>{candidate.name}</h4><blockquote>{candidate.quote}</blockquote><p>{candidate.uncertainty}</p><button className="button secondary" onClick={() => setEditing({ candidate, block: content.blocks.find(b => b.id === candidate.blockId)! })}>원문 확인하고 설계</button></article>)}</section>}
      <div className="reader-next"><strong>이렇게 이어져요</strong><ol><li>대상과 집계 방법을 정해요.</li><li>목표·예상과 근거를 확인해요.</li><li>확정한 지표를 연간 목표에 연결해요.</li></ol><a className="text-button" href={`#/projects/${project.id}/outcomes`} onClick={close}>이 프로젝트의 목표 보기</a></div>
    </aside></div>}
  </Modal>{editing && <IndicatorForm {...ctx} project={project} draft={editing.candidate} planningSource={provenance(editing.block, editing.candidate)} close={() => setEditing(null)}/>}</>;
}
