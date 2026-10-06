import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '@supabase/supabase-js';
import { authStatus, availableAuthMethods, createAuthContext, identityFromUser, safeReturnTo, type AuthEnv } from '../server/auth';

const env:AuthEnv={AUTH_PROVIDER:'supabase',SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_URL:'https://app.example.test'};
const user:User={id:'12345678-1234-4123-8123-123456789012',aud:'authenticated',email:'Member@Example.test',email_confirmed_at:'2026-10-05T00:00:00Z',created_at:'2026-10-05T00:00:00Z',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'테스트 구성원',role:'owner'}};
const request=(path:string,options:RequestInit={})=>new Request(`${env.APP_URL}${path}`,options);
const cookies=(r:Response)=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const token=(seconds=3600)=>[{}, {sub:user.id,exp:Math.floor(Date.now()/1000)+seconds,aud:'authenticated',iss:`${env.SUPABASE_URL}/auth/v1`},{}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
const emailRequest=(body:unknown,headers:Record<string,string>={})=>request('/auth/email',{method:'POST',headers:{Origin:env.APP_URL!,'Content-Type':'application/json','X-Value-Lens':'1',...headers},body:JSON.stringify(body)});
function fakeAuth(){
 const seen:{path:string;body:any;redirectTo:string|null}[]=[];let revoked=false;
 const fetcher:typeof fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  assert.equal(url.origin,env.SUPABASE_URL);
  const body=typeof options?.body==='string'?JSON.parse(options.body):undefined;
  seen.push({path:url.pathname,body,redirectTo:url.searchParams.get('redirect_to')});
  if(url.pathname==='/auth/v1/otp')return Response.json({});
  if(url.pathname==='/auth/v1/token'){
   if(body?.auth_code!=='good-code'||!body?.code_verifier)return Response.json({error:'invalid_grant',error_description:'Invalid code'},{status:400});
   return Response.json({access_token:token(),refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user});
  }
  if(url.pathname==='/auth/v1/user')return revoked?Response.json({msg:'Invalid token'},{status:401}):Response.json(user);
  if(url.pathname==='/auth/v1/logout'){revoked=true;return new Response(null,{status:204});}
  throw new Error(`Unexpected request path ${url.pathname}`);
 };
 return {fetcher,seen,revoke:()=>{revoked=true;}};
}
async function login(fake= fakeAuth()){
 const start=await createAuthContext(request('/auth/google?return_to='+encodeURIComponent('/?mode=app&org=org-one#/invite/abc')),env,fake.fetcher).handle();
 const finish=await createAuthContext(request('/auth/callback?code=good-code',{headers:{Cookie:cookies(start)}}),env,fake.fetcher).handle();
 return {fake,start,finish};
}

test('Google 설정은 명시적 전환·공개 키·안전한 서비스 URL을 요구하고 외부 복귀 경로를 거부',()=>{
 assert.deepEqual(authStatus({}),{provider:'chatgpt',ready:true});
 assert.deepEqual(authStatus({AUTH_PROVIDER:'supabase'}),{provider:'google',ready:false});
 assert.equal(authStatus(env).ready,true);
 assert.equal(authStatus({...env,SUPABASE_PUBLISHABLE_KEY:'sb_secret_do-not-use'}).ready,false);
 assert.equal(authStatus({...env,APP_URL:'https://evil.test/path'}).ready,false);
 for(const bad of ['https://evil.test','//evil.test','/\\evil.test','/auth/google','/\n/evil.test','/app/evil','/app%2f..%2fauth/google'])assert.equal(safeReturnTo(bad),'/app?mode=app#/organizations');
 for(const path of ['/', '/app', '/app/'])assert.equal(safeReturnTo(`${path}?mode=start&org=abc#/home`),'/app?mode=app&org=abc#/home');
});

test('확인된 이메일과 서버 검증 사용자만 계정으로 사용하며 사용자 메타데이터로 권한을 만들지 않음',()=>{
 assert.equal(identityFromUser(null),null);
 assert.equal(identityFromUser({...user,email_confirmed_at:undefined}),null);
 assert.equal(identityFromUser({...user,is_anonymous:true}),null);
 assert.deepEqual(identityFromUser(user),{userId:`supabase:${user.id}`,email:'member@example.test',displayName:'테스트 구성원'});
});

test('공식 SDK PKCE 로그인: Google 지정, verifier 쿠키, 코드 교환, getUser 확인, 초대 경로 보존',async()=>{
 const {fake,start,finish}=await login();
 assert.equal(start.status,303);
 const target=new URL(start.headers.get('location')!);
 assert.equal(target.origin,env.SUPABASE_URL);assert.equal(target.searchParams.get('provider'),'google');
 assert.equal(target.searchParams.get('redirect_to'),`${env.APP_URL}/auth/callback`);
 assert.equal(target.searchParams.get('code_challenge_method'),'s256');
 assert.ok(target.searchParams.get('code_challenge'));
 for(const cookie of start.headers.getSetCookie()){assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/i);}
 assert.equal(finish.headers.get('location'),'/app?mode=app&org=org-one#/invite/abc');
 assert.ok(fake.seen.some(x=>x.path==='/auth/v1/user'));
 const exchanged=fake.seen.find(x=>x.path==='/auth/v1/token')!;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(exchanged.body.code_verifier));
 assert.equal(Buffer.from(digest).toString('base64url'),target.searchParams.get('code_challenge'));
 assert.match(finish.headers.get('cache-control')!,/no-store/);
 assert.ok(finish.headers.getSetCookie().some(c=>c.startsWith('__Host-value-lens-auth=')&&c.includes('HttpOnly')));
 const next=createAuthContext(request('/api/session',{headers:{Cookie:cookies(finish)}}),env,fake.fetcher);
 assert.equal((await next.identity())?.userId,`supabase:${user.id}`);
});

test('취소·누락·잘못된 코드와 서버에서 거부한 세션은 로그인으로 인정하지 않음',async()=>{
 const fake=fakeAuth();
 for(const query of ['','?code=bad-code','?error=access_denied']){
  const r=await createAuthContext(request('/auth/callback'+query),env,fake.fetcher).handle();
  assert.match(r.headers.get('location')!,/auth_error=/);
  assert.ok(!r.headers.getSetCookie().some(c=>c.startsWith('__Host-value-lens-auth=')&&!c.includes('Max-Age=0')));
 }
 const {finish}=await login(fake);fake.revoke();
 assert.equal(await createAuthContext(request('/api/session',{headers:{Cookie:cookies(finish)}}),env,fake.fetcher).identity(),null);
});

test('로그인을 취소해도 조직 초대 경로를 보존해 이메일 인증으로 다시 시도할 수 있음',async()=>{
 const fake=fakeAuth();
 const start=await createAuthContext(request('/auth/google?return_to='+encodeURIComponent('/app?mode=app&org=org-one#/invite/abc')),env,fake.fetcher).handle();
 const cancelled=await createAuthContext(request('/auth/callback?error=access_denied',{headers:{Cookie:cookies(start)}}),env,fake.fetcher).handle();
 const target=new URL(cancelled.headers.get('location')!,env.APP_URL);
 assert.equal(target.pathname,'/app');assert.equal(target.searchParams.get('org'),'org-one');
 assert.equal(target.searchParams.get('auth_error'),'cancelled');assert.equal(target.hash,'#/invite/abc');
});

test('로그아웃은 같은 출처의 POST만 허용하고 서버 세션과 브라우저 쿠키를 정리',async()=>{
 const {fake,finish}=await login();const cookie=cookies(finish);
 const wrong=await createAuthContext(request('/auth/logout',{method:'POST',headers:{Cookie:cookie,Origin:'https://evil.test','X-Value-Lens':'1'}}),env,fake.fetcher).handle();
 assert.equal(wrong.status,403);assert.ok(!fake.seen.some(x=>x.path==='/auth/v1/logout'));
 assert.equal((await createAuthContext(request('/auth/logout',{headers:{Cookie:cookie}}),env,fake.fetcher).handle()).status,405);
 const logout=await createAuthContext(request('/auth/logout',{method:'POST',headers:{Cookie:cookie,Origin:env.APP_URL!,'X-Value-Lens':'1'}}),env,fake.fetcher).handle();
 assert.equal(logout.status,200);assert.ok(fake.seen.some(x=>x.path==='/auth/v1/logout'));
 assert.ok(logout.headers.getSetCookie().some(c=>c.includes('Max-Age=0')));
});

test('미설정 인증과 잘못된 서비스 호스트는 실패 처리하고 모든 응답은 캐시 금지',async()=>{
 const disabled=await createAuthContext(request('/auth/google'),{AUTH_PROVIDER:'supabase'}).handle();
 assert.match(disabled.headers.get('location')!,/auth_error=configuration/);
 const host=await createAuthContext(new Request('https://evil.test/auth/google'),env,fakeAuth().fetcher).handle();
 assert.equal(host.status,403);
 const ctx=createAuthContext(request('/api/session'),env,fakeAuth().fetcher);
 assert.equal(await ctx.identity(),null);
 assert.match(ctx.finish(Response.json({error:'denied'},{status:403})).headers.get('cache-control')!,/no-store/);
});

test('실제 Supabase 설정의 이메일·Google 사용 여부를 따로 확인하며 장애를 준비 완료로 표시하지 않음',async()=>{
 const settings:typeof fetch=async(input,options)=>{
  assert.equal(String(input),`${env.SUPABASE_URL}/auth/v1/settings`);
  assert.equal(new Headers(options?.headers).get('apikey'),env.SUPABASE_PUBLISHABLE_KEY);
  return Response.json({external:{email:true,google:false}});
 };
 assert.deepEqual(await availableAuthMethods(env,settings),{provider:'google',ready:true,emailReady:true,googleReady:false,status:'available'});
 assert.equal((await availableAuthMethods(env,async()=>Response.json({external:{email:true,google:true}}))).googleReady,true);
 assert.equal((await availableAuthMethods(env,async()=>new Response(null,{status:503}))).status,'unavailable');
 const missing=await availableAuthMethods({AUTH_PROVIDER:'supabase'},async()=>{throw new Error('No upstream call expected');});
 assert.equal(missing.emailReady,false);assert.equal(missing.googleReady,false);assert.equal(missing.status,'unconfigured');
});

test('이메일 가입·로그인은 인증 메일만 요청하며 링크 확인 전에는 세션을 만들지 않음',async()=>{
 const fake=fakeAuth();
 const response=await createAuthContext(emailRequest({email:' Member@Example.test ',returnTo:'/app?mode=app#/invite/abc'}),env,fake.fetcher).handle();
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,retryAfter:60});
 const sent=fake.seen.find(x=>x.path==='/auth/v1/otp')!;
 assert.equal(sent.body.email,'member@example.test');assert.equal(sent.body.create_user,true);
 assert.equal(sent.redirectTo,`${env.APP_URL}/auth/callback`);
 assert.equal(sent.body.code_challenge_method,'s256');assert.ok(sent.body.code_challenge);
 for(const cookie of response.headers.getSetCookie()){assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/i);}
 assert.ok(!response.headers.getSetCookie().some(cookie=>cookie.startsWith('__Host-value-lens-auth=')));
 assert.equal(await createAuthContext(request('/api/session',{headers:{Cookie:cookies(response)}}),env,fake.fetcher).identity(),null);
 assert.match(response.headers.get('cache-control')!,/no-store/);
});

test('이메일 링크는 PKCE·확인된 이메일을 검증한 뒤 초대받은 조직 경로로 복귀',async()=>{
 const fake=fakeAuth();
 const sent=await createAuthContext(emailRequest({email:user.email,returnTo:'/app?mode=app&org=org-one#/invite/abc'}),env,fake.fetcher).handle();
 const done=await createAuthContext(request('/auth/callback?code=good-code',{headers:{Cookie:cookies(sent)}}),env,fake.fetcher).handle();
 assert.equal(done.status,303);assert.equal(done.headers.get('location'),'/app?mode=app&org=org-one#/invite/abc');
 const otp=fake.seen.find(x=>x.path==='/auth/v1/otp')!,exchanged=fake.seen.find(x=>x.path==='/auth/v1/token')!;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(exchanged.body.code_verifier));
 assert.equal(Buffer.from(digest).toString('base64url'),otp.body.code_challenge);
 assert.equal((await createAuthContext(request('/api/session',{headers:{Cookie:cookies(done)}}),env,fake.fetcher).identity())?.email,'member@example.test');
 const wrongBrowser=await createAuthContext(request('/auth/callback?code=good-code'),env,fake.fetcher).handle();
 assert.match(wrongBrowser.headers.get('location')!,/auth_error=callback/);
});

test('이메일 인증은 외부 사이트 요청·잘못된 입력·과도한 본문을 보내지 않음',async()=>{
 const fake=fakeAuth();
 const cases:[Request,number][]=[
  [request('/auth/email'),405],
  [emailRequest({email:user.email},{Origin:'https://evil.test'}),403],
  [emailRequest({email:user.email},{'X-Value-Lens':''}),403],
  [emailRequest({email:user.email},{'Content-Type':'text/plain'}),415],
  [emailRequest({email:'not-an-email'}),400],
  [emailRequest(null),400],
  [emailRequest({email:user.email,extra:'a'.repeat(5000)}),413],
 ];
 for(const [input,status]of cases)assert.equal((await createAuthContext(input,env,fake.fetcher).handle()).status,status);
 assert.equal(fake.seen.length,0);
 assert.equal((await createAuthContext(emailRequest({email:user.email}),{AUTH_PROVIDER:'supabase'},fake.fetcher).handle()).status,503);
});

test('이메일 공급자 오류·발송 제한은 성공으로 표시하지 않고 계정 여부와 서버 오류 원문을 숨김',async()=>{
 for(const status of [429,422,500]){
  const upstream:typeof fetch=async()=>Response.json({code:'over_email_send_rate_limit',msg:'PRIVATE_PROVIDER_DETAIL member@example.test'},{status});
  const response=await createAuthContext(emailRequest({email:user.email}),env,upstream).handle();
  assert.equal(response.status,status===429?429:503);
  const body=await response.text();assert.ok(!body.includes('PRIVATE_PROVIDER_DETAIL'));assert.ok(!body.includes(user.email!));
  assert.ok(!response.headers.getSetCookie().some(cookie=>cookie.startsWith('vl-login-return=')));
 }
});
