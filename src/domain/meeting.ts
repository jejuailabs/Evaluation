export const audioLimit = 25_000_000;
export const transcriptLimit = 30_000;
export const transcriptionLeaseMs = 120_000;
export const audioAccept = '.mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,.ogg,.flac';
export function audioMime(name:string):string|undefined {
  const ext=name.split('.').at(-1)?.toLowerCase();
  return ({mp3:'audio/mpeg',mpeg:'audio/mpeg',mpga:'audio/mpeg',mp4:'audio/mp4',m4a:'audio/mp4',wav:'audio/wav',webm:'audio/webm',ogg:'audio/ogg',flac:'audio/flac'} as Record<string,string>)[ext??''];
}
export interface MeetingRecord {
  revision:number; method:'manual'|'ai'; originalText?:string; model?:string;
  text:string; notes:string; createdAt:string; updatedAt:string;
  reviewedAt?:string; reviewedById?:string;
}
export interface TranscriptionAttempt {id:string;status:'processing'|'failed'|'completed';startedAt:string;finishedAt?:string;error?:string}
export const transcriptionBusy=(attempt:TranscriptionAttempt|undefined,now=Date.now())=>attempt?.status==='processing'&&now-Date.parse(attempt.startedAt)<transcriptionLeaseMs;
