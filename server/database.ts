/** Small SQL contract used by the application; no hosting-provider runtime types. */
export type QueryResult<T = Record<string, unknown>> = { results: T[]; success: boolean; meta: { changes: number } };
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
  run(): Promise<QueryResult>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<QueryResult[]>;
}
export interface ObjectStore {
  put(key: string, bytes: ArrayBuffer, options?: unknown): Promise<unknown>;
  get(key: string): Promise<{ body: BodyInit } | null>;
  delete(key: string): Promise<unknown>;
  signUpload?(key: string): Promise<string>;
  head?(key: string): Promise<{ size: number } | null>;
  signDownload?(key: string, filename: string): Promise<string>;
}
