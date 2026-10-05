import { useState } from 'react';
import { download, readFile, saveFile } from '../infrastructure/storage';
import { uid } from '../domain/selectors';
import type { Document } from '../domain/types';
import { type Context, Empty, Field, Form, Heading, Icon, Modal, Pill, textValue } from '../ui/shared';

export function Documents({ s,run,notify,projectId }: Context & { projectId?: string }) {
  const [adding,setAdding]=useState(false); const [versionOf,setVersionOf]=useState<Document|null>(null); const [query,setQuery]=useState('');
  const docs=s.documents.filter(d=>d.orgId===s.organization.id&&(!projectId||d.projectId===projectId)&&d.title.toLowerCase().includes(query.toLowerCase()));
  return <>{projectId?<div className="section-title"><div><h2>자료와 기록</h2><p>원본을 모으고, 새 버전을 이어서 보관해요.</p></div><button className="button primary" onClick={()=>setAdding(true)}><Icon name="plus"/>자료 등록</button></div>:<Heading eyebrow="한곳에 모이는 근거" title="자료함" description="프로젝트의 자료를 원본과 버전별로 찾을 수 있어요." action={<button className="button primary" onClick={()=>setAdding(true)}><Icon name="plus"/>자료 등록</button>}/>}
    <div className="notice">이 시제품은 파일을 현재 브라우저에 보관해요. HWPX를 포함한 원본 등록은 가능하며, 내용 분석·편집·변환은 아직 연결하지 않았어요. 파일당 25MB까지 등록할 수 있어요.</div>
    <div className="search-field"><Icon name="search"/><input aria-label="자료 이름 검색" placeholder="자료 이름으로 찾기" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    <div className="document-list">{docs.map(d=><article className="document-row" key={d.id}><div className="document-symbol"><Icon name="files" size={26}/></div><div className="document-body"><div className="document-title"><h3>{d.title}</h3><Pill>v{d.versions.length}</Pill></div><p>{s.projects.find(p=>p.id===d.projectId)?.name} · {d.versions.at(-1)!.createdAt.slice(0,10)}</p><details><summary>버전 {d.versions.length}개 보기</summary><div className="versions">{[...d.versions].reverse().map((v,i)=><div key={v.id}><span>v{d.versions.length-i} · {v.name}<small>{v.createdAt.slice(0,10)} · {v.inlineText!==undefined?'가상 예시 파일':`${Math.max(1,Math.round(v.size/1024))} KB`}</small></span><button className="text-button" onClick={async()=>{try{download(await readFile(v),v.name);}catch(e){notify((e as Error).message);}}}>내려받기 ↓</button></div>)}</div></details></div><button className="button secondary" onClick={()=>setVersionOf(d)}>새 버전</button></article>)}</div>{!docs.length&&<Empty>{query?'찾는 자료가 없어요.':'사업계획서나 현장 사진부터 올려 보세요.'}</Empty>}
    {(adding||versionOf)&&<Modal title={versionOf?'자료의 새 버전':'자료 등록'} close={()=>{setAdding(false);setVersionOf(null);}}><Form label="원본 저장" submit={async f=>{
      const file=f.get('file'); if(!(file instanceof File)||!file.size) throw new Error('비어 있지 않은 파일을 선택해 주세요.');
      const pId=versionOf?.projectId??projectId??textValue(f,'projectId'); const id=uid(); await saveFile(id,file);
      const version={id,name:file.name,size:file.size,createdAt:new Date().toISOString(),blobKey:id};
      const command=versionOf?{type:'document.version' as const,projectId:pId,documentId:versionOf.id,version}:{type:'document.add' as const,document:{id:uid(),orgId:s.organization.id,projectId:pId,title:textValue(f,'title')||file.name,versions:[version]}};
      if(run(command)){setAdding(false);setVersionOf(null);}
    }}>{!versionOf&&!projectId&&<Field label="프로젝트"><select name="projectId" required>{s.projects.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></Field>}{!versionOf&&<Field label="자료 이름 · 비워 두면 파일명 사용"><input name="title" maxLength={160}/></Field>}{versionOf&&<p className="muted">{versionOf.title} · 기존 버전과 연결된 증빙은 그대로 남아요.</p>}<Field label="파일 선택"><input type="file" name="file" required/></Field><p className="form-hint">원본을 저장하는 기능이에요. 내용 추출이나 AI 분석을 실행하지 않아요.</p></Form></Modal>}
  </>;
}
