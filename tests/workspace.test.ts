import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyWorkspace } from '../src/domain/workspace';
import { execute } from '../src/domain/commands';
import { initializePersonalWorkspace, loadWorkspace, saveWorkspace } from '../src/infrastructure/storage';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
} });
beforeEach(() => values.clear());

test('처음 시작은 데모가 아닌 빈 상태, 기존 데모는 유지', () => {
  assert.equal(loadWorkspace('personal'), null);
  assert.equal(loadWorkspace('demo')!.projects.length, 2);
  const blank = createEmptyWorkspace('새 조직', '새 담당자');
  initializePersonalWorkspace(blank);
  for (const key of ['projects', 'tasks', 'documents', 'expenses', 'indicators', 'measurements', 'reports', 'events'] as const) assert.deepEqual(loadWorkspace('personal')![key], []);
  assert.equal(loadWorkspace('personal')!.members.length, 1);
  assert.equal(loadWorkspace('demo')!.projects.length, 2);
});

test('새 프로젝트 저장·재방문과 데모 수정은 서로 섞이지 않음', () => {
  const blank = createEmptyWorkspace('우리 조직', '우리 담당자');
  initializePersonalWorkspace(blank);
  const next = execute(blank, { type: 'project.add', project: {
    id: 'first-project', orgId: blank.organization.id, name: '우리 첫 사업', purpose: '이웃과 함께해요',
    start: '2026-10-05', end: '2026-12-31', ownerId: blank.members[0].id, budget: 1000000, category: '새 프로젝트',
  } });
  saveWorkspace(next, blank.revision, 'personal');
  const demo = loadWorkspace('demo')!;
  demo.organization.name = '수정한 데모';
  saveWorkspace(demo, demo.revision, 'demo');
  assert.equal(loadWorkspace('personal')!.organization.name, '우리 조직');
  assert.deepEqual(loadWorkspace('personal')!.projects.map(p => p.name), ['우리 첫 사업']);
  assert.equal(loadWorkspace('demo')!.organization.name, '수정한 데모');
  assert.equal(loadWorkspace('demo')!.projects.length, 2);
});

test('온보딩 재실행과 다른 조직·오래된 탭의 덮어쓰기를 거부', () => {
  const blank = createEmptyWorkspace('우리 조직', '담당자');
  initializePersonalWorkspace(blank);
  const another = createEmptyWorkspace('다른 조직', '담당자');
  assert.throws(() => initializePersonalWorkspace(another), /만든 작업실/);
  assert.throws(() => saveWorkspace(another, 0, 'personal'), /다른 작업실/);
  saveWorkspace({ ...blank, revision: 1 }, 0, 'personal');
  assert.throws(() => saveWorkspace(blank, 0, 'personal'), /다른 창/);
  assert.equal(loadWorkspace('personal')!.organization.id, blank.organization.id);
});

test('잘못된 개인 작업실은 예시 데이터로 대체하거나 덮어쓰지 않음', () => {
  values.set('value-lens-saas:personal-preview:v1', '{broken');
  assert.throws(() => loadWorkspace('personal'));
  assert.equal(values.get('value-lens-saas:personal-preview:v1'), '{broken');
  assert.throws(() => createEmptyWorkspace('  ', '이름'));
});
