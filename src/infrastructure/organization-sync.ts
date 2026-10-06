import type {OrganizationChanges} from '../domain/collaboration';
export type SyncStatus='connected'|'pending'|'offline';
// The server pulse contains counters only; download the workspace only after a revision changes.
export function createOrganizationSync<T extends {workspace:{revision:number}}>(options:{
  pulse:(signal:AbortSignal)=>Promise<OrganizationChanges>;load:(signal:AbortSignal)=>Promise<T>;
  current:()=>number;blocked:()=>boolean;available:()=>boolean;apply:(value:T)=>void;
  status:(status:SyncStatus)=>void;counts:(value:OrganizationChanges)=>void;revoked:()=>void;
}){
 let running=false,stopped=false;const controller=new AbortController();
 return {stop(){stopped=true;controller.abort();},async tick(){
  if(stopped||running||!options.available())return;running=true;
  try{
   const pulse=await options.pulse(controller.signal);if(stopped)return;options.counts(pulse);
   if(pulse.revision>options.current()){
    if(options.blocked()){options.status('pending');return;}
    const result=await options.load(controller.signal);if(stopped)return;
    if(options.blocked()){options.status('pending');return;}
    // A mutation may have completed while the refresh was in flight. Never roll it back.
    if(result.workspace.revision>=options.current())options.apply(result);
   }
   options.status('connected');
  }catch(error){if(stopped)return;if([401,403].includes(Number((error as {status?:number}).status))){stopped=true;options.revoked();}else options.status('offline');}
  finally{running=false;}
 }};
}
