import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresDatabase, postgresQuery } from '../server/postgres';
import { runtimeSettings } from '../server/runtime';
import { databaseConnectionOptions, supabaseRootCertificate } from '../server/postgres-connection.mjs';
import { X509Certificate } from 'node:crypto';
import { postgresFixture } from './postgres-fixture';
test('SQL 값은 바인딩되고 문자열 안의 물음표·changes는 변환되지 않음',()=>{
 const value="x'); DROP TABLE users; --";
 const q=postgresQuery("SELECT '? changes() it''s', ? WHERE changes()>0",[value],3);
 assert.equal(q.text,"SELECT '? changes() it''s', $1 WHERE 3>0");assert.deepEqual(q.values,[value]);
 assert.equal(postgresQuery('INSERT OR IGNORE INTO t (id) VALUES (?)',[1]).text,'INSERT INTO t (id) VALUES ($1) ON CONFLICT DO NOTHING');
 assert.throws(()=>postgresQuery('SELECT ?',[1,2]));
});
test('직렬화 충돌은 롤백 후 제한적으로 재시도하며 이전 변경 수를 초기화',async()=>{
 const queries:string[]=[];let fail=true,releases=0;
 const db=new PostgresDatabase({connect:async()=>({query:async(text)=>{queries.push(text);if(text.startsWith('UPDATE')&&fail){fail=false;throw Object.assign(new Error('retry'),{code:'40001'});}return{rows:[],rowCount:1};},release:()=>{releases++;}})});
 await db.batch([db.prepare('UPDATE t SET a=?').bind(1),db.prepare('INSERT INTO log SELECT 1 WHERE changes()>0')]);
 assert.equal(releases,2);assert.ok(queries.includes('ROLLBACK'));assert.equal(queries.at(-1),'COMMIT');assert.ok(queries.includes('INSERT INTO log SELECT 1 WHERE 1>0'));
});
test('Vercel 인증은 Supabase로 고정되고 서버 환경변수만 사용',()=>{
 const config=runtimeSettings({AUTH_PROVIDER:'chatgpt',VERCEL_URL:'evaluation-preview.vercel.app',SUPABASE_STORAGE_BUCKET:'private-files'});
 assert.equal(config.AUTH_PROVIDER,'supabase');assert.equal(config.APP_URL,'https://evaluation-preview.vercel.app');
 assert.equal(runtimeSettings({APP_URL:'https://evaluation.example',VERCEL_URL:'preview.vercel.app'}).APP_URL,'https://evaluation.example');
});

test('호스팅 DB의 TLS 검증은 URL 옵션으로 끌 수 없으며 Supabase 공식 CA만 추가',()=>{
 const options=databaseConnectionOptions('postgresql://user:example-password@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?ssl=false&sslmode=no-verify&sslrootcert=untrusted&uselibpqcompat=true');
 assert.notEqual(options.ssl,false);
 assert.equal(options.ssl && options.ssl.rejectUnauthorized,true);
 assert.ok(options.ssl && options.ssl.ca?.includes(supabaseRootCertificate));
 assert.equal(new URL(options.connectionString).search,'');
 assert.equal(new X509Certificate(supabaseRootCertificate).fingerprint256,'80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
 const other=databaseConnectionOptions('postgresql://user:example-password@pooler.supabase.com.evil.example/postgres');
 assert.equal(other.ssl && other.ssl.ca,undefined);
 assert.equal(databaseConnectionOptions('postgresql://user:example-password@127.0.0.1/postgres').ssl,false);
 assert.throws(()=>databaseConnectionOptions('https://example.com/postgres'));
});

test('공유 DB의 전용 접속 역할은 기존 테이블·DDL·상위 역할에 접근하지 못함',async()=>{
 const {pg,close}=await postgresFixture();
 try {
  await pg.exec('CREATE TABLE public.existing_app_data (id integer); SET SESSION AUTHORIZATION value_lens_runtime;');
  await assert.rejects(()=>pg.query('SELECT * FROM value_lens.organizations'),(e:any)=>e.code==='42501');
  await assert.rejects(()=>pg.query('SELECT * FROM public.existing_app_data'),(e:any)=>e.code==='42501');
  await assert.rejects(()=>pg.query('SET ROLE postgres'),(e:any)=>e.code==='42501');
  await pg.exec('SET ROLE value_lens_app');
  assert.equal((await pg.query('SELECT * FROM value_lens.organizations')).rows.length,0);
  await assert.rejects(()=>pg.query('CREATE TABLE value_lens.forbidden (id integer)'),(e:any)=>e.code==='42501');
 } finally {await close();}
});
