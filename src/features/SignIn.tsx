import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '../infrastructure/api';
import { Icon, Pill } from '../ui/shared';

export function SignIn({session,invite,orgId,hash}:{session:Session|null;invite?:string;orgId:string|null;hash:string}) {
 const [email,setEmail]=useState(''),[sentTo,setSentTo]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[remaining,setRemaining]=useState(0);
 const pending=useRef(false);
 const emailReady=session?.auth?.emailReady===true, googleReady=session?.auth?.googleReady===true;
 const returnTo=`/app${location.search}${invite?hash:orgId?(hash||'#/home'):'#/organizations'}`;
 const googleHref=`/auth/google?return_to=${encodeURIComponent(returnTo)}`;
 const authError=new URLSearchParams(location.search).get('auth_error');
 const messages:Record<string,string>={configuration:'로그인 연결을 준비 중이에요. 잠시 후 다시 방문해 주세요.',provider:'Google 로그인 연결 설정을 확인하고 있어요. 이메일로 시작할 수도 있어요.',cancelled:'로그인을 마치지 않았어요. 원하면 다시 시작할 수 있어요.',callback:'인증 링크가 만료됐거나 이 브라우저에서 확인하지 못했어요. 다시 요청하고, 요청한 브라우저에서 열어 주세요.',unavailable:'로그인 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'};
 useEffect(()=>{if(!remaining)return;const timer=setTimeout(()=>setRemaining(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer);},[remaining]);
 async function sendEmail(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current||remaining||!emailReady)return;
  pending.current=true;setBusy(true);setError('');
  try {
   const response=await fetch('/auth/email',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Value-Lens':'1'},body:JSON.stringify({email:email.trim(),returnTo})});
   const result=await response.json() as {error?:string;ok?:boolean};
   if(!response.ok){if(response.status===429)setRemaining(60);throw new Error(result.error||'인증 메일을 보내지 못했어요. 다시 시도해 주세요.');}
   if(result.ok!==true)throw new Error('인증 메일을 보내지 못했어요. 다시 시도해 주세요.');
   setSentTo(email.trim());setRemaining(60);
  } catch(e) { setError(e instanceof Error?e.message:'인증 메일을 보내지 못했어요. 다시 시도해 주세요.'); }
  finally {pending.current=false;setBusy(false);}
 }
 return <div className="account-welcome"><div>
  <p className="eyebrow">누구나 이메일로 시작하기</p><h1>내 이메일로 가입하고,<br/>우리의 일을 시작해요.</h1>
  <p className="lede">소속 조직이나 초대가 없어도 가입할 수 있어요.<br/>이메일을 인증하고 로그인한 다음, 조직을 선택해요.</p>
  <ol className="start-steps">
   <li><span>01</span><div><strong>이메일로 회원가입해요</strong><p>평소 사용하는 개인 이메일로도 가입할 수 있어요.</p></div></li>
   <li><span>02</span><div><strong>인증메일을 확인하고 로그인해요</strong><p>받은 링크를 눌러 내 이메일을 확인해요.</p></div></li>
   <li><span>03</span><div><strong>로그인 후 조직을 선택해요</strong><p>새 조직을 만들거나 기존 조직에 참여해요.</p></div></li>
  </ol>
 </div><section className="start-card auth-card" aria-labelledby="auth-title">
  <Pill>개인 계정</Pill><h2 id="auth-title">이메일로 가입·로그인</h2>
  <p className="start-auth-note">처음이라면 이메일 인증 후 가입되고, 이미 가입했다면 로그인돼요. 조직 정보는 아직 필요 없어요.</p>
  {invite&&<p className="form-hint">받은 조직 초대는 로그인한 다음 확인해요.</p>}
  {authError&&<p className="form-error" role="alert">{messages[authError]??messages.callback}</p>}
  <form className="email-auth-form" onSubmit={sendEmail}>
   <label className="field" htmlFor="login-email"><span>이메일 주소</span><input id="login-email" name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} placeholder="내가 사용하는 이메일 주소" value={email} disabled={busy} onChange={e=>{setEmail(e.target.value);setError('');}}/></label>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <button className="button primary full" type="submit" disabled={!emailReady||busy||remaining>0}>{busy?'인증 메일을 보내고 있어요…':remaining>0?`${remaining}초 후 다시 받기`:sentTo?'인증 메일 다시 받기':'이메일로 가입·로그인'}<Icon name="arrow"/></button>
   <p className="form-hint">비밀번호 없이, 이메일로 받은 링크를 눌러 인증해요.</p>
  </form>
  {sentTo&&<div className="email-auth-sent" role="status"><strong>메일함을 확인해 주세요.</strong><p><b>{sentTo}</b>로 인증 링크를 보냈어요. 이 브라우저에서 링크를 열면 이어서 시작할 수 있어요.</p><small>메일이 보이지 않으면 스팸함을 확인해 주세요. 인증 링크는 한 번만 사용할 수 있어요.</small></div>}
  {!emailReady&&<p className="form-hint">{session?.auth?.status==='unavailable'?'로그인 연결을 확인하지 못했어요. 잠시 후 새로고침해 주세요.':'이메일 로그인 연결을 준비 중이에요.'}</p>}
  <div className="auth-divider"><span>또는</span></div>
  {googleReady?<a className="button secondary full google-auth-button" href={googleHref} target="_top"><span className="google-mark" aria-hidden="true">G</span>Google로 계속하기</a>:<><button className="button secondary full google-auth-button" disabled><span className="google-mark" aria-hidden="true">G</span>Google로 계속하기</button><p className="form-hint">Google 로그인 연결을 준비 중이에요.</p></>}
  <div className="auth-demo-link"><p className="form-hint">먼저 둘러보고 싶다면</p><a className="text-link" href="/app?mode=demo#/home">가입 없이 데모 보기 →</a></div>
 </section></div>;
}

export function SignOutButton({session,returnTo='/app?mode=app#/start',children='로그아웃'}:{session:Session;returnTo?:string;children?:React.ReactNode}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <span><button className="text-button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const r=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-Value-Lens':'1'}});if(!r.ok)throw new Error('로그아웃하지 못했어요. 다시 시도해 주세요.');location.href=returnTo;}catch(e){setError((e as Error).message);setBusy(false);}}}>{busy?'로그아웃 중…':children}</button>{error&&<small role="alert">{error}</small>}</span>;
}
