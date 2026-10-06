import { getRuntime } from '../server/runtime';
export function getDb() { const db = getRuntime().DB; if (!db) throw new Error('DATABASE_URL is required'); return db; }
