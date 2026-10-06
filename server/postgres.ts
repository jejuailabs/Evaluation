import type { Database, Statement, QueryResult } from './database';

export interface PgConnection {
  query(sql: string, values?: any[]): Promise<{ rows: any[]; rowCount: number | null }>;
  release(): void;
}
export interface PgPool { connect(): Promise<PgConnection> }

/** Translate the fixed application queries only; user values stay in bound parameters. */
export function postgresQuery(sql: string, values: unknown[], previousChanges = 0) {
  let text = '', index = 0, quoted = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") {
      text += c;
      if (quoted && sql[i + 1] === "'") { text += sql[++i]; continue; }
      quoted = !quoted; continue;
    }
    if (!quoted && c === '?') { text += `$${++index}`; continue; }
    if (!quoted && sql.slice(i, i + 9).toLowerCase() === 'changes()') {
      if (!Number.isSafeInteger(previousChanges) || previousChanges < 0) throw new Error('Invalid change count');
      text += String(previousChanges); i += 8; continue;
    }
    text += c;
  }
  if (quoted || index !== values.length) throw new Error('Invalid SQL parameters');
  if (/^INSERT OR IGNORE /i.test(text)) text = text.replace(/^INSERT OR IGNORE /i, 'INSERT ') + ' ON CONFLICT DO NOTHING';
  return { text, values };
}

class PgStatement implements Statement {
  constructor(readonly db: PostgresDatabase, readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new PgStatement(this.db, this.sql, values); }
  async first<T = Record<string, unknown>>(): Promise<T | null> { return (await this.all<T>()).results[0] ?? null; }
  async all<T = Record<string, unknown>>(): Promise<QueryResult<T>> { return (await this.db.batch([this]))[0] as QueryResult<T>; }
  async run(): Promise<QueryResult> { return (await this.db.batch([this]))[0]; }
}

export class PostgresDatabase implements Database {
  constructor(private readonly pool: PgPool) {}
  prepare(sql: string) { return new PgStatement(this, sql); }
  async batch(statements: Statement[]): Promise<QueryResult[]> {
    if (!statements.every(s => s instanceof PgStatement && s.db === this)) throw new Error('Foreign statement');
    for (let attempt = 0; ; attempt++) {
      const client = await this.pool.connect();
      try {
        // Preserve atomic revision guards, quota reservations and audit insertion across instances.
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        await client.query('SET LOCAL ROLE value_lens_app');
        await client.query('SET LOCAL search_path TO value_lens, pg_catalog');
        let changes = 0;
        const results: QueryResult[] = [];
        for (const s of statements as PgStatement[]) {
          const q = postgresQuery(s.sql, s.values, changes);
          const r = await client.query(q.text, q.values);
          changes = r.rowCount ?? 0;
          results.push({ results: r.rows, success: true, meta: { changes } });
        }
        await client.query('COMMIT');
        return results;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (attempt >= 2 || !['40001', '40P01'].includes((error as {code?: string}).code ?? '')) throw error;
      } finally { client.release(); }
    }
  }
}
