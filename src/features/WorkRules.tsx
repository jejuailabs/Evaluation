import type {Task,Workspace} from '../domain/types';
import {Field} from '../ui/shared';
export function TaskLinks({s,projectId,task}:{s:Workspace;projectId:string;task?:Task}){
 const options=s.tasks.filter(t=>t.projectId===projectId&&t.id!==task?.id&&!t.cancelled);
 return <><Field label="상위 업무"><select name="parentId" defaultValue={task?.parentId??''}><option value="">독립 업무</option>{options.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></Field><Field label="먼저 끝나야 하는 업무"><select name="dependencyIds" multiple defaultValue={task?.dependencyIds??[]} size={Math.min(6,Math.max(2,options.length))}>{options.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></Field><p className="form-hint">선행 업무와 하위 업무를 모두 완료해야 이 업무를 완료할 수 있어요. Ctrl/⌘ 키로 여러 항목을 선택해요.</p></>;
}
