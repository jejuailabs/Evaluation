import type {Workspace} from '../domain/types';
import {collectionKeys,type Collection} from '../domain/workspace-collections';
export async function hydrateWorkspacePages<T extends {workspace:Workspace;workspacePages?:Collection[]}>(
 payload:T,load:(key:Collection,offset:number)=>Promise<{items:unknown[];revision:number;nextOffset:number|null}>
):Promise<T>{
 if(!payload.workspacePages)return payload;
 const workspace=structuredClone(payload.workspace),keys=[...payload.workspacePages];
 if(new Set(keys).size!==keys.length||keys.some(k=>!collectionKeys.includes(k)))throw new Error('자료 목록 형식을 확인하지 못했어요.');
 // Bounded parallelism; publish nothing until every page has the same organization revision.
 async function worker(){for(;;){const key=keys.shift();if(!key)return;const items:unknown[]=[];let offset=0;
  for(;;){const page=await load(key,offset);if(page.revision!==workspace.revision)throw Object.assign(new Error('조회 중 자료가 바뀌었어요.'),{status:409});
   items.push(...page.items);if(items.length>1_000_000)throw new Error('조회 가능한 자료 수를 넘었어요.');
   if(page.nextOffset===null)break;if(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset)throw new Error('자료를 이어서 불러오지 못했어요.');offset=page.nextOffset;
  }
  (workspace[key] as unknown[])=items;
 }}
 await Promise.all(Array.from({length:Math.min(3,keys.length)},()=>worker()));
 const result={...payload,workspace};delete result.workspacePages;return result;
}
