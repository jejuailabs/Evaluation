import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { databaseConnectionOptions } from '../server/postgres-connection.mjs';

const report = { database: { configured: false, connected: false }, auth: { configured: false, reachable: false, emailEnabled: false, googleEnabled: false }, storage: { configured: false, ready: false } };
if (process.env.DATABASE_URL) {
  report.database.configured = true;
  const client = new Client({ ...databaseConnectionOptions(process.env.DATABASE_URL), connectionTimeoutMillis: 10000, statement_timeout: 5000 });
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE value_lens_app');
    await client.query('SELECT id FROM value_lens.organizations LIMIT 0');
    await client.query('ROLLBACK');
    report.database.connected = true;
  } catch { report.database.connected = false; }
  finally { await client.end().catch(() => {}); }
}
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (url && key) {
  report.auth.configured = true;
  try {
    const response = await fetch(url + '/auth/v1/settings', { headers: { apikey: key }, signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      const data = await response.json();
      report.auth.reachable = true;
      report.auth.emailEnabled = data.external?.email === true;
      report.auth.googleEnabled = data.external?.google === true;
    }
  } catch {}
}
if (url && process.env.SUPABASE_SECRET_KEY) {
  report.storage.configured = true;
  try {
    const client = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } });
    const { data, error } = await client.storage.getBucket(process.env.SUPABASE_STORAGE_BUCKET || 'value-lens-documents');
    report.storage.ready = !error && !!data && !data.public && Number(data.file_size_limit) === 26214400;
  } catch {}
}
console.log(JSON.stringify(report, null, 2));
console.log('Provider switches do not verify email delivery or a completed Google sign-in.');
if (!report.database.connected || !report.auth.reachable || !report.auth.emailEnabled || !report.auth.googleEnabled || !report.storage.ready) process.exitCode = 2;
