import { useState } from 'react';
import type { Session } from '../infrastructure/api';
import { Icon, Pill } from '../ui/shared';

export function SignIn({session,invite,orgId,hash}:{session:Session|null;invite?:string;orgId:string|null;hash:string}) {
 const google=true;
 const ready=session?.auth?.provider==='google'&&session.auth.ready;
 const provider='Google';
 const returnTo=`/app${location.search}${invite?hash:orgId?(hash||'#/home'):'#/organizations'}`;
 const href=`/auth/google?return_to=${encodeURIComponent(returnTo)}`;
 const authError=new URLSearchParams(location.search).get('auth_error');
 const messages:Record<string,string>={configuration:'구글 로그인 연결을 준비 중이에요. 잠시 후 다시 방문해 주세요.',provider:'구글 로그인 연결 설정을 확인하고 있어요. 잠시 후 다시 시도해 주세요.',cancelled:'로그인을 마치지 않았어요. 원하면 다시 시작할 수 있어요.',callback:'로그인 확인 시간이 지났거나 연결을 마치지 못했어요. 다시 시작해 주세요.',unavailable:'로그인 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'};
 return <div className="account-welcome"><div><p className="eyebrow">우리 조직으로 시작하기</p><h1>로그인하고,<br/>우리의 일을 이어가요.</h1><p className="lede">각자의 계정으로 로그인해 같은 조직에서 일해요.<br/>처음이라면 빈 작업실에서 첫 프로젝트를 시작해요.</p><ol className="start-steps"><li><span>01</span><div><strong>내 계정으로 로그인</strong><p>{google?'사용하는 구글 계정으로 간편하게 연결해요.':'현재는 ChatGPT 계정으로 연결해요.'}</p></div></li><li><span>02</span><div><strong>{invite?'받은 초대를 수락해요':'조직을 만들거나 초대를 받아요'}</strong><p>초대는 지정한 이메일의 계정으로 수락해요.</p></div></li><li><span>03</span><div><strong>우리 프로젝트에서 함께 일해요</strong><p>업무와 자료가 조직의 저장소에 모여요.</p></div></li></ol></div><section className="start-card"><Pill>조직 작업실</Pill><h2>{invite?'조직 초대를 받으셨네요.':'내 계정으로 시작해요.'}</h2><p className="start-auth-note">{invite?`초대받은 이메일과 같은 ${provider} 계정으로 로그인해 주세요.`:'로그인 후 새 조직을 만들거나 초대받은 조직에 참여할 수 있어요.'}</p>{authError&&<p className="form-error" role="alert">{messages[authError]??messages.callback}</p>}{ready?<a className={`button ${google?'secondary':'primary'} full`} href={href} target="_top">{provider}로 계속하기 <Icon name="arrow"/></a>:<><button className="button secondary full" disabled>Google 로그인 연결 준비 중</button><p className="form-hint">연결이 완료되면 여기서 시작할 수 있어요.</p></>}<p className="form-hint">데모는 가입 없이 볼 수 있어요.</p><a className="text-link" href="/app?mode=demo#/home">먼저 데모 둘러보기 →</a></section></div>;
}

export function SignOutButton({session,returnTo='/app?mode=app#/start',children='로그아웃'}:{session:Session;returnTo?:string;children?:React.ReactNode}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <span><button className="text-button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const r=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-Value-Lens':'1'}});if(!r.ok)throw new Error('로그아웃하지 못했어요. 다시 시도해 주세요.');location.href=returnTo;}catch(e){setError((e as Error).message);setBusy(false);}}}>{busy?'로그아웃 중…':children}</button>{error&&<small role="alert">{error}</small>}</span>;
}
