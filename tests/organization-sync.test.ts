import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOrganizationSync} from '../src/infrastructure/organization-sync';
function fixture(){
 const state={revision:1,remote:2,blocked:false,available:true,status:'',unread:0,revoked:0,loads:0,pulses:0};
 const options={pulse:async()=>{state.pulses++;return {revision:state.remote,role:'member',unread:3,latestNotification:1};},load:async(_signal:AbortSignal)=>{state.loads++;return {workspace:{revision:state.remote}};},current:()=>state.revision,blocked:()=>state.blocked,available:()=>state.available,apply:(r:{workspace:{revision:number}})=>{state.revision=r.workspace.revision;},status:(s:string)=>{state.status=s;},counts:(p:{unread:number})=>{state.unread=p.unread;},revoked:()=>{state.revoked++;}};
 return {state,options};
}
test('공동 작업 자동 갱신은 입력 중 보류, 완료 후 반영하고 같은 버전은 다시 받지 않음',async()=>{
 const {state,options}=fixture(),sync=createOrganizationSync(options);state.blocked=true;await sync.tick();assert.equal(state.status,'pending');assert.equal(state.loads,0);assert.equal(state.unread,3);
 state.blocked=false;await sync.tick();assert.equal(state.revision,2);await sync.tick();assert.equal(state.loads,1);
 state.available=false;await sync.tick();assert.equal(state.pulses,3);sync.stop();state.available=true;await sync.tick();assert.equal(state.pulses,3);
});
test('갱신 응답 도착 전에 저장되거나 편집을 시작하면 이전 내용으로 덮어쓰지 않음',async()=>{
 const {state,options}=fixture();options.load=async()=>{state.revision=4;return {workspace:{revision:2}};};const sync=createOrganizationSync(options);await sync.tick();assert.equal(state.revision,4);
 state.remote=5;options.load=async()=>{state.blocked=true;return {workspace:{revision:5}};};await sync.tick();assert.equal(state.revision,4);assert.equal(state.status,'pending');
});
test('연결 오류 후 재시도, 권한 상실 후 중단, 동시에 여러 갱신 방지',async()=>{
 const {state,options}=fixture();let resolve!:()=>void;
 options.pulse=async()=>{await new Promise<void>(r=>{resolve=r;});return {revision:2,role:'member',unread:0,latestNotification:0};};
 const sync=createOrganizationSync(options);const first=sync.tick();await sync.tick();resolve();await first;assert.equal(state.loads,1);
 options.pulse=async()=>{throw new Error('network');};await sync.tick();assert.equal(state.status,'offline');
 options.pulse=async()=>{throw Object.assign(new Error('removed'),{status:403});};await sync.tick();await sync.tick();assert.equal(state.revoked,1);
});
