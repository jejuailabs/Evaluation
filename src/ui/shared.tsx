import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import type { Workspace, Command, EvidenceRef, DocumentVersion } from '../domain/types';

export type Context = { s: Workspace; run: (command: Command) => Promise<boolean>; notify: (text: string) => void; canWrite?:boolean; canManage?:boolean; cloud?:boolean; upload?:(projectId:string,file:File)=>Promise<DocumentVersion>; read?:(version:DocumentVersion)=>Promise<Blob> };
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></>,
    projects: <><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4M8 13h2M14 13h2M8 17h2"/></>,
    files: <><path d="M3 7V4h7l2 3h9v13H3Z"/><path d="M3 10h18"/></>,
    reports: <><path d="M5 3h10l4 4v14H5Z"/><path d="M14 3v5h5M9 17v-3M12 17v-6M15 17v-4"/></>,
    arrow: <><path d="M4 12h15M13 6l6 6-6 6"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.projects}</svg>;
}
export function Heading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="lede">{description}</p>}</div>{action}</div>;
}
export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }
export function Pill({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`pill ${tone}`}>{children}</span>; }
export function Progress({ value, label }: { value: number | null; label?: string }) { return <div className="progress" role="meter" aria-label={label ?? '달성률'} aria-valuenow={value === null ? undefined : Math.min(value,100)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={value === null ? '미설정' : `${value.toFixed(1)}%`}><span style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}/></div>; }
export function Modal({ title, close, children, wide=false }: { title: string; close: () => void; children: ReactNode; wide?:boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);
  return <dialog className={wide?'wide-dialog':undefined} ref={ref} onCancel={close} onClick={e => { if (e.target === ref.current) close(); }}><div className="dialog-head"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="닫기"><Icon name="close"/></button></div>{children}</dialog>;
}
export function Form({ submit, children, label = '저장' }: { submit: (data: FormData) => void | Promise<void>; children?: ReactNode; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true); setError('');
    try { await submit(data); } catch (error) { setError(error instanceof Error ? error.message : '저장하지 못했어요.'); } finally { setBusy(false); }
  }
  return <form onSubmit={onSubmit} className="form">{children}{error && <p role="alert" className="form-error">{error}</p>}<div className="form-footer"><button className="button primary" disabled={busy}>{busy ? '저장 중…' : label}</button></div></form>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
export function Members({ s, name = 'ownerId', initial }: { s: Workspace; name?: string; initial?: string }) { return <select name={name} defaultValue={initial}>{s.members.map(m => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}</select>; }
export function EvidenceSelect({ s, projectId, required = true }: { s: Workspace; projectId: string; required?: boolean }) {
  return <select name="evidence" required={required}><option value="">자료와 버전을 선택해 주세요</option>{s.documents.filter(d => d.orgId === s.organization.id && d.projectId === projectId).flatMap(d => d.versions.map((v,i) => <option key={v.id} value={`${d.id}|${v.id}`}>{d.title} · v{i+1}</option>))}</select>;
}
export function evidenceData(f: FormData): EvidenceRef | undefined { const value = String(f.get('evidence') ?? ''); if (!value) return undefined; const [documentId, versionId] = value.split('|'); return { documentId, versionId }; }
export const textValue = (f: FormData, key: string) => String(f.get(key) ?? '').trim();
export function downloadLink(href: string, children: ReactNode) { return <a className="text-link" href={href}>{children}<Icon name="arrow" size={16}/></a>; }
