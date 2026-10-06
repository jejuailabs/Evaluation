import {Pool} from 'pg';
import {databaseConnectionOptions} from '../server/postgres-connection.mjs';

// For an application rollback only. Preserve CURRENT rows, never restore the old checkpoint.
const args=process.argv.slice(2),orgIndex=args.indexOf('--org'),orgId=args[orgIndex+1];
if(orgIndex<0||!orgId||orgId.startsWith('--')||args.some((x,i)=>i!==orgIndex+1&&!['--org','--apply'].includes(x))){
  console.error('Usage: npm run db:workspace-compat -- --org <organization-id> [--apply]');process.exit(1);
}
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url)throw new Error('Database configuration is required.');
const pool=new Pool({...databaseConnectionOptions(url),max:1,connectionTimeoutMillis:10000});let client;
try{
  client=await pool.connect();await client.query('BEGIN');
  await client.query('SET LOCAL ROLE value_lens_app');await client.query('SET LOCAL search_path TO value_lens, pg_catalog');
  const row=(await client.query('SELECT id,revision,storage_version FROM organizations WHERE id=$1 FOR UPDATE',[orgId])).rows[0];
  if(!row)throw new Error('Unknown organization');
  const current=(await client.query('SELECT read_workspace($1) AS body',[orgId])).rows[0].body;
  const summary={organizationId:orgId,storageVersion:row.storage_version,revision:row.revision,currentBytes:Buffer.byteLength(current),legacyCompatible:Buffer.byteLength(current)<=1048576,applied:false};
  if(args.includes('--apply')&&!summary.legacyCompatible){console.error('The previous application supports only 1MiB per organization. Conversion was not applied; deploy a forward fix instead.');process.exitCode=1;}
  else if(args.includes('--apply')&&row.storage_version===2){
    const body=JSON.stringify({...JSON.parse(current),revision:Number(row.revision)+1});
    await client.query('UPDATE organizations SET body=$1,storage_version=1,revision=revision+1 WHERE id=$2',[body,orgId]);summary.applied=true;
  }
  await client.query('COMMIT');console.log(JSON.stringify(summary));
}catch{
  await client?.query('ROLLBACK').catch(()=>{});console.error('Compatibility conversion failed; no partial change was committed.');process.exitCode=1;
}finally{client?.release();await pool.end();}
