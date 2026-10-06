import { getRuntime } from '../server/runtime';
const env = getRuntime();
if (!env.DB || !env.BUCKET) throw new Error('Database and Storage configuration required');
// Allow one additional hour after the signed upload expires; never remove registered originals.
const cutoff = new Date(Date.now()-3600000).toISOString();
try {
  const rows = (await env.DB.prepare('SELECT u.id,u.org_id FROM file_uploads u WHERE u.expires_at<? AND NOT EXISTS(SELECT 1 FROM files f WHERE f.id=u.id) LIMIT 100').bind(cutoff).all<{id:string;org_id:string}>()).results;
  let removed=0;
  for (const row of rows) {
    await env.BUCKET.delete(`${row.org_id}/${row.id}`);
    await env.DB.prepare('DELETE FROM file_uploads WHERE id=? AND org_id=? AND expires_at<?').bind(row.id,row.org_id,cutoff).run();removed++;
  }
  console.log(`Removed ${removed} expired unfinished uploads.`);
} catch { console.error('Upload cleanup failed. No registered original was selected.');process.exitCode=1; }
