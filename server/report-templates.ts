import {z} from 'zod';
import {hwpxTextFields,type TemplateMapping} from '../src/infrastructure/report-hwpx';
import type {Services} from './api';
import {type Actor,HttpError,requireManager} from './policy';
export async function reportTemplates(env:Services,orgId:string,actor:Actor,method:string,raw:unknown){
 requireManager(actor);
 if(method==='GET')return {templates:(await env.DB.prepare('SELECT * FROM report_templates WHERE org_id=? ORDER BY name,version DESC LIMIT 200').bind(orgId).all()).results};
 const data=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(100),fileId:z.string().uuid(),mapping:z.record(z.enum(['title','period','purpose','note','reportId','metrics','budget']))}).strict().parse(raw);
 const f=await env.DB.prepare('SELECT id,name FROM files WHERE id=? AND org_id=? AND uploader_id=?').bind(data.fileId,orgId,actor.userId).first<{id:string;name:string}>();
 if(!f||!f.name.toLowerCase().endsWith('.hwpx'))throw new HttpError(400,'본인이 업로드한 HWPX 양식을 선택해 주세요.');
 const o=await env.BUCKET?.get(`${orgId}/${f.id}`);if(!o)throw new HttpError(404,'양식 원본이 없어요.');
 const keys=new Set(hwpxTextFields(new Uint8Array(await new Response(o.body).arrayBuffer())).map(x=>x.key));
 if(!Object.keys(data.mapping).length||Object.keys(data.mapping).some(k=>!keys.has(k)))throw new HttpError(400,'양식에 존재하는 항목을 연결해 주세요.');
 const old=await env.DB.prepare('SELECT id,version,org_id,created_by,name,file_id,mapping FROM report_templates WHERE id=?').bind(data.id).first<any>();
 if(old){if(old.org_id===orgId&&old.created_by===actor.userId&&old.file_id===f.id&&old.name===data.name&&JSON.stringify(old.mapping)===JSON.stringify(data.mapping))return {id:old.id,version:old.version};throw new HttpError(409,'같은 요청 번호의 내용이 달라요.');}
 const saved=await env.DB.prepare("INSERT INTO report_templates(id,org_id,name,version,file_id,mapping,created_by,created_at) SELECT ?,?,?,(SELECT COALESCE(MAX(version),0)+1 FROM report_templates WHERE org_id=? AND name=?),?,CAST(? AS jsonb),?,? WHERE EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.org_id WHERE m.org_id=? AND m.user_id=? AND m.active=1 AND m.role IN ('owner','admin') AND o.status='active') RETURNING id,version").bind(data.id,orgId,data.name,orgId,data.name,f.id,JSON.stringify(data.mapping as TemplateMapping),actor.userId,new Date().toISOString(),orgId,actor.userId).first();if(!saved)throw new HttpError(403,'조직 관리 권한이 변경됐어요.');return saved;
}
