import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '../infrastructure/api';
import { Icon, Pill } from '../ui/shared';

export function SignIn({session,invite,orgId,hash}:{session:Session|null;invite?:string;orgId:string|null;hash:string}) {
 const [email,setEmail]=useState(''),[sentTo,setSentTo]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[emailIssue,setEmailIssue]=useState(''),[remaining,setRemaining]=useState(0);
 const pending=useRef(false);
 const [token,setToken]=useState(''),[verifying,setVerifying]=useState(false),[verifyWait,setVerifyWait]=useState(0);
 const emailReady=session?.auth?.emailReady===true, googleReady=session?.auth?.googleReady===true;
 const returnTo=`/app${location.search}${invite?hash:orgId?(hash||'#/home'):'#/organizations'}`;
 const googleHref=`/auth/google?return_to=${encodeURIComponent(returnTo)}`;
 const authError=new URLSearchParams(location.search).get('auth_error');
 const messages:Record<string,string>={configuration:'로그인 연결을 준비 중이에요. 잠시 후 다시 방문해 주세요.',provider:'Google 로그인 연결 설정을 확인하고 있어요. 이메일로 시작할 수도 있어요.',cancelled:'로그인을 마치지 않았어요. 원하면 다시 시작할 수 있어요.',callback:'인증 링크가 만료됐거나 이 브라우저에서 확인하지 못했어요. 다시 요청하고, 요청한 브라우저에서 열어 주세요.',unavailable:'로그인 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'};
 useEffect(()=>{if(!remaining)return;const timer=setTimeout(()=>setRemaining(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer);},[remaining]);
 useEffect(()=>{if(!verifyWait)return;const timer=setTimeout(()=>setVerifyWait(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer);},[verifyWait]);
 async function sendEmail(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current||remaining||!emailReady)return;
  pending.current=true;setBusy(true);setError('');setEmailIssue('');
  try {
   const response=await fetch('/auth/email',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Value-Lens':'1'},body:JSON.stringify({email:email.trim(),returnTo})});
   const result=await response.json() as {error?:string;code?:string;ok?:boolean;retryAfter?:number};
   const retryAfter=typeof result.retryAfter==='number'&&Number.isFinite(result.retryAfter)&&result.retryAfter>0&&result.retryAfter<=86400?Math.ceil(result.retryAfter):0;
   if(!response.ok){setEmailIssue(result.code??'');if(response.status===429)setRemaining(retryAfter);throw new Error(result.error||'인증 메일을 보내지 못했어요. 다시 시도해 주세요.');}
   if(result.ok!==true)throw new Error('인증 메일을 보내지 못했어요. 다시 시도해 주세요.');
   setSentTo(email.trim().toLowerCase());setToken('');setRemaining(retryAfter||60);
  } catch(e) { setError(e instanceof Error?e.message:'인증 메일을 보내지 못했어요. 다시 시도해 주세요.'); }
  finally {pending.current=false;setBusy(false);}
 }
 async function verifyEmail(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current||verifyWait||!sentTo)return;
  pending.current=true;setVerifying(true);setError('');
  try {
   const response=await fetch('/auth/verify-email',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Value-Lens':'1'},body:JSON.stringify({email:sentTo,token,returnTo})});
   const result=await response.json() as {ok?:boolean;error?:string;redirectTo?:string;retryAfter?:number};
   if(!response.ok){if(response.status===429&&typeof result.retryAfter==='number'&&result.retryAfter>0&&result.retryAfter<=86400)setVerifyWait(Math.ceil(result.retryAfter));throw new Error(result.error||'인증번호를 확인하지 못했어요. 다시 시도해 주세요.');}
   if(result.ok!==true||!result.redirectTo?.startsWith('/app?mode=app'))throw new Error('로그인을 완료하지 못했어요. 다시 시도해 주세요.');
   location.assign(result.redirectTo);
  }catch(e){setError(e instanceof Error?e.message:'인증번호를 확인하지 못했어요.');}
  finally{pending.current=false;setVerifying(false);}
 }
 return <div className="account-welcome"><div>
  <p className="eyebrow">누구나 이메일로 시작하기</p><h1>내 이메일로 가입하고,<br/>우리의 일을 시작해요.</h1>
  <p className="lede">소속 조직이나 초대가 없어도 가입할 수 있어요.<br/>이메일을 인증하고 로그인한 다음, 조직을 선택해요.</p>
  <ol className="start-steps">
   <li><span>01</span><div><strong>이메일로 회원가입해요</strong><p>평소 사용하는 개인 이메일로도 가입할 수 있어요.</p></div></li>
   <li><span>02</span><div><strong>인증번호를 입력하고 로그인해요</strong><p>메일로 받은 번호를 이 화면에 입력해 주세요.</p></div></li>
   <li><span>03</span><div><strong>로그인 후 조직을 선택해요</strong><p>새 조직을 만들거나 기존 조직에 참여해요.</p></div></li>
  </ol>
 </div><section className="start-card auth-card" aria-labelledby="auth-title">
  <Pill>개인 계정</Pill><h2 id="auth-title">이메일로 가입·로그인</h2>
  <p className="start-auth-note">처음이라면 이메일 인증 후 가입되고, 이미 가입했다면 로그인돼요. 조직 정보는 아직 필요 없어요.</p>
  {invite&&<p className="form-hint">받은 조직 초대는 로그인한 다음 확인해요.</p>}
  {authError&&<p className="form-error" role="alert">{messages[authError]??messages.callback}</p>}
  {!sentTo&&<form className="email-auth-form" onSubmit={sendEmail}>
   <label className="field" htmlFor="login-email"><span>이메일 주소</span><input id="login-email" name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} placeholder="내가 사용하는 이메일 주소" value={email} disabled={busy||verifying} onChange={e=>{setEmail(e.target.value);setError('');setEmailIssue('');}}/></label>
   {googleReady&&['email_delivery_limit','email_delivery_unavailable'].includes(emailIssue)&&<p className="form-hint">아래 Google로 계속하기를 이용할 수 있어요.</p>}
   <button className="button primary full" type="submit" disabled={!emailReady||busy||remaining>0}>{busy?'인증 메일을 보내고 있어요…':remaining>0?`${remaining}초 후 다시 받기`:'인증번호 받기'}<Icon name="arrow"/></button>
   <p className="form-hint">비밀번호 없이, 이메일로 받은 번호로 인증해요.</p>
   <button className="text-button" type="button" disabled={busy||!emailReady} onClick={e=>{if(e.currentTarget.form?.reportValidity()){setSentTo(email.trim().toLowerCase());setError('');setToken('');}}}>이미 받은 인증번호 입력하기</button>
  </form>}
  {sentTo&&<><div className="email-auth-sent" role="status"><strong>메일의 인증번호를 입력해 주세요.</strong><p><b>{sentTo}</b>로 받은 가장 최근 번호를 입력해요.</p><small>메일이 보이지 않으면 스팸함도 확인해 주세요.</small></div><form className="email-auth-form" onSubmit={verifyEmail}><label className="field" htmlFor="login-token"><span>인증번호</span><input className="otp-input" id="login-token" name="token" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required autoFocus placeholder="메일에 적힌 숫자" value={token} disabled={verifying||busy} onChange={e=>{setToken(e.target.value.replace(/[^0-9]/g,'').slice(0,10));setError('');}}/></label><button className="button primary full" disabled={verifying||busy||verifyWait>0}>{verifying?'인증번호 확인 중…':verifyWait>0?`${verifyWait}초 후 다시 확인`:'확인하고 로그인'}<Icon name="arrow"/></button></form><form onSubmit={sendEmail} className="otp-actions"><button type="submit" className="text-button" disabled={busy||verifying||remaining>0}>{busy?'메일 보내는 중…':remaining>0?`${remaining}초 후 다시 받기`:'인증 메일 다시 받기'}</button><button type="button" className="text-button" disabled={busy||verifying} onClick={()=>{setSentTo('');setToken('');setError('');}}>이메일 주소 변경</button></form><p className="form-hint">메일의 로그인 버튼으로도 인증할 수 있어요. 버튼은 메일을 요청한 브라우저에서 열어 주세요.</p></>}
  {error&&<p className="form-error" role="alert">{error}</p>}
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
