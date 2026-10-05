import { useEffect, useState } from 'react';
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
import { Empty, Icon, Pill } from './ui/shared';

function route(){ return location.hash.slice(1).split('/').filter(Boolean); }
export default function App() {
  const [mode]=useState<WorkspaceMode>(()=>new URLSearchParams(location.search).get('mode')==='start'?'personal':'demo');
  const [s,setState]=useState<Workspace|null>(()=>loadWorkspace(mode)); const [path,setPath]=useState(route);
  const [newProject,setNewProject]=useState(false);const [toast,setToast]=useState('');
  const [theme,setTheme]=useState(()=>localStorage.getItem('value-lens-saas:theme')??'forest');
  useEffect(()=>{const handler=()=>{setPath(route());window.scrollTo(0,0);}; window.addEventListener('hashchange',handler); return()=>window.removeEventListener('hashchange',handler);},[]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('value-lens-saas:theme',theme);}catch{/* Theme storage is optional. */}},[theme]);
  useEffect(()=>{if(!toast)return;const timeout=setTimeout(()=>setToast(''),5500);return()=>clearTimeout(timeout);},[toast]);
  function run(command:Command): boolean {
    if(!s)return false;
    try{const next=execute(s,command);saveWorkspace(next,s.revision,mode);setState(next);setToast('저장했어요. 이 브라우저에서 이어서 볼 수 있어요.');return true;}
    catch(error){setToast(error instanceof Error?error.message:'저장하지 못했어요. 입력은 유지돼요.');return false;}
  }
  const page=path[0]??'home';
  if(!s||(mode==='personal'&&page==='start'))return <Start workspace={s} create={(organization,member)=>{const next=createEmptyWorkspace(organization,member);initializePersonalWorkspace(next);setState(next);location.hash='/home';}}/>;
  const ctx={s,run,notify:setToast}; const project=s.projects.find(p=>p.id===path[1]&&p.orgId===s.organization.id);
  const tab=path[2]??'overview'; const tabs=[['overview','한눈에 보기'],['tasks','업무·일정'],['documents','자료·기록'],['budget','예산'],['outcomes','성과'],['report','보고서']];
  const nav=[['home','홈'],['projects','프로젝트'],['files','자료함'],['reports','보고서']];
  return <><a className="skip-link" href="#main" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus();}}>본문으로 이동</a><div className="app-shell"><aside className="sidebar"><a className="brand" href="#/home"><span className="brand-symbol">✳</span><span>가치 돋보기<small>VALUE LENS</small></span></a><div className="organization"><span className="avatar">{s.organization.name.slice(0,1)}</span><div><strong>{s.organization.name}</strong><small>{mode==='demo'?'예시 조직':'내 작업실'} · 멤버 {s.members.length}명</small></div></div><nav aria-label="주 메뉴">{nav.map(([id,label])=><a key={id} href={`#/${id}`} aria-current={page===id?'page':undefined}><Icon name={id}/><span>{label}</span>{id==='projects'&&<small>{s.projects.length}</small>}</a>)}</nav><div className="sidebar-projects"><p>함께 진행하는 일</p>{s.projects.slice(0,5).map(p=><a href={`#/projects/${p.id}/overview`} key={p.id} className={p.id===project?.id?'selected':''}><span className="project-dot"/>{p.name}</a>)}</div><div className="sidebar-bottom"><p>일하면서 남긴 기록이<br/>우리 조직의 성과가 됩니다.</p><a href="https://value-lens-studio.naggu1999.chatgpt.site/" target="_blank" rel="noreferrer">가치 돋보기 소개 ↗</a><div className="theme-picker" aria-label="화면 색상">{[['forest','숲'],['ink','잉크'],['clay','흙'],['plum','자두']].map(([id,label])=><button key={id} data-color={id} aria-label={`${label} 테마`} aria-pressed={theme===id} onClick={()=>setTheme(id)} title={`${label} 테마`}>{theme===id&&<Icon name="check" size={14}/>}</button>)}</div></div></aside><div className="main-shell"><header className="topbar"><div className="breadcrumb">{s.organization.name} <span>/</span> {project?.name??nav.find(([id])=>id===page)?.[1]??'작업실'}</div><div className="topbar-right"><Pill>{mode==='demo'?'예시 데모':'시작 화면 미리보기'}</Pill><span className="avatar small">{s.members[0]?.name.slice(0,1)}</span></div></header><div className="demo-bar"><span className="status-dot"/><span>{mode==='demo'?'예시 조직으로 둘러보고 있어요. 변경 내용은 이 브라우저에만 저장돼요.':'내가 만든 자료만 있는 작업실이에요. 로그인 없이 이 브라우저에만 저장돼요.'}</span><a href={mode==='demo'?'?mode=start#/start':'?mode=demo#/home'}>{mode==='demo'?'우리 조직으로 시작하기':'예시 데모 보기'} <Icon name="arrow" size={15}/></a></div><main id="main" tabIndex={-1}>
      {page==='home'&&(s.projects.length?<Home {...ctx} create={()=>setNewProject(true)}/>:<><div className="page-heading"><div><p className="eyebrow">{s.organization.name}</p><h1>우리 조직의 첫 시작이에요.</h1><p className="lede">지금부터 남기는 기록이 우리 프로젝트의 바탕이 돼요.</p></div></div><FirstProject create={()=>setNewProject(true)}/></>)}
      {page==='projects'&&!path[1]&&(s.projects.length?<Projects {...ctx} create={()=>setNewProject(true)}/>:<FirstProject create={()=>setNewProject(true)}/>)}
      {page==='projects'&&path[1]&&(project?<div key={project.id}><a href="#/projects" className="back-link">← 프로젝트 목록</a><div className="project-heading"><div><Pill>{project.category}</Pill><h1>{project.name}</h1><p>{project.purpose}</p></div><div className="project-meta"><span>{project.start} — {project.end}</span><span><span className="avatar small">{ownerName(s,project.ownerId).slice(0,1)}</span> {ownerName(s,project.ownerId)} 담당</span></div></div><nav className="project-tabs" aria-label="프로젝트 메뉴">{tabs.map(([id,label])=><a key={id} href={`#/projects/${project.id}/${id}`} aria-current={tab===id?'page':undefined}>{label}</a>)}</nav>
      {tab==='overview'&&<Overview {...ctx} project={project}/>}{tab==='tasks'&&<Tasks {...ctx} project={project}/>} {tab==='documents'&&<Documents {...ctx} projectId={project.id}/>}{tab==='budget'&&<Budget {...ctx} project={project}/>} {tab==='outcomes'&&<Outcomes {...ctx} project={project}/>} {tab==='report'&&<Reports {...ctx} projectId={project.id}/>} {!tabs.some(([id])=>id===tab)&&<Empty>해당 화면을 찾지 못했어요. 위 메뉴에서 이동해 주세요.</Empty>}
      </div>:<Empty>프로젝트를 찾지 못했어요. <a href="#/projects">목록으로 돌아가기</a></Empty>)}
      {page==='files'&&(s.projects.length?<Documents {...ctx}/>:<FirstProject title="자료를 모을 프로젝트를 먼저 만들어요." create={()=>setNewProject(true)}/>)} {page==='reports'&&(s.projects.length?<Reports {...ctx}/>:<FirstProject title="첫 프로젝트의 기록이 보고서가 돼요." create={()=>setNewProject(true)}/>)}
      {!nav.some(([id])=>id===page)&&<Empty>화면을 찾지 못했어요. <a href="#/home">홈으로 돌아가기</a></Empty>}
      <footer className="app-footer"><span>VALUE LENS · 일의 과정과 결과를 함께</span><span>{mode==='demo'?'예시 데모':'시작 화면 미리보기'} / 브라우저에 저장</span></footer>
    </main></div></div>{newProject&&<NewProject {...ctx} close={()=>setNewProject(false)}/>}<div className="toast-region" aria-live="polite" aria-atomic="true">{toast&&<div className="toast">{toast}<button onClick={()=>setToast('')} aria-label="알림 닫기"><Icon name="close" size={16}/></button></div>}</div></>;
}
