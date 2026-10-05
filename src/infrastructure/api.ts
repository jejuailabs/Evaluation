import type { Command, DocumentVersion, Workspace } from '../domain/types';
import type { Actor } from '../../server/policy';
export type Session={user:{userId:string;email:string;displayName:string}|null;organizations:{id:string;name:string;role:string;status:string}[];platformAdmin:boolean};
export type CloudWorkspace={workspace:Workspace;access:Actor};
export class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
export async function api<T=any>(path:string,data?:unknown,method=data===undefined?'GET':'POST'):Promise<T>{
 const response=await fetch(`/api/${path}`,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Value-Lens':'1'},body:data===undefined?undefined:JSON.stringify(data)});
 const result:any=await response.json();if(!response.ok)throw new ApiError(response.status,result.error??'요청을 처리하지 못했어요.');return result;
}
export const loadCloud=(orgId:string)=>api<CloudWorkspace>(`organizations/${encodeURIComponent(orgId)}/workspace`);
export const sendCommand=(orgId:string,command:Command,revision:number,id:string)=>api<CloudWorkspace>(`organizations/${encodeURIComponent(orgId)}/commands`,{id,revision,command});
export async function uploadCloud(orgId:string,projectId:string,file:File):Promise<DocumentVersion>{
 if(!file.size||file.size>25*1024*1024)throw new Error('비어 있지 않은 25MB 이내 파일을 선택해 주세요.');
 const response=await fetch(`/api/organizations/${encodeURIComponent(orgId)}/files?project=${encodeURIComponent(projectId)}`,{method:'POST',credentials:'same-origin',headers:{'X-Value-Lens':'1','X-File-Name':encodeURIComponent(file.name),'Content-Type':'application/octet-stream'},body:file});
 const result:any=await response.json();if(!response.ok)throw new ApiError(response.status,result.error);return result;
}
export async function readCloud(orgId:string,version:DocumentVersion):Promise<Blob>{const response=await fetch(`/api/organizations/${encodeURIComponent(orgId)}/files/${encodeURIComponent(version.id)}`,{credentials:'same-origin',cache:'no-store'});if(!response.ok){const data:any=await response.json();throw new ApiError(response.status,data.error);}return response.blob();}
