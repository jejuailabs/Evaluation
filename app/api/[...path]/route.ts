import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handleApi, type Services } from '../../../server/api';
import { authStatus, createAuthContext, type AuthEnv } from '../../../server/auth';
export const dynamic='force-dynamic';
async function handle(request:Request){
 if(!env.DB)return Response.json({error:'서버 저장소를 준비 중이에요.'},{status:503,headers:{'Cache-Control':'no-store'}});
 const config=env as Services & AuthEnv;
 const auth=createAuthContext(request,config);
 const identity=config.AUTH_PROVIDER==='supabase'?await auth.identity():await getChatGPTUser();
 const response=await handleApi(request,config,identity);
 if(new URL(request.url).pathname==='/api/session'&&response.ok){
  const data=await response.json() as Record<string,unknown>;
  return auth.finish(Response.json({...data,auth:authStatus(config)}));
 }
 return auth.finish(response);
}
export const GET=handle;export const POST=handle;export const DELETE=handle;
