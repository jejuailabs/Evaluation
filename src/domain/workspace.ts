import type { Workspace } from './types';

// A local onboarding preview, not an authenticated account or tenant boundary.
export function createEmptyWorkspace(organizationName: string, memberName: string): Workspace {
  const name = organizationName.trim();
  const member = memberName.trim();
  if (!name || name.length > 80 || !member || member.length > 40) {
    throw new Error('조직 이름은 80자, 내 이름은 40자 이내로 입력해 주세요.');
  }
  return {
    schemaVersion: 1, revision: 0,
    organization: { id: crypto.randomUUID(), name },
    members: [{ id: crypto.randomUUID(), name: member, role: '담당자' }],
    projects: [], tasks: [], documents: [], expenses: [], indicators: [],
    measurements: [], reports: [], events: [],
  };
}
