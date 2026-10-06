import type {Database} from './database';
import {today} from '../src/domain/selectors';
export async function deadlineNotifications(db:Database,date=today()){
 const days=[3,1,0,-1].map(delta=>new Date(Date.parse(date+'T00:00:00Z')+delta*86400000).toISOString().slice(0,10));
 return db.prepare(`INSERT INTO notifications(id,org_id,project_id,recipient_id,event_id,kind,title,target_type,target_id,created_at)
 SELECT md5(t.org_id||t.id||?||m.id),t.org_id,t.project_id,m.id,'deadline:'||t.id||':'||?,'task.deadline',left((t.data->>'title')||' · 마감 '||(t.data->>'due'),240),'task',t.id,?
 FROM workspace_tasks t JOIN organizations o ON o.id=t.org_id AND o.status='active' JOIN memberships m ON m.org_id=t.org_id AND m.id=t.data->>'ownerId' AND m.active=1
 WHERE t.data->>'status'<>'done' AND t.data->'cancelled' IS NULL AND t.data->>'due'=ANY(CAST(? AS text[]))
 AND (m.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM project_members p WHERE p.org_id=t.org_id AND p.project_id=t.project_id AND p.member_id=m.id))
 ON CONFLICT(event_id,recipient_id,kind) DO NOTHING`).bind(date,date,new Date().toISOString(),days).run();
}
