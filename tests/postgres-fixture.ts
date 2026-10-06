import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { PostgresDatabase, type PgPool } from '../server/postgres';

/** Actual PostgreSQL WASM engine, using exactly the production migrations and SQL adapter. */
export async function postgresFixture() {
  const pg = new PGlite();
  await pg.exec('BEGIN');
  const dir = new URL('../supabase/migrations/', import.meta.url);
  for (const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort()) await pg.exec(readFileSync(new URL(name,dir),'utf8'));
  await pg.exec('COMMIT');
  // PGlite has one connection; emulate the exclusive checkout provided by a real pg.Pool.
  let pending = Promise.resolve();
  const pool: PgPool = { async connect() {
    const previous=pending;let release!:()=>void;pending=new Promise<void>(resolve=>{release=resolve;});await previous;
    return { async query(sql,values) {const r=await pg.query(sql,values);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};}, release };
  } };
  return { db:new PostgresDatabase(pool), pg, close:()=>pg.close() };
}
