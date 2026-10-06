import {audioLimit,audioMime,transcriptLimit} from '../src/domain/meeting';
import type {AIEnv} from './planning-ai';
import {HttpError} from './policy';

export const transcriptionModel='gpt-4o-mini-transcribe';
export const transcriptionReady=(env:AIEnv)=>!!env.OPENAI_API_KEY?.trim();
export function validateAudio(name:string,bytes:Uint8Array){
 const mime=audioMime(name),b=Buffer.from(bytes),ext=name.split('.').at(-1)?.toLowerCase();
 if(!mime)throw new HttpError(400,'MP3·M4A·MP4·WAV·WEBM·OGG·FLAC 음성 파일을 선택해 주세요.');
 if(!b.length||b.length>audioLimit)throw new HttpError(413,'음성 전사는 25MB(25,000,000바이트)까지 가능해요. 긴 녹음은 나누어 올려 주세요.');
 const ascii=(start:number,end:number)=>b.subarray(start,end).toString('ascii');
 const matches=ext==='wav'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE'
  :ext==='webm'?b.subarray(0,4).toString('hex')==='1a45dfa3'
  :ext==='ogg'?ascii(0,4)==='OggS':ext==='flac'?ascii(0,4)==='fLaC'
  :['mp4','m4a'].includes(ext??'')?ascii(4,8)==='ftyp'
  :ascii(0,3)==='ID3'||(b[0]===255&&(b[1]&224)===224)||b.subarray(0,4).toString('hex')==='000001ba';
 if(!matches)throw new HttpError(400,'파일 내용과 음성 확장자가 맞지 않아요. 원본 형식을 확인해 주세요.');
 return mime;
}
export async function transcribeAudio(env:AIEnv,name:string,bytes:Uint8Array,request:typeof fetch=fetch,background=false){
 if(!transcriptionReady(env))throw new HttpError(503,'음성 전사 서비스가 연결되지 않았어요. 직접 회의 기록을 작성할 수 있어요.');
 const mime=validateAudio(name,bytes),form=new FormData();
 form.append('file',new Blob([new Uint8Array(bytes)],{type:mime}),name);
 form.append('model',transcriptionModel);form.append('language','ko');form.append('response_format','json');
 try{
  const response=await request('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form,signal:AbortSignal.timeout(background?90000:45000)});
  if(!response.ok)throw new HttpError(response.status===429?429:502,response.status===429?'음성 서비스가 붐비고 있어요. 잠시 후 다시 시도해 주세요.':'음성을 읽지 못했어요. 원본을 재생해 확인하고 다시 시도해 주세요.');
  const data=await response.json() as {text?:unknown};
  if(typeof data.text!=='string'||!data.text.trim())throw new HttpError(422,'음성에서 문장을 찾지 못했어요. 소리가 있는 원본인지 확인해 주세요.');
  if(data.text.length>(background?120000:transcriptLimit))throw new HttpError(413,background?'전사문이 120,000자를 넘어요. 녹음을 나누어 주세요.':'전사문이 30,000자를 넘어요. 사무 도구에서 긴 녹음 처리를 요청해 주세요.');
  return {text:data.text.trim(),model:transcriptionModel};
 }catch(e){if(e instanceof HttpError)throw e;throw new HttpError(504,'전사가 제시간에 끝나지 않았어요. 원본은 보관돼 있어요. 잠시 후 다시 시도하거나 짧게 나누어 주세요.');}
}
