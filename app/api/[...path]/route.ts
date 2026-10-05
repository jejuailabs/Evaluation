import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handleApi, type Services } from '../../../server/api';
export const dynamic='force-dynamic';
async function handle(request:Request){
 if(!env.DB)return Response.json({error:'서버 저장소를 준비 중이에요.'},{status:503,headers:{'Cache-Control':'no-store'}});
 return handleApi(request,env as Services,await getChatGPTUser());
}
export const GET=handle;export const POST=handle;export const DELETE=handle;
