import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; set it in .env.local');
const url = new URL(process.env.DATABASE_URL);
const local = ['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname);
for (const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
const pool = new Pool({ connectionString: url.href, max: 1, ssl: local ? false : { rejectUnauthorized: true }, connectionTimeoutMillis: 10000 });
let client;
try {
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(746251908)");
  await client.query('CREATE SCHEMA IF NOT EXISTS value_lens');
  await client.query('REVOKE ALL ON SCHEMA value_lens FROM PUBLIC');
  await client.query('CREATE TABLE IF NOT EXISTS value_lens._migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const dir = new URL('../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(dir)).filter(n => n.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name, dir), 'utf8'), checksum = createHash('sha256').update(sql).digest('hex');
    const previous = (await client.query('SELECT checksum FROM value_lens._migrations WHERE name=$1',[name])).rows[0];
    if (previous) { if (previous.checksum !== checksum) throw new Error('Migration checksum changed'); continue; }
    await client.query(sql);
    await client.query('INSERT INTO value_lens._migrations (name,checksum) VALUES ($1,$2)',[name,checksum]);
    console.log('Applied:',name);
  }
  await client.query('COMMIT');
  console.log('Database schema is ready. Existing D1 data is not imported by this command.');
} catch (error) {
  await client?.query('ROLLBACK').catch(() => {});
  console.error('Migration failed. No pending changes committed. Error code:', /^[A-Z0-9]{5}$/.test(error.code ?? '') ? error.code : 'connection-or-schema');
  process.exitCode = 1;
} finally { client?.release(); await pool.end(); }
