import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api,ApiError} from '../src/infrastructure/api';

test('끝나지 않는 조회는 제한 시간에 취소되어 로딩 화면을 벗어날 수 있음',async()=>{
 const original=globalThis.fetch;let aborted=false;
 globalThis.fetch=async(_input,options)=>new Promise<Response>((_resolve,reject)=>{
  options?.signal?.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true});
 });
 try{
  await assert.rejects(api('session?org=example',undefined,'GET',{timeoutMs:20}),(e:unknown)=>e instanceof ApiError&&e.status===408);
  assert.equal(aborted,true);
 }finally{globalThis.fetch=original;}
});

test('화면 이동 취소는 시간 초과로 표시하지 않으며 HTTP 권한 오류를 유지',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(_input,options)=>{
   if(options?.signal?.aborted)throw new DOMException('Aborted','AbortError');
   return Response.json({error:'권한 없음'},{status:403});
  };
  await assert.rejects(api('organizations/other/workspace'),(e:unknown)=>e instanceof ApiError&&e.status===403);
  const controller=new AbortController();controller.abort();
  await assert.rejects(api('session',undefined,'GET',{signal:controller.signal}),(e:unknown)=>e instanceof DOMException&&e.name==='AbortError');
 }finally{globalThis.fetch=original;}
});
