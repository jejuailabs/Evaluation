import { getRuntime } from '../../../server/runtime';
import { handleApi, type Services } from '../../../server/api';
import { authStatus, createAuthContext, type AuthEnv } from '../../../server/auth';
export const dynamic='force-dynamic';
async function handle(request:Request){
 const config=getRuntime();
 const auth=createAuthContext(request,config);
 const identity=await auth.identity();
 if(!config.DB){
  const session=new URL(request.url).pathname==='/api/session'&&request.method==='GET';
  return auth.finish(Response.json(session?{user:null,organizations:[],platformAdmin:false,auth:authStatus(config),storageReady:false}:{error:'데이터베이스 연결 설정이 필요해요.'},{status:session?200:503,headers:{'Cache-Control':'no-store'}}));
 }
 const response=await handleApi(request,config as Services,identity);
 if(new URL(request.url).pathname==='/api/session'&&response.ok){
  const data=await response.json() as Record<string,unknown>;
  return auth.finish(Response.json({...data,auth:authStatus(config)}));
 }
 return auth.finish(response);
}
export const GET=handle;export const POST=handle;export const DELETE=handle;
