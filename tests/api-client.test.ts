import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api,ApiError} from '../src/infrastructure/api';
import {createSeed} from '../src/domain/seed';

test('분할 조회 중 변경은 최신 버전으로 재조회하되 저장 명령을 중복 실행하지 않음',async()=>{
 const original=globalThis.fetch,s=createSeed();s.revision=1;let writes=0,refreshes=0;
 const manifest=(revision:number)=>({workspace:{...s,revision,tasks:[]},workspacePages:['tasks']});
 globalThis.fetch=async(input,options)=>{
  const url=String(input);
  if(options?.method==='POST'){writes++;return Response.json(manifest(1));}
  if(url.includes('/page?'))return url.includes('revision=1')?Response.json({error:'동시 수정'},{status:409}):Response.json({items:s.tasks,revision:2,nextOffset:null});
  if(url.includes('/workspace')){refreshes++;return Response.json(manifest(2));}
  return Response.json({user:{userId:'owner'},initialWorkspace:manifest(1)});
 };
 try{
  const saved=await api('organizations/example/commands',{id:'one-command'});assert.equal(writes,1);assert.equal(refreshes,1);assert.equal(saved.workspace.revision,2);assert.deepEqual(saved.workspace.tasks,s.tasks);assert.equal(saved.workspacePages,undefined);
  const session=await api('session?org=example');assert.equal(session.user.userId,'owner');assert.equal(session.initialWorkspace.workspace.revision,2);assert.deepEqual(session.initialWorkspace.workspace.tasks,s.tasks);
  assert.equal(writes,1);
 }finally{globalThis.fetch=original;}
});

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
