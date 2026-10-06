import { Pool, types } from 'pg';
import { PostgresDatabase } from './postgres';
import { databaseConnectionOptions } from './postgres-connection.mjs';
import { createObjectStore } from './storage';
import type { Services } from './api';
import type { AuthEnv } from './auth';

export function runtimeSettings(env: Record<string, string | undefined> = process.env): AuthEnv & { DATABASE_URL?: string; SUPABASE_SECRET_KEY?: string; SUPABASE_STORAGE_BUCKET: string } {
  const appUrl = env.APP_URL?.trim() || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : 'http://127.0.0.1:5173');
  return { AUTH_PROVIDER: 'supabase', APP_URL: appUrl, DATABASE_URL: env.DATABASE_URL?.trim(),
    SUPABASE_URL: env.SUPABASE_URL?.trim(), SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY?.trim(),
    SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY?.trim(), SUPABASE_STORAGE_BUCKET: env.SUPABASE_STORAGE_BUCKET?.trim() || 'value-lens-documents' };
}
let cached: (Partial<Services> & AuthEnv) | undefined;
export function getRuntime(): Partial<Services> & AuthEnv {
  if (cached) return cached;
  const config = runtimeSettings();
  let DB: PostgresDatabase | undefined;
  if (config.DATABASE_URL) {
    const pool = new Pool({ ...databaseConnectionOptions(config.DATABASE_URL), max: 2, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000,
      statement_timeout: 20000,
      types: { getTypeParser(oid, format) {
        if (oid === 20) return (value: string) => { const n = Number(value); if (!Number.isSafeInteger(n)) throw new Error('Integer overflow'); return n; };
        return types.getTypeParser(oid, format);
      } },
    });
    pool.on('error', () => console.error('Database connection unavailable'));
    DB = new PostgresDatabase(pool);
  }
  cached = { AUTH_PROVIDER: 'supabase', APP_URL: config.APP_URL, SUPABASE_URL: config.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: config.SUPABASE_PUBLISHABLE_KEY,
    DB, BUCKET: config.SUPABASE_URL && config.SUPABASE_SECRET_KEY ? createObjectStore(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, config.SUPABASE_STORAGE_BUCKET) : undefined,
    PLATFORM_ADMIN_USER_IDS: process.env.PLATFORM_ADMIN_USER_IDS, OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_MODEL: process.env.OPENAI_MODEL };
  return cached;
}
