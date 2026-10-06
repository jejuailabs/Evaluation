import type {Command,Workspace} from './types';
export function commandScope(c:Command){
 if(c.type.startsWith('annual.')||c.type.startsWith('organization.')||c.type.startsWith('report.')||c.type==='document.reference'||c.type.startsWith('intake.'))return '';
 if('projectId' in c)return c.projectId;
 for(const key of ['task','project','document','expense','indicator','measurement','activity','line','series'] as const)if(key in c){const row=(c as any)[key];return key==='project'?row.id:row.projectId;}return '';
}
function canonical(value:unknown):unknown {if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return value;}
export async function commandBase(s:Workspace,c:Command){
 const pid=commandScope(c);if(!pid||c.type==='project.add')return undefined;
 const related={organization:s.organization,projects:s.projects.filter(p=>p.id===pid),...Object.fromEntries(['tasks','documents','expenses','indicators','measurements','reports','activities','budgetLines','taskSeries'].map(key=>[key,((s as any)[key]??[]).filter((x:any)=>x.projectId===pid).sort((a:any,b:any)=>a.id.localeCompare(b.id))]))};
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(related))));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
