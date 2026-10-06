import { z } from 'zod';
import type { Database } from './database';
import type { Identity } from './api';
import { HttpError } from './policy';

const now = () => new Date().toISOString();
const hash = async (value: string) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex');
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const joinKeyOptions = z.object({ role: z.enum(['member', 'viewer']), days: z.number().int().min(1).max(30), maxUses: z.number().int().min(1).max(1000) }).strict();
export async function newJoinKey(input: z.infer<typeof joinKeyOptions>) {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => alphabet[n % 32]).join('');
  return { id: crypto.randomUUID(), code: `VL-${raw.match(/.{4}/g)!.join('-')}`, digest: await hash('VL' + raw), expiresAt: new Date(Date.now() + input.days * 86400000).toISOString() };
}
export async function listJoinKeys(db: Database, orgId: string) {
  return (await db.prepare('SELECT id,role,max_uses,uses,expires_at,revoked_at,created_at FROM organization_join_keys WHERE org_id=? ORDER BY created_at DESC LIMIT 10').bind(orgId).all()).results;
}

/** Redeem only after authentication. Never derive role or project access from the request. */
export async function redeemJoinKey(db: Database, user: Identity, input: unknown) {
  const { code } = z.object({ code: z.string().trim().min(1).max(80) }).strict().parse(input);
  const timestamp = now(), since = new Date(Date.now() - 600000).toISOString();
  const allowed = await db.prepare(`INSERT INTO join_key_attempts (user_id,window_start,attempts) VALUES (?,?,1)
    ON CONFLICT(user_id) DO UPDATE SET
      window_start=CASE WHEN join_key_attempts.window_start<=? THEN excluded.window_start ELSE join_key_attempts.window_start END,
      attempts=CASE WHEN join_key_attempts.window_start<=? THEN 1 ELSE join_key_attempts.attempts+1 END
    WHERE join_key_attempts.window_start<=? OR join_key_attempts.attempts<10`).bind(user.userId,timestamp,since,since,since).run();
  if (!allowed.meta.changes) throw new HttpError(429, '가입키를 여러 번 확인했어요. 10분 뒤 다시 시도해 주세요.');
  const normalized = code.replace(/[\s-]/g, '').toUpperCase();
  const unavailable = () => new HttpError(410, '사용할 수 없는 가입키예요. 오타·만료 여부를 확인하거나 관리자에게 새 키를 요청해 주세요.');
  if (!/^VL[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16}$/.test(normalized)) throw unavailable();
  const digest = await hash(normalized);
  const key = await db.prepare(`SELECT k.id,k.org_id FROM organization_join_keys k JOIN organizations o ON o.id=k.org_id
    WHERE k.token_hash=? AND k.revoked_at IS NULL AND k.expires_at>? AND k.uses<k.max_uses AND o.status='active'`).bind(digest,timestamp).first<{id:string;org_id:string}>();
  if (!key) throw unavailable();
  const existing = await db.prepare('SELECT active FROM memberships WHERE org_id=? AND user_id=?').bind(key.org_id,user.userId).first<{active:number}>();
  if (existing?.active) return { id:key.org_id, alreadyMember:true };
  if (existing) throw new HttpError(403, '이용이 중지된 계정이에요. 조직 관리자에게 다시 활성화해 달라고 요청해 주세요.');
  // Quota, revocation, expiry and organization status are rechecked inside the serializable batch.
  const joined = await db.batch([
    db.prepare(`INSERT INTO memberships (id,org_id,user_id,role,active)
      SELECT ?,k.org_id,?,k.role,1 FROM organization_join_keys k JOIN organizations o ON o.id=k.org_id
      WHERE k.id=? AND k.token_hash=? AND k.revoked_at IS NULL AND k.expires_at>? AND k.uses<k.max_uses AND o.status='active'
      ON CONFLICT(org_id,user_id) DO NOTHING`).bind(crypto.randomUUID(),user.userId,key.id,digest,now()),
    db.prepare('UPDATE organization_join_keys SET uses=uses+1 WHERE id=? AND changes()>0').bind(key.id),
    db.prepare('UPDATE organizations SET revision=revision+1 WHERE id=? AND changes()>0').bind(key.org_id),
    db.prepare('INSERT INTO operations (id,org_id,actor_id,action,request_hash,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),key.org_id,user.userId,'조직 가입키로 참여','',timestamp),
  ]);
  if (!joined[0].meta.changes) {
    const current = await db.prepare('SELECT active FROM memberships WHERE org_id=? AND user_id=?').bind(key.org_id,user.userId).first<{active:number}>();
    if (current?.active) return {id:key.org_id,alreadyMember:true};
    throw unavailable();
  }
  return {id:key.org_id,alreadyMember:false};
}
