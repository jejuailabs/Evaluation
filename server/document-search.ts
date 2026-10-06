import type {Workspace} from '../src/domain/types';
import type {Services} from './api';
import {HttpError,type Actor,visibleWorkspace} from './policy';
import {indexFile} from './file-inspection';
export async function documentSearch(env:Services,state:Workspace,actor:Actor,url:URL,method:string){
 const visible=visibleWorkspace(state,actor),q=(url.searchParams.get('q')??'').trim().toLocaleLowerCase(),pid=url.searchParams.get('project');
 if(q.length>160)throw new HttpError(400,'검색어는 160자까지예요.');
 const docs=visible.documents.filter(d=>!pid||d.projectId===pid||d.referenceProjectIds?.includes(pid));
 if(method==='POST'){
  let indexed=0,unsupported=0;
  for(const d of docs){for(const v of d.versions.slice(-1)){
   const key=v.blobKey??v.id;if(await env.DB.prepare('SELECT version_id FROM document_text WHERE org_id=? AND version_id=?').bind(state.organization.id,key).first())continue;
   if(indexed>=10)break;const object=v.inlineText!==undefined?{body:v.inlineText}:await env.BUCKET?.get(`${state.organization.id}/${key}`);if(!object){unsupported++;continue;}
   try{await indexFile(env.DB,state.organization.id,key,v.name,new Uint8Array(await new Response(object.body).arrayBuffer()));indexed++;}catch{unsupported++;}
  }}return {indexed,unsupported};
 }
 const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
 // Match and paginate inside PostgreSQL; do not send every document's extracted body to the app.
 const requested=JSON.stringify(docs.flatMap(d=>{const v=d.versions.at(-1);return v?[{id:d.id,title:d.title,version:v.id,key:v.blobKey??v.id,inline:v.inlineText??null}]:[];}));
 const cte=`WITH records AS (SELECT d.id,d.title,d.version,COALESCE(d.inline,t.content,'') AS content,(d.inline IS NOT NULL OR t.version_id IS NOT NULL) AS indexed,COALESCE(t.warnings,'[]'::jsonb) AS warnings FROM jsonb_to_recordset(CAST(? AS jsonb)) AS d(id text,title text,version text,key text,inline text) LEFT JOIN document_text t ON t.org_id=? AND t.version_id=d.key), matches AS (SELECT *,strpos(lower(content),?) AS pos FROM records WHERE strpos(lower(title),?)>0 OR strpos(lower(content),?)>0)`;
 const args=[requested,state.organization.id,q,q,q];
 const [rows,counts]=await env.DB.batch([
  env.DB.prepare(cte+' SELECT id,title,version AS "versionId",CASE WHEN pos>0 THEN substring(content FROM greatest(1,pos-60) FOR 240) ELSE \'\' END AS snippet,indexed,warnings FROM matches ORDER BY title,id LIMIT 50 OFFSET ?').bind(...args,offset),
  env.DB.prepare(cte+' SELECT (SELECT count(*)::integer FROM matches) AS total,(SELECT count(*)::integer FROM records WHERE NOT indexed) AS unindexed').bind(...args),
 ]);
 return {items:rows.results,...counts.results[0]};
}
