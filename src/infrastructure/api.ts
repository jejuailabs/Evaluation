import {hydrateWorkspacePages} from './workspace-pages';
import type { Command, DocumentVersion, Workspace } from '../domain/types';
import type { Actor } from '../../server/policy';
export type Session={user:{userId:string;email:string;displayName:string}|null;organizations:{id:string;name:string;role:string;status:string}[];platformAdmin:boolean;workspaceReady?:boolean;auth?:{provider:'google'|'chatgpt';ready:boolean;emailReady?:boolean;googleReady?:boolean;status?:'unconfigured'|'available'|'unavailable'}};
export type CloudWorkspace={workspace:Workspace;access:Actor};
export class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
export async function api<T=any>(path:string,data?:unknown,method=data===undefined?'GET':'POST',options:{signal?:AbortSignal;timeoutMs?:number;hydrationRetry?:boolean}={}):Promise<T>{
 const controller=new AbortController();let timedOut=false;
 const timeout=options.timeoutMs??(method==='GET'?15000:0);
 const timer=timeout>0?setTimeout(()=>{timedOut=true;controller.abort();},timeout):undefined;
 const cancel=()=>controller.abort();
 options.signal?.addEventListener('abort',cancel,{once:true});
 if(options.signal?.aborted)controller.abort();
 try{
  const response=await fetch(`/api/${path}`,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','X-Value-Lens':'1'},body:data===undefined?undefined:JSON.stringify(data)});
  const result:any=await response.json();if(!response.ok)throw new ApiError(response.status,result.error??'요청을 처리하지 못했어요.');clearTimeout(timer);
  const carrier=result.initialWorkspace??result;
  if(carrier?.workspacePages){
   const orgId=carrier.workspace.organization.id;
   try{const hydrated=await hydrateWorkspacePages(carrier,(key,offset)=>api(`organizations/${encodeURIComponent(orgId)}/workspace/page?collection=${key}&revision=${carrier.workspace.revision}&offset=${offset}`,undefined,'GET',{signal:options.signal}));if(result.initialWorkspace)result.initialWorkspace=hydrated;else return hydrated as T;}
   catch(error){if((error as {status?:number}).status===409&&!options.hydrationRetry){const fresh=await api<CloudWorkspace>(`organizations/${encodeURIComponent(orgId)}/workspace`,undefined,'GET',{signal:options.signal,hydrationRetry:true});if(result.initialWorkspace)result.initialWorkspace=fresh;else return fresh as T;}else throw error;}
  }
  return result;
 }catch(error){
  if(timedOut)throw new ApiError(408,'응답이 늦어지고 있어요. 잠시 후 다시 불러와 주세요.');
  throw error;
 }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}
export const loadCloud=(orgId:string)=>api<CloudWorkspace>(`organizations/${encodeURIComponent(orgId)}/workspace`);
export const sendCommand=(orgId:string,command:Command,revision:number,id:string)=>api<CloudWorkspace>(`organizations/${encodeURIComponent(orgId)}/commands`,{id,revision,command});
export async function uploadCloud(orgId:string,projectId:string,file:File):Promise<DocumentVersion>{
 if(!file.size||file.size>25*1024*1024)throw new Error('비어 있지 않은 25MB 이내 파일을 선택해 주세요.');
 const path=`organizations/${encodeURIComponent(orgId)}/files`;
 const prepared=await api<{id:string;uploadUrl:string}>(`${path}/prepare`,{projectId,name:file.name,size:file.size});
 const form=new FormData();form.append('cacheControl','0');form.append('',file);
 const response=await fetch(prepared.uploadUrl,{method:'PUT',credentials:'omit',headers:{'x-upsert':'false'},body:form});
 if(!response.ok)throw new ApiError(response.status,'원본 업로드를 완료하지 못했어요. 파일을 다시 선택해 주세요.');
 return api<DocumentVersion>(`${path}/complete`,{id:prepared.id});
}
export async function readCloud(orgId:string,version:DocumentVersion):Promise<Blob>{
 if(version.inlineText!==undefined)return new Blob([version.inlineText],{type:'text/plain;charset=utf-8'});
 const signed=await api<{url:string}>(`organizations/${encodeURIComponent(orgId)}/files/${encodeURIComponent(version.id)}/url`);
 const response=await fetch(signed.url,{credentials:'omit',cache:'no-store'});
 if(!response.ok)throw new ApiError(response.status,'원본을 받지 못했어요. 다시 시도해 주세요.');
 return response.blob();
}
