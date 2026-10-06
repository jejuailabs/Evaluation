import { useEffect, useState, useRef } from 'react';
import type { Command, Workspace } from './domain/types';
import { execute } from './domain/commands';
import { ownerName } from './domain/selectors';
import { initializePersonalWorkspace, loadWorkspace, saveWorkspace, type WorkspaceMode } from './infrastructure/storage';
import { createEmptyWorkspace } from './domain/workspace';
import { FirstProject, Start } from './features/Start';
import { Home, Projects, NewProject, Overview, Tasks } from './features/Projects';
import { Documents } from './features/Documents';
import { Budget } from './features/Budget';
import { Outcomes } from './features/Outcomes';
import { Reports } from './features/Reports';
import { Annual } from './features/Annual';
import { Work } from './features/Work';
import { ActivityFeed } from './features/Activity';
import { ProjectPlan } from './features/ProjectPlan';
import { registerWorkspaceTools } from './infrastructure/workspace-tools';
import { Empty, Icon, Pill } from './ui/shared';

import { loadCloud, sendCommand, uploadCloud, readCloud, ApiError, type CloudWorkspace, type Session } from './infrastructure/api';
import { OrganizationAdmin } from './features/Accounts';
import { SignOutButton } from './features/SignIn';
import { isManager } from '../server/policy';

function route(){ return location.hash.slice(1).split('/').filter(Boolean); }
export default function App({cloud}:{cloud?:{initial:CloudWorkspace;session:Session}}={}) {
  const [mode]=useState<WorkspaceMode>(()=>new URLSearchParams(location.search).get('mode')==='preview'?'personal':'demo');
  const [s,setState]=useState<Workspace|null>(()=>cloud?.initial.workspace??loadWorkspace(mode)); const [path,setPath]=useState(route);
  const [access,setAccess]=useState(cloud?.initial.access);const pendingCommands=useRef(new Map<string,string>());const [saving,setSaving]=useState(false);
  const stateRef=useRef(s);stateRef.current=s;const savingRef=useRef(false);
  useEffect(()=>registerWorkspaceTools(()=>stateRef.current),[]);
  const [newProject,setNewProject]=useState(false);const [toast,setToast]=useState('');const [saveError,setSaveError]=useState('');
  const [theme,setTheme]=useState(()=>localStorage.getItem('value-lens-saas:theme')??'forest');
  useEffect(()=>{const handler=()=>{setPath(route());window.scrollTo(0,0);}; window.addEventListener('hashchange',handler); return()=>window.removeEventListener('hashchange',handler);},[]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('value-lens-saas:theme',theme);}catch{/* Theme storage is optional. */}},[theme]);
  useEffect(()=>{if(!toast)return;const timeout=setTimeout(()=>setToast(''),5500);return()=>clearTimeout(timeout);},[toast]);
  async function refresh(){if(cloud&&s){const result=await loadCloud(s.organization.id);stateRef.current=result.workspace;setState(result.workspace);setAccess(result.access);}}
  async function run(command:Command): Promise<boolean> {
    const current=stateRef.current;if(!current)return false;
    if(savingRef.current){setToast('저장 중이에요. 잠시 기다려 주세요.');return false;}savingRef.current=true;setSaving(true);setSaveError('');
    try{if(cloud){const key=JSON.stringify(command);let requestId=pendingCommands.current.get(key);if(!requestId){requestId=crypto.randomUUID();pendingCommands.current.set(key,requestId);}const result=await sendCommand(current.organization.id,command,current.revision,requestId);stateRef.current=result.workspace;setState(result.workspace);setAccess(result.access);pendingCommands.current.delete(key);setToast('조직 저장소에 저장했어요.');}else{const next=execute(current,command);saveWorkspace(next,current.revision,mode);stateRef.current=next;setState(next);setToast('저장했어요. 이 브라우저에서 이어서 볼 수 있어요.');}return true;}
    catch(error){setSaveError(error instanceof Error?error.message:'저장하지 못했어요.');setToast(error instanceof Error?error.message:'저장하지 못했어요. 입력은 유지돼요.');if(error instanceof ApiError&&[401,403].includes(error.status)){location.reload();}else if(error instanceof ApiError&&error.status===409){pendingCommands.current.clear();try{await refresh();}catch{/* Keep the form for retry. */}}return false;}finally{savingRef.current=false;setSaving(false);}
  }
  const page=path[0]??'home';
  if(!s||(mode==='personal'&&page==='start'))return <Start workspace={s} create={(organization,member)=>{const next=createEmptyWorkspace(organization,member);initializePersonalWorkspace(next);setState(next);location.hash='/home';}}/>;
  const canManage=!cloud||isManager(access?.role??'');const canWrite=!cloud||access?.role!=='viewer';
  const ctx={s,run,notify:setToast,canManage,canWrite,memberId:access?.memberId??s.members[0]?.id,saveError,clearError:()=>setSaveError(''),cloud:!!cloud,...(cloud?{upload:(pid:string,file:File)=>uploadCloud(s.organization.id,pid,file),read:(v:import('./domain/types').DocumentVersion)=>readCloud(s.organization.id,v)}:{})}; const project=s.projects.find(p=>p.id===path[1]&&p.orgId===s.organization.id);
  const tab=path[2]??'overview'; const tabs=[['overview','한눈에 보기'],['tasks','업무·일정'],['documents','자료·기록'],['budget','예산'],['outcomes','성과'],['report','보고서']];
  const nav=[['home','홈'],...(canManage?[['annual','연간 계획']]:[]),['projects','프로젝트'],['work','업무·일정'],['files','자료함'],['reports','보고서'],...(cloud&&canManage?[['admin','조직 관리']]:[])];
  return <><a className="skip-link" href="#main" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus();}}>본문으로 이동</a><div className="app-shell"><aside className="sidebar"><a className="brand" href="#/home"><span className="brand-symbol">✳</span><span>가치 돋보기<small>VALUE LENS</small></span></a><div className="organization"><span className="avatar">{s.organization.name.slice(0,1)}</span><div><strong>{s.organization.name}</strong><small>{cloud?({owner:'조직 대표',admin:'조직 관리자',member:'조직원',viewer:'읽기 전용'} as any)[access!.role]:mode==='demo'?'예시 조직':'내 작업실'} · 멤버 {s.members.length}명</small></div></div><nav aria-label="주 메뉴">{nav.map(([id,label])=><a key={id} href={`#/${id}`} aria-current={page===id?'page':undefined}><Icon name={id}/><span>{label}</span>{id==='projects'&&<small>{s.projects.length}</small>}</a>)}</nav><div className="sidebar-projects"><p>함께 진행하는 일</p>{s.projects.slice(0,5).map(p=><a href={`#/projects/${p.id}/overview`} key={p.id} className={p.id===project?.id?'selected':''}><span className="project-dot"/>{p.name}</a>)}</div><div className="sidebar-bottom">{cloud&&<><a href="/?mode=app#/organizations">조직 전환 · 새 조직 만들기 →</a>{cloud.session.platformAdmin&&<a href="/?mode=app#/platform">전체 관리자 →</a>}<SignOutButton session={cloud.session}/></>}<p>일하면서 남긴 기록이<br/>우리 조직의 성과가 됩니다.</p><a href="https://value-lens-studio.naggu1999.chatgpt.site/" target="_blank" rel="noreferrer">가치 돋보기 소개 ↗</a><div className="theme-picker" aria-label="화면 색상">{[['forest','숲'],['ink','잉크'],['clay','흙'],['plum','자두']].map(([id,label])=><button key={id} data-color={id} aria-label={`${label} 테마`} aria-pressed={theme===id} onClick={()=>setTheme(id)} title={`${label} 테마`}>{theme===id&&<Icon name="check" size={14}/>}</button>)}</div></div></aside><div className="main-shell"><header className="topbar"><div className="breadcrumb">{s.organization.name} <span>/</span> {project?.name??nav.find(([id])=>id===page)?.[1]??'작업실'}</div><div className="topbar-right"><Pill>{cloud?'조직 공동 작업실':mode==='demo'?'예시 데모':'시작 화면 미리보기'}</Pill><span className="avatar small">{(cloud?.session.user?.displayName??s.members[0]?.name)?.slice(0,1)}</span></div></header><div className="demo-bar"><span className="status-dot"/><span>{cloud?(saving?'조직 저장소에 저장 중…':'로그인한 조직의 공동 작업실이에요. 최신 변경은 새로고침으로 불러와요.'):mode==='demo'?'예시 조직으로 둘러보고 있어요. 변경 내용은 이 브라우저에만 저장돼요.':'이전 브라우저 미리보기예요. 이 자료는 서버에 자동으로 옮겨지지 않아요.'}</span>{cloud?<button className="text-button" onClick={async()=>{try{await refresh();setToast('최신 내용을 불러왔어요.');}catch(e){setToast((e as Error).message);if(e instanceof ApiError&&[401,403].includes(e.status))location.reload();}}}>새로고침 ↻</button>:<a href="?mode=start#/start">우리 조직으로 시작하기 <Icon name="arrow" size={15}/></a>}</div><main id="main" tabIndex={-1}>
      {page==='annual'&&<Annual {...ctx}/>} {page==='work'&&<Work {...ctx}/>}
      {page==='admin'&&cloud&&canManage&&<OrganizationAdmin orgId={s.organization.id} role={access!.role} changed={refresh}/>}
      {page==='home'&&(s.projects.length?<Home {...ctx} create={()=>setNewProject(true)}/>:<><div className="page-heading"><div><p className="eyebrow">{s.organization.name}</p><h1>우리 조직의 첫 시작이에요.</h1><p className="lede">지금부터 남기는 기록이 우리 프로젝트의 바탕이 돼요.</p></div></div><FirstProject create={()=>setNewProject(true)} canCreate={canManage}/></>)}
      {page==='projects'&&!path[1]&&(s.projects.length?<Projects {...ctx} create={()=>setNewProject(true)}/>:<FirstProject create={()=>setNewProject(true)} canCreate={canManage}/>)}
      {page==='projects'&&path[1]&&(project?<div key={project.id}><a href="#/projects" className="back-link">← 프로젝트 목록</a><div className="project-heading"><div><Pill>{project.category}</Pill><h1>{project.name}</h1><p>{project.purpose}</p></div><div className="project-meta"><span>{project.start} — {project.end}</span><span><span className="avatar small">{ownerName(s,project.ownerId).slice(0,1)}</span> {ownerName(s,project.ownerId)} 담당</span></div></div><nav className="project-tabs" aria-label="프로젝트 메뉴">{tabs.map(([id,label])=><a key={id} href={`#/projects/${project.id}/${id}`} aria-current={tab===id?'page':undefined}>{label}</a>)}</nav>
      {tab==='overview'&&<><ProjectPlan {...ctx} project={project}/><Overview {...ctx} project={project}/></>}{tab==='tasks'&&<Tasks {...ctx} project={project}/>} {tab==='documents'&&<><ActivityFeed {...ctx} project={project}/><Documents {...ctx} projectId={project.id}/></>}{tab==='budget'&&<Budget {...ctx} project={project}/>} {tab==='outcomes'&&<Outcomes {...ctx} project={project}/>} {tab==='report'&&<Reports {...ctx} projectId={project.id}/>} {!tabs.some(([id])=>id===tab)&&<Empty>해당 화면을 찾지 못했어요. 위 메뉴에서 이동해 주세요.</Empty>}
      </div>:<Empty>프로젝트를 찾지 못했어요. <a href="#/projects">목록으로 돌아가기</a></Empty>)}
      {page==='files'&&(s.projects.length?<Documents {...ctx}/>:<FirstProject title="자료를 모을 프로젝트를 먼저 만들어요." create={()=>setNewProject(true)} canCreate={canManage}/>)} {page==='reports'&&(s.projects.length?<Reports {...ctx}/>:<FirstProject title="첫 프로젝트의 기록이 보고서가 돼요." create={()=>setNewProject(true)} canCreate={canManage}/>)}
      {!nav.some(([id])=>id===page)&&<Empty>화면을 찾지 못했어요. <a href="#/home">홈으로 돌아가기</a></Empty>}
      <footer className="app-footer"><span>VALUE LENS · 일의 과정과 결과를 함께</span><span>{cloud?'조직 공동 작업실':mode==='demo'?'예시 데모':'시작 화면 미리보기'} / {cloud?'서버에 저장':'브라우저에 저장'}</span></footer>
    </main></div></div>{newProject&&<NewProject {...ctx} close={()=>setNewProject(false)}/>}<div className="toast-region" aria-live="polite" aria-atomic="true">{toast&&<div className="toast">{toast}<button onClick={()=>setToast('')} aria-label="알림 닫기"><Icon name="close" size={16}/></button></div>}</div></>;
}
