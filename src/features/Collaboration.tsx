import {useEffect,useRef,useState} from 'react';
import {api,ApiError} from '../infrastructure/api';
import {discussionHref,targetLabels,type DiscussionTarget,type DiscussionPage,type ProjectComment,type NotificationPage,type TargetType} from '../domain/collaboration';
import type {Project} from '../domain/types';
import {Empty,Field,Modal,Pill,type Context} from '../ui/shared';

const date=(value:string)=>new Date(value).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
export function DiscussionLink({projectId,type,id}:{projectId:string;type:TargetType;id:string}){return <a className="text-link discussion-link" href={discussionHref({projectId,type,id})}>댓글 →</a>;}
const sourceTabs={project:'overview',task:'tasks',activity:'documents',document:'documents',measurement:'outcomes',expense:'budget'};
export function DiscussionPanel({s,project,cloud,type,id,memberId}:{project:Project;type?:string;id?:string}&Context){
 const selectedType:TargetType=type&&type in targetLabels?type as TargetType:'project';
 const target={projectId:project.id,type:selectedType,id:id??project.id};
 const targets:({name:string}&DiscussionTarget)[]=[{projectId:project.id,type:'project',id:project.id,name:project.name},
  ...s.tasks.filter(x=>x.projectId===project.id).map(x=>({projectId:project.id,type:'task' as const,id:x.id,name:x.title})),
  ...(s.activities??[]).filter(x=>x.projectId===project.id).map(x=>({projectId:project.id,type:'activity' as const,id:x.id,name:x.title})),
  ...s.documents.filter(x=>x.projectId===project.id).map(x=>({projectId:project.id,type:'document' as const,id:x.id,name:x.title})),
  ...s.measurements.filter(x=>x.projectId===project.id).map(x=>({projectId:project.id,type:'measurement' as const,id:x.id,name:`${s.indicators.find(i=>i.id===x.indicatorId)?.name??'실적'} · ${x.asOf}`})),
  ...s.expenses.filter(x=>x.projectId===project.id).map(x=>({projectId:project.id,type:'expense' as const,id:x.id,name:x.title}))];
 return <section className="discussion-layout"><div className="section-title"><div><p className="eyebrow">함께 확인하고, 기록해요</p><h2>프로젝트 대화</h2><p>업무·자료·실적 옆에 의견을 남겨요. 확인이 필요한 사람에게 알림이 전달돼요.</p></div></div><Field label="어떤 항목에 관한 이야기인가요?"><select value={`${target.type}:${target.id}`} onChange={e=>{const t=targets.find(t=>`${t.type}:${t.id}`===e.target.value);if(t)location.hash=discussionHref(t).slice(1);}}>{targets.map(t=><option key={`${t.type}:${t.id}`} value={`${t.type}:${t.id}`}>{targetLabels[t.type]} · {t.name}</option>)}</select></Field>
 <a className="text-link" href={`#/projects/${project.id}/${sourceTabs[target.type]}`}>{targetLabels[target.type]} 화면에서 확인하기 →</a>
 {cloud?<Thread key={`${project.id}:${target.type}:${target.id}`} orgId={s.organization.id} target={target} memberId={memberId}/>:<Empty>조직에 로그인하면 구성원과 댓글을 주고받고 담당자 알림을 받을 수 있어요. <a href="/app?mode=start#/start">우리 조직으로 시작하기 →</a></Empty>}</section>;
}
function Thread({orgId,target,memberId}:{orgId:string;target:DiscussionTarget;memberId?:string}){
 const base=`organizations/${encodeURIComponent(orgId)}/discussions`,query=new URLSearchParams({project:target.projectId,type:target.type,target:target.id});
 const [page,setPage]=useState<DiscussionPage|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[body,setBody]=useState(''),[mentions,setMentions]=useState<string[]>([]),[editing,setEditing]=useState<ProjectComment|null>(null),[remove,setRemove]=useState<string|null>(null);
 const request=useRef({id:crypto.randomUUID(),signature:''}),alive=useRef(true),reading=useRef(false),abort=useRef(new AbortController());
 async function refresh(before?:number){
  if(reading.current)return;reading.current=true;
  try{const result=await api<DiscussionPage>(`${base}?${query}${before?`&before=${before}`:''}`,undefined,'GET',{signal:abort.current.signal});if(!alive.current)return;
   setPage(old=>{const comments=new Map((old?.comments??[]).map(c=>[c.id,c]));result.comments.forEach(c=>comments.set(c.id,c));return {...result,nextCursor:before?result.nextCursor:old?old.nextCursor:result.nextCursor,comments:[...comments.values()].sort((a,b)=>a.seq-b.seq)};});setError('');
  }catch(e){if(alive.current){setError((e as Error).message);if(e instanceof ApiError&&[401,403].includes(e.status))setPage(null);}}
  finally{reading.current=false;}
 }
 useEffect(()=>{alive.current=true;abort.current=new AbortController();void refresh();const tick=()=>{if(document.visibilityState==='visible'&&navigator.onLine)void refresh();};const timer=setInterval(tick,25000);window.addEventListener('focus',tick);return()=>{alive.current=false;abort.current.abort();clearInterval(timer);window.removeEventListener('focus',tick);};},[]);
 async function write(action:'save'|'delete',comment?:ProjectComment){
  setBusy(true);setError('');
  try{
   if(action==='delete'&&comment)await api(`${base}/${comment.id}`,{version:comment.version},'DELETE');
   else if(editing)await api(`${base}/${editing.id}`,{version:editing.version,body,mentions},'PATCH');
   else{const signature=JSON.stringify({body,mentions});if(request.current.signature!==signature)request.current={id:crypto.randomUUID(),signature};await api(base,{id:request.current.id,target,body,mentions});}
   if(!alive.current)return;if(action==='save'||editing?.id===comment?.id){setEditing(null);setBody('');setMentions([]);request.current={id:crypto.randomUUID(),signature:''};}setRemove(null);await refresh();window.dispatchEvent(new Event('value-lens:changes'));
  }catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}
 }
 return <div className="thread" data-sync-editing={body.trim()||editing?'true':undefined}>
 {error&&<p className="form-error" role="alert">{error} <button className="text-button" onClick={()=>void refresh()}>다시 불러오기</button></p>}
 {!page&&!error&&<p role="status">댓글을 불러오고 있어요…</p>}
 {page&&<><div className="thread-caption"><strong>{page.targetName}</strong><small>25초마다 새 댓글 확인</small></div>{page.nextCursor&&<button className="text-button" onClick={()=>void refresh(page.nextCursor!)}>이전 댓글 보기</button>}
 {!page.comments.length?<Empty>첫 의견을 남겨 보세요. 의견을 나눈 과정도 이 기록에 함께 남아요.</Empty>:<ol className="comment-list">{page.comments.map(c=><li className="comment-card" key={c.id}><div className="comment-meta"><strong>{c.authorName}</strong><time dateTime={c.createdAt}>{date(c.createdAt)}</time>{c.updatedAt&&!c.deletedAt&&<span>수정됨</span>}</div>{c.deletedAt?<p className="muted">삭제된 댓글이에요.</p>:<><p className="comment-body">{c.body}</p>{c.mentions.length>0&&<p className="mention-list">확인 요청 · {c.mentions.map(id=>page.participants.find(p=>p.id===id)?.name??'이전 구성원').join(', ')}</p>}{c.edits.length>0&&<details><summary>수정 이력 {c.edits.length}개</summary>{c.edits.map((e,i)=><blockquote key={i}><small>{date(e.at)}</small><p className="comment-body">{e.body}</p></blockquote>)}</details>}<div className="actions">{c.canEdit&&<button className="text-button" disabled={busy} onClick={()=>{setEditing(c);setBody(c.body);setMentions(c.mentions);}}>수정</button>}{c.canDelete&&<button className="text-button" disabled={busy} onClick={()=>setRemove(remove===c.id?null:c.id)}>{remove===c.id?'취소':'삭제'}</button>}{remove===c.id&&<button className="text-button" disabled={busy} onClick={()=>void write('delete',c)}>댓글과 수정 이력 삭제</button>}</div></>}</li>)}</ol>}
 {page.canPost?<form className="panel comment-compose form" onSubmit={e=>{e.preventDefault();void write('save');}}><Field label={editing?'댓글 수정':'의견 남기기'}><textarea value={body} onChange={e=>setBody(e.target.value)} required maxLength={3000} rows={4} disabled={busy} placeholder="확인한 내용이나 보완할 점을 적어 주세요."/></Field><details><summary>확인을 부탁할 사람 · 선택 {mentions.length>0&&`(${mentions.length}명)`}</summary><div className="mention-options">{page.participants.filter(p=>p.id!==memberId).map(p=><label key={p.id}><input type="checkbox" checked={mentions.includes(p.id)} disabled={busy||(!mentions.includes(p.id)&&mentions.length>=10)} onChange={e=>setMentions(e.target.checked?[...mentions,p.id]:mentions.filter(x=>x!==p.id))}/>{p.name}</label>)}</div><small>최대 10명. 이 대화의 참여자와 프로젝트 담당자에게도 알림이 전달돼요.</small></details><div className="actions"><button className="button primary" disabled={busy||!body.trim()}>{busy?'저장 중…':editing?'수정 저장':'댓글 남기기'}</button>{editing&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setEditing(null);setBody('');setMentions([]);}}>수정 취소</button>}</div></form>:<p className="notice">읽기 전용이거나 보관된 프로젝트에서는 댓글을 읽을 수만 있어요.</p>}</>}
 </div>;
}
export function Notifications({orgId,unread,changed}:{orgId:string;unread:number;changed:()=>void}){
 const [open,setOpen]=useState(false);return <><button className="button secondary inbox-button" onClick={()=>setOpen(true)} aria-label={`알림 ${unread}개`}>알림 {unread>0&&<Pill>{unread>99?'99+':unread}</Pill>}</button>{open&&<Inbox orgId={orgId} close={()=>setOpen(false)} changed={changed}/>}</>;
}
function Inbox({orgId,close,changed}:{orgId:string;close:()=>void;changed:()=>void}){
 const base=`organizations/${encodeURIComponent(orgId)}/notifications`;const [page,setPage]=useState<NotificationPage|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const alive=useRef(true),controller=useRef(new AbortController()),reading=useRef(false);
 async function load(before?:number){if(reading.current)return;reading.current=true;try{const result=await api<NotificationPage>(`${base}${before?`?before=${before}`:''}`,undefined,'GET',{signal:controller.current.signal});if(alive.current){setPage(old=>before&&old?{...result,items:[...old.items,...result.items]}:result);setError('');}}catch(e){if(alive.current)setError((e as Error).message);}finally{reading.current=false;}}
 useEffect(()=>{alive.current=true;controller.current=new AbortController();void load();const tick=()=>{if(document.visibilityState==='visible'&&navigator.onLine)void load();};const timer=setInterval(tick,25000);return()=>{alive.current=false;controller.current.abort();clearInterval(timer);};},[]);
 async function read(ids:string[],target?:DiscussionTarget,kind?:string){setBusy(true);try{if(ids.length)await api(base,{ids});changed();if(target){location.hash=kind==='report.workflow'?`/projects/${encodeURIComponent(target.projectId)}/report/${encodeURIComponent(target.id)}`:discussionHref(target).slice(1);close();}else await load();}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}}
 return <Modal title="내 알림" close={close} error={error}><p>담당 업무, 검토 요청, 댓글을 한곳에서 확인해요.</p><div className="actions"><button className="text-button" disabled={busy} onClick={()=>void load()}>새로 불러오기</button><button className="text-button" disabled={busy||!page?.items.some(n=>!n.readAt)} onClick={()=>void read(page!.items.filter(n=>!n.readAt).slice(0,50).map(n=>n.id))}>최근 50개 읽음</button></div>{!page&&!error?<p role="status">알림을 불러오고 있어요…</p>:page&&!page.items.length?<Empty>아직 받은 알림이 없어요.</Empty>:<ul className="notification-list">{page?.items.map(n=><li key={n.id}><button disabled={busy} className={n.readAt?'notification read':'notification'} onClick={()=>void read(n.readAt?[]:[n.id],n.target,n.kind)}><span>{!n.readAt&&<span className="status-dot"/>}{n.title}</span><small>{date(n.createdAt)} · {n.kind==='report.workflow'?'보고서':targetLabels[n.target.type]} 확인 →</small></button></li>)}</ul>}{page?.nextCursor&&<button className="text-button" onClick={()=>void load(page.nextCursor!)}>이전 알림 보기</button>}</Modal>;
}
