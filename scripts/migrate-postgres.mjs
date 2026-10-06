import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { databaseConnectionOptions } from '../server/postgres-connection.mjs';
const databaseUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('A database connection is required; set it in .env.local');
const pool = new Pool({ ...databaseConnectionOptions(databaseUrl), max: 1, connectionTimeoutMillis: 10000 });
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
    const sql = (await readFile(new URL(name, dir), 'utf8')).replace(/\r\n/g, '\n');
    const checksum = createHash('sha256').update(sql).digest('hex');
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
