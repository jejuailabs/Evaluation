import {useEffect,useRef,useState} from 'react';
import type {DocumentVersion} from '../domain/types';
import {audioLimit} from '../domain/meeting';
import {uid} from '../domain/selectors';
import {saveFile,download} from '../infrastructure/storage';
import {type Context,Field,Form,Modal,textValue} from '../ui/shared';

export function MeetingRecorder(ctx:Context&{close:()=>void}){
 const [phase,setPhase]=useState<'idle'|'requesting'|'recording'|'ready'>('idle'),[file,setFile]=useState<File|null>(null),[seconds,setSeconds]=useState(0),[consent,setConsent]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[url,setUrl]=useState('');
 const media=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),alive=useRef(true),version=useRef<DocumentVersion|undefined>(undefined),id=useRef(uid());
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(media.current?.state==='recording')media.current.stop();stream.current?.getTracks().forEach(t=>t.stop());};},[]);
 useEffect(()=>{if(!file)return;const u=URL.createObjectURL(file);setUrl(u);return()=>URL.revokeObjectURL(u);},[file]);
 useEffect(()=>{if(phase!=='recording')return;const timer=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(timer);},[phase]);
 useEffect(()=>{if(seconds>=600&&media.current?.state==='recording')media.current.stop();},[seconds]);
 useEffect(()=>{if(phase==='idle')return;const block=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',block);return()=>window.removeEventListener('beforeunload',block);},[phase]);
 async function start(){
  setError('');setPhase('requesting');
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('이 브라우저에서는 직접 녹음할 수 없어요. 휴대폰 녹음 파일을 파일 모으기로 올려 주세요.');
   const mic=await navigator.mediaDevices.getUserMedia({audio:true});if(!alive.current){mic.getTracks().forEach(t=>t.stop());return;}stream.current=mic;
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
   if(!mime)throw new Error('지원하는 녹음 형식이 없어요. 휴대폰 녹음 파일을 올려 주세요.');
   const recorder=new MediaRecorder(mic,{mimeType:mime,audioBitsPerSecond:64000}),chunks:Blob[]=[];let size=0;
   recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);size+=e.data.size;if(size>=audioLimit-65536&&recorder.state==='recording')recorder.stop();}};
   recorder.onstop=()=>{mic.getTracks().forEach(t=>t.stop());if(!alive.current)return;const ext=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm';const result=new File(chunks,`회의 녹음 ${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`,{type:mime});if(!result.size){setError('녹음된 소리가 없어요. 다시 시작해 주세요.');setPhase('idle');return;}setFile(result);setPhase('ready');};
   recorder.onerror=()=>{if(alive.current)setError('녹음이 중단됐어요. 남은 원본을 재생하고 저장해 주세요.');if(recorder.state!=='inactive')recorder.stop();mic.getTracks().forEach(t=>t.stop());};
   media.current=recorder;recorder.start(1000);setSeconds(0);setPhase('recording');
  }catch(e){stream.current?.getTracks().forEach(t=>t.stop());if(alive.current){setError((e as Error).name==='NotAllowedError'?'마이크 사용이 허용되지 않았어요. 브라우저 권한을 확인하거나 녹음 파일을 올려 주세요.':(e as Error).message);setPhase('idle');}}
 }
 function close(){if(busy||phase==='recording'||file){ctx.notify('녹음을 마치고 원본을 저장하거나 녹음 버리기를 눌러 주세요.');return;}ctx.close();}
 return <Modal title="회의 녹음" close={close} error={ctx.saveError}><p>10분씩 녹음해 자료함에 보관해요. 저장한 원본에서 전사와 회의 기록을 이어갈 수 있어요.</p>
  {phase==='idle'&&<><label className="check-row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>참석자에게 녹음을 알리고 동의를 받았어요.</label><button className="button primary" disabled={!consent} onClick={start}>녹음 시작</button></>}
  {phase==='requesting'&&<p role="status">브라우저에서 마이크로 녹음할 수 있도록 허용해 주세요.</p>}
  {phase==='recording'&&<div className="recording-status"><strong role="timer">● 녹음 중 {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</strong><button className="button primary" onClick={()=>media.current?.stop()}>녹음 마치기</button><p>10분이 되면 자동으로 마쳐요. 화면을 열어 두세요.</p></div>}
  {file&&<><audio className="meeting-audio" controls src={url}/><div className="actions"><button className="text-button" onClick={()=>download(file,file.name)}>녹음 내려받기</button><button className="text-button" disabled={busy||!!version.current} onClick={()=>{setFile(null);setPhase('idle');setError('');}}>녹음 버리기</button></div><Form label="녹음 원본 보관" submit={async f=>{
   setBusy(true);try{const fileId=version.current?.id??uid();version.current??=ctx.uploadInbox?await ctx.uploadInbox(file):(await saveFile(fileId,file),{id:fileId,blobKey:fileId,name:file.name,size:file.size,createdAt:new Date().toISOString()});
    if(await ctx.run({type:'intake.add',id:id.current,title:textValue(f,'title'),note:'회의 녹음',source:{kind:'file',version:version.current}}))ctx.close();
   }finally{setBusy(false);}
  }}><Field label="회의 이름"><input name="title" required maxLength={160} defaultValue="회의 녹음" disabled={busy}/></Field><p className="form-hint">보관 전에는 이 화면을 닫지 마세요. 저장에 실패하면 원본을 내려받거나 다시 보관할 수 있어요.</p></Form></>}
  {error&&<p className="form-error" role="alert">{error}</p>}
 </Modal>;
}
