import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresDatabase, postgresQuery } from '../server/postgres';
import { runtimeSettings } from '../server/runtime';
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
