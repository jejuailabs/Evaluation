import {createHash} from 'node:crypto';
import {Unzip,UnzipInflate} from 'fflate';
import {readServerDocument} from './document-content';
import {HttpError} from './policy';
import type {Database} from './database';

/** Structural inspection is performed before upload finalization; no document macros are executed. */
export function inspectFile(name:string,bytes:Uint8Array){
 const ext=name.split('.').at(-1)?.toLowerCase()??'',digest=createHash('sha256').update(bytes).digest('hex');
 const start=new TextDecoder('latin1').decode(bytes.subarray(0,1024));
 if(['exe','dll','com','bat','cmd','ps1','vbs','js','scr','msi','hta','docm','xlsm','pptm'].includes(ext)||start.startsWith('MZ')||start.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'))throw new HttpError(422,'실행 파일·매크로·검사에서 차단된 파일은 등록할 수 없어요.');
 if(['hwpx','docx','xlsx','pptx','odt','zip'].includes(ext)){
  let count=0,total=0,open=0,failure:Error|undefined;
  const unzip=new Unzip(file=>{
   if(++count>3000||file.name.split('/').includes('..')||file.name.startsWith('/')||/vbaProject\.bin$|\.exe$|\.dll$/i.test(file.name))throw new HttpError(422,'안전하게 읽을 수 없는 압축 문서예요.');
   open++;file.ondata=(error,data,final)=>{if(error){failure=error;return;}total+=data.length;if(total>60*1024*1024){failure=new Error('압축 해제 한도 초과');file.terminate();}if(final)open--;};file.start();
  });unzip.register(UnzipInflate);
  try{for(let at=0;at<bytes.length;at+=4096){unzip.push(bytes.subarray(at,at+4096),at+4096>=bytes.length);if(failure)throw failure;}if(open||!count)throw new Error('불완전한 압축');}catch{throw new HttpError(422,'손상되었거나 압축 해제 한도를 넘는 문서예요.');}
 }
 return {sha256:digest,details:{engine:'value-lens-structural-v1',executable:false,archiveChecked:['hwpx','docx','xlsx','pptx','odt','zip'].includes(ext)}};
}
export async function indexFile(db:Database,orgId:string,id:string,name:string,bytes:Uint8Array){
 const check=inspectFile(name,bytes),at=new Date().toISOString();
 let content='',warnings:string[]=[];
 try{const result=await readServerDocument(name,bytes);content=result.blocks.map(b=>b.text).join('\n');warnings=result.warnings;}catch{warnings=['본문을 읽지 못했어요. 원본 형식·암호·손상 여부를 확인해 주세요. 원본은 보관돼요.'];}
 await db.batch([
  db.prepare("INSERT INTO file_checks(file_id,org_id,sha256,status,details,checked_at) VALUES (?,?,?,'passed',CAST(? AS jsonb),?) ON CONFLICT(file_id) DO NOTHING").bind(id,orgId,check.sha256,JSON.stringify(check.details),at),
  db.prepare('INSERT INTO document_text(org_id,version_id,content,warnings,indexed_at) VALUES (?,?,?,CAST(? AS jsonb),?) ON CONFLICT(org_id,version_id) DO NOTHING').bind(orgId,id,content,JSON.stringify(warnings),at),
 ]);return check;
}
