import { useState } from 'react';
import { savedDate, uid } from '../domain/selectors';
import { download, readFile, saveFile } from '../infrastructure/storage';
import type { Document, DocumentVersion } from '../domain/types';
import { type Context, Empty, Field, Form, Heading, Icon, Modal, Pill, textValue } from '../ui/shared';
import { DocumentReview } from './DocumentReview';

type UploadItem = { id: string; file: File; title?: string; status: 'waiting'|'saved'|'error'; error?: string; version?: DocumentVersion };
export function Documents(ctx: Context & { projectId?: string }) {
  const { s, run, notify, projectId, upload, read, cloud, canWrite = true } = ctx;
  const [adding, setAdding] = useState(false); const [versionOf, setVersionOf] = useState<Document | null>(null);
  const [query, setQuery] = useState(''); const [queue, setQueue] = useState<UploadItem[]>([]); const [busy, setBusy] = useState(false);
  const [uploadProject, setUploadProject] = useState(projectId ?? s.projects[0]?.id ?? '');
  const [reader, setReader] = useState<{ document: Document; version: DocumentVersion } | null>(null);
  const activeProjects = s.projects.filter(p => !['completed','archived'].includes(p.status ?? ''));
  const writable = canWrite && (!projectId || activeProjects.some(p => p.id === projectId));
  const docs = s.documents.filter(d => d.orgId === s.organization.id && (!projectId || d.projectId === projectId) && d.title.toLowerCase().includes(query.toLowerCase()));
  function close() { if (!busy) { setAdding(false); setVersionOf(null); setQueue([]); } }
  function add() { setUploadProject(projectId ?? activeProjects[0]?.id ?? ''); setAdding(true); }
  async function original(version: DocumentVersion) { try { download(await (read ? read(version) : readFile(version)), version.name); } catch (e) { notify((e as Error).message); } }
  return <>{projectId ? <div className="section-title"><div><h2>자료와 기록</h2><p>자료를 모으고, 원문에서 목표의 근거를 찾아요.</p></div><button className="button primary" disabled={!writable} onClick={add}><Icon name="plus"/>자료 등록</button></div> : <Heading eyebrow="한곳에 모이는 근거" title="자료함" description="프로젝트의 자료를 모으고, 내용과 버전을 함께 살펴봐요." action={<button className="button primary" disabled={!writable || !activeProjects.length} onClick={add}><Icon name="plus"/>자료 등록</button>}/>}
    <div className="document-intro"><Icon name="files" size={30}/><div><strong>가지고 있는 자료로 시작하세요.</strong><p>HWPX · Word · Excel · PDF · 텍스트의 내용을 읽고, 원문을 보며 지표를 설계할 수 있어요.</p><small>{cloud ? '원본은 조직의 비공개 저장소에 보관해요.' : '데모 자료와 파일은 현재 브라우저에 보관해요.'} 파일당 25MB · 스캔·사진 OCR은 아직 지원하지 않아요.</small></div></div>
    <div className="search-field"><Icon name="search"/><input aria-label="자료 이름 검색" placeholder="자료 이름으로 찾기" value={query} onChange={e => setQuery(e.target.value)}/></div>
    <div className="document-list">{docs.map(d => { const latest = d.versions.at(-1)!; return <article className="document-row" key={d.id}><div className="document-symbol"><Icon name="files" size={26}/></div><div className="document-body"><div className="document-title"><h3>{d.title}</h3><Pill>v{d.versions.length}</Pill></div><p>{s.projects.find(p => p.id === d.projectId)?.name} · {savedDate(latest.createdAt)}</p><details><summary>버전 {d.versions.length}개 보기</summary><div className="versions">{[...d.versions].reverse().map((v, i) => <div key={v.id}><span>v{d.versions.length - i} · {v.name}<small>{savedDate(v.createdAt)} · {v.inlineText !== undefined ? '텍스트 원본' : `${Math.max(1, Math.round(v.size / 1024))} KB`}</small></span><div className="actions"><button className="text-button" onClick={() => setReader({ document: d, version: v })}>내용 열기</button><button className="text-button" onClick={() => original(v)}>원본 받기</button></div></div>)}</div></details></div><div className="actions"><button className="button primary" onClick={() => setReader({ document: d, version: latest })}>내용 열기</button><button className="button secondary" disabled={!canWrite || !activeProjects.some(p => p.id === d.projectId)} onClick={() => setVersionOf(d)}>새 버전</button></div></article>; })}</div>
    {!docs.length && <Empty>{query ? '찾는 자료가 없어요.' : '사업계획서나 현장 사진부터 올려 보세요.'}</Empty>}
    {(adding || versionOf) && <Modal title={versionOf ? '자료의 새 버전' : '자료를 한 번에 모으기'} close={close}><Form label={queue.some(q => q.status === 'error') ? '남은 파일 다시 저장' : '원본 저장'} submit={async f => {
      if (!queue.length) throw new Error('파일을 선택해 주세요.');
      const pId = versionOf?.projectId ?? projectId ?? uploadProject;
      setBusy(true); const next = [...queue];
      try {
        for (let index = 0; index < next.length; index++) {
          const item = next[index]; if (item.status === 'saved') continue;
          try {
            if (!item.file.size || item.file.size > 25 * 1024 * 1024) throw new Error('비어 있지 않은 25MB 이내 파일을 선택해 주세요.');
            item.title ??= ((next.length === 1 ? textValue(f, 'title') : '') || item.file.name).slice(0,160);
            const id = item.version?.id ?? uid();
            const version = item.version ?? (upload ? await upload(pId, item.file) : (await saveFile(id, item.file), { id, name: item.file.name, size: item.file.size, createdAt: new Date().toISOString(), blobKey: id }));
            item.version = version;
            const ok = await run(versionOf ? { type: 'document.version', projectId: pId, documentId: versionOf.id, version } : { type: 'document.add', document: { id: item.id, orgId: s.organization.id, projectId: pId, title: item.title, versions: [version] } });
            if (!ok) throw new Error('등록하지 못했어요. 알림 내용을 확인하고 다시 저장해 주세요.');
            next[index] = { ...item, status: 'saved', error: undefined };
          } catch (e) { next[index] = { ...item, status: 'error', error: (e as Error).message }; }
          setQueue([...next]);
        }
        if (next.every(q => q.status === 'saved')) { setAdding(false); setVersionOf(null); setQueue([]); }
      } finally { setBusy(false); }
    }}><fieldset disabled={busy || queue.some(q => q.version)} className="upload-fields">{!versionOf && !projectId && <Field label="프로젝트"><select value={uploadProject} onChange={e => setUploadProject(e.target.value)} required>{activeProjects.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></Field>}{!versionOf && queue.length <= 1 && <Field label="자료 이름 · 비워 두면 파일명 사용"><input name="title" maxLength={160}/></Field>}</fieldset>{versionOf && <p className="muted">{versionOf.title} · 기존 버전과 연결된 근거는 그대로 남아요.</p>}
      <Field label={versionOf ? '새 원본 선택' : '파일 선택 · 한 번에 최대 12개'}><input type="file" multiple={!versionOf} disabled={busy || queue.some(q => q.version)} onChange={e => { const files = [...(e.target.files ?? [])]; if (files.length > 12) { notify('한 번에 12개까지 선택해 주세요.'); e.target.value = ''; setQueue([]); return; } setQueue(files.map(file => ({ id: uid(), file, status: 'waiting' }))); }}/></Field>
      <div className="upload-queue" aria-live="polite">{queue.map(q => <div key={q.id}><strong>{q.file.name}</strong><span>{q.status === 'saved' ? '등록 완료' : q.status === 'error' ? q.error : '등록 대기'}</span></div>)}</div><p className="form-hint">원본을 먼저 보관해요. 등록 후 ‘내용 열기’에서 문서를 읽을 수 있어요. 여러 파일 중 실패한 파일만 다시 저장할 수 있어요.</p></Form></Modal>}
    {reader && <DocumentReview key={reader.version.id} {...ctx} {...reader} close={() => setReader(null)}/>}
  </>;
}
