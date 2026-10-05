import type { Workspace, DocumentVersion } from '../domain/types';
import { createSeed } from '../domain/seed';

export type WorkspaceMode = 'demo' | 'personal';
// Keep the original demo key so existing visitors do not lose their work.
const keys = { demo: 'value-lens-saas:workspace:v1', personal: 'value-lens-saas:personal-preview:v1' };
export function loadWorkspace(mode: WorkspaceMode = 'demo'): Workspace | null {
  const raw = localStorage.getItem(keys[mode]);
  if (!raw) return mode === 'demo' ? createSeed() : null;
  const data = JSON.parse(raw) as Workspace;
  if (data.schemaVersion !== 1 || !Number.isSafeInteger(data.revision) || !data.organization?.id ||
    !['members', 'projects', 'tasks', 'documents', 'expenses', 'indicators', 'measurements', 'reports', 'events'].every(k => Array.isArray(data[k as keyof Workspace]))) {
    throw new Error('저장된 자료의 형식이 달라요. 원본을 덮어쓰지 않았어요.');
  }
  return data;
}
export function saveWorkspace(next: Workspace, expectedRevision: number, mode: WorkspaceMode = 'demo'): void {
  const raw = localStorage.getItem(keys[mode]);
  if (raw && (JSON.parse(raw) as Workspace).revision !== expectedRevision) throw new Error('다른 창에서 변경했어요. 새로고침한 뒤 다시 저장해 주세요.');
  if (raw && (JSON.parse(raw) as Workspace).organization.id !== next.organization.id) throw new Error('다른 작업실을 덮어쓸 수 없어요. 새로고침해 주세요.');
  localStorage.setItem(keys[mode], JSON.stringify(next));
}
export function initializePersonalWorkspace(workspace: Workspace): void {
  if (localStorage.getItem(keys.personal) !== null) throw new Error('이 브라우저에 만든 작업실이 있어요. 새로고침해서 이어서 사용해 주세요.');
  localStorage.setItem(keys.personal, JSON.stringify(workspace));
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('value-lens-saas-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('이 브라우저에서 파일 저장 공간을 열지 못했어요.'));
  });
}
export async function saveFile(key: string, file: File): Promise<void> {
  if (file.size > 25 * 1024 * 1024) throw new Error('이 시제품에서는 파일당 25MB까지 저장할 수 있어요.');
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(file, key);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new Error('파일 저장에 실패했어요. 저장 공간을 확인해 주세요.'));
    });
  } finally { db.close(); }
}
export async function readFile(version: DocumentVersion): Promise<Blob> {
  if (version.inlineText !== undefined) return new Blob([version.inlineText], { type: 'text/plain;charset=utf-8' });
  const db = await database();
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const request = db.transaction('files').objectStore('files').get(version.blobKey!);
      request.onsuccess = () => request.result ? resolve(request.result as Blob) : reject(new Error('이 브라우저에서 원본 파일을 찾지 못했어요.'));
      request.onerror = () => reject(new Error('원본을 불러오지 못했어요.'));
    });
  } finally { db.close(); }
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
