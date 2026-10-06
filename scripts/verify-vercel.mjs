import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { parseEnv } from 'node:util';

// This smoke test deliberately uses an unconfigured runtime. No real user data or external API call.
for (const key of ['DATABASE_URL','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','APP_URL','PLATFORM_ADMIN_USER_IDS','OPENAI_API_KEY','OPENAI_MODEL']) delete process.env[key];
const root = new URL('../.vercel/output/', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path,root),'utf8'));
const config=read('config.json'),fn=read('functions/__server.func/.vc-config.json');
assert.equal(config.version,3);assert.equal(fn.runtime,'nodejs22.x');assert.ok(fn.maxDuration>=60);
assert.ok(config.routes.some(r=>r.dest==='/__server'));
const {default:handler}=await import(new URL('functions/__server.func/index.mjs',root).href);
const landingPage=await handler.fetch(new Request('https://evaluation.example/'));
assert.equal(landingPage.status,200);const landingHtml=await landingPage.text();
assert.ok(landingHtml.includes('문서를 넣으면,'));assert.ok(landingHtml.includes('우리 조직의 가치'));
assert.ok(landingHtml.includes('/app?mode=demo#/home'));assert.ok(landingHtml.includes('/app?mode=start#/start'));
assert.ok(!landingHtml.includes('chatgpt.site'));
const landingAssets=[...landingHtml.matchAll(/(?:src|href)="(\/landing\/[^"?#]+)"/g)].map(m=>m[1]);
assert.ok(landingAssets.length>=10);
for(const path of landingAssets)assert.ok(statSync(new URL('static'+path,root)).isFile());
const legacy=await handler.fetch(new Request('https://evaluation.example/?mode=demo'));
assert.equal(legacy.status,307);assert.equal(legacy.headers.get('location'),'/app?mode=demo');
const page=await handler.fetch(new Request('https://evaluation.example/app?mode=demo'));
assert.equal(page.status,200);const html=await page.text();assert.ok(html.includes('가치 돋보기'));
const assets=[...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+)"/g)].map(m=>m[1]);assert.ok(assets.length>0);
for(const path of assets)assert.ok(statSync(new URL('static'+path,root)).isFile());
const response=await handler.fetch(new Request('https://evaluation.example/api/session',{headers:{'x-openai-user-id':'spoofed','x-openai-user-email':'owner@example.com'}}));
assert.equal(response.status,200);const session=await response.json();assert.equal(session.user,null);assert.equal(session.platformAdmin,false);assert.equal(session.auth.provider,'google');assert.equal(session.auth.ready,false);
const login=await handler.fetch(new Request('https://evaluation.example/auth/google'));
assert.equal(login.status,303);assert.ok(login.headers.get('location').includes('auth_error=configuration'));
let local={};try{local=parseEnv(readFileSync(new URL('../.env.local',import.meta.url),'utf8'));}catch{}
const secrets=Object.entries(local).filter(([key,value])=>/SECRET|API_KEY|DATABASE_URL/.test(key)&&value.length>15).map(([,value])=>value);
let bytes=0,files=0;const seen=new Set();
function inspect(path){const real=realpathSync(path);if(seen.has(real))return;seen.add(real);const st=statSync(path);if(st.isDirectory()){for(const child of readdirSync(path))inspect(new URL(child+(statSync(new URL(child,path)).isDirectory()?'/':''),path));return;}bytes+=st.size;files++;if(secrets.length&&/\.(?:m?js|cjs|json|html|css|map)$/.test(path.pathname)){const content=readFileSync(path,'utf8');assert.ok(!secrets.some(secret=>content.includes(secret)),'A local secret was embedded in the build');}}
inspect(new URL('functions/__server.func/',root));assert.ok(bytes<250*1024*1024,'Function exceeds Vercel uncompressed limit');
inspect(new URL('static/',root));
console.log(JSON.stringify({vercelOutput:true,runtime:fn.runtime,rootStatus:200,rootIsLanding:true,workspaceStatus:200,legacyRedirectStatus:307,sessionStatus:200,googleRouteStatus:303,assetsVerified:assets.length+landingAssets.length,filesInspected:files,localSecretsEmbedded:false}));
