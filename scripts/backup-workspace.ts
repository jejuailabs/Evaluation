import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {getRuntime} from '../server/runtime';
import {postgresFixture} from '../tests/postgres-fixture';
const directory=resolve('.sites-runtime/backups'),keyPath=resolve(directory,'backup.key');mkdirSync(directory,{recursive:true});
const key=existsSync(keyPath)?readFileSync(keyPath):randomBytes(32);if(!existsSync(keyPath))writeFileSync(keyPath,key,{mode:0o600});
const mode=process.argv[2]??'create';
if(mode==='create'){
 const env=getRuntime();if(!env.DB||!env.BUCKET)throw new Error('Application database and storage required');
 const columns=(await env.DB.prepare("SELECT c.table_name,c.column_name,c.data_type,c.udt_name FROM information_schema.columns c WHERE c.table_schema='value_lens' AND c.table_name<>'_migrations' AND EXISTS(SELECT 1 FROM information_schema.tables t WHERE t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE') ORDER BY c.table_name,c.ordinal_position").all<any>()).results;
 const tables=[...new Set(columns.map(c=>c.table_name as string))];if(tables.some(t=>!/^[_a-z0-9]+$/.test(t)))throw new Error('Unexpected table name');
 const rows=await env.DB.batch(tables.map(t=>env.DB!.prepare(`SELECT * FROM "${t}"`)));
 const dependencies=(await env.DB.prepare("SELECT a.relname AS child,b.relname AS parent FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class a ON a.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=a.relnamespace JOIN pg_catalog.pg_class b ON b.oid=c.confrelid WHERE n.nspname='value_lens' AND c.contype='f'").all<{child:string;parent:string}>()).results;
 const entries=Object.fromEntries(tables.map((t,i)=>[t,rows[i].results])),objects:Record<string,string>={};
 for(const f of entries.files??[]){const path=`${f.org_id}/${f.id}`,o=await env.BUCKET.get(path);if(!o)throw new Error('Registered original missing; backup incomplete');objects[path]=Buffer.from(await new Response(o.body).arrayBuffer()).toString('base64');}
 const plain=Buffer.from(JSON.stringify({format:1,createdAt:new Date().toISOString(),columns,dependencies,tables:entries,objects})),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]),path=resolve(directory,`value-lens-${Date.now()}.backup`);writeFileSync(path,Buffer.concat([Buffer.from('VLB1'),iv,cipher.getAuthTag(),encrypted]),{mode:0o600});
 console.log(JSON.stringify({path,tables:tables.length,rows:rows.reduce((n,r)=>n+r.results.length,0),files:Object.keys(objects).length,encrypted:true,sha256:createHash('sha256').update(plain).digest('hex')}));
}else if(mode==='verify'){
 const path=resolve(process.argv[3]??'');if(!path.startsWith(directory+'/')&&!path.startsWith(directory+'\\'))throw new Error('Verify a backup inside the backup directory');
 const data=readFileSync(path);if(data.subarray(0,4).toString()!=='VLB1')throw new Error('Invalid backup');const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(4,16));decipher.setAuthTag(data.subarray(16,32));const snapshot=JSON.parse(Buffer.concat([decipher.update(data.subarray(32)),decipher.final()]).toString());
 if(snapshot.format!==1)throw new Error('Unsupported backup');const fixture=await postgresFixture();
 try{
  const pending=new Set<string>(Object.keys(snapshot.tables)),restored=new Set<string>();let count=0;
  while(pending.size){const ready=[...pending].filter(t=>snapshot.dependencies.filter((d:any)=>d.child===t&&d.parent!==t&&pending.has(d.parent)).length===0);if(!ready.length)throw new Error('Cyclic dependency');
   for(const table of ready){if(!/^[_a-z0-9]+$/.test(table))throw new Error('Invalid table');const cols=snapshot.columns.filter((c:any)=>c.table_name===table);
    for(const row of snapshot.tables[table]){const names=cols.map((c:any)=>c.column_name);if(names.some((n:string)=>!/^[_a-z0-9]+$/.test(n)))throw new Error('Invalid column');const values=cols.map((c:any)=>['json','jsonb'].includes(c.data_type)&&row[c.column_name]!==null?JSON.stringify(row[c.column_name]):row[c.column_name]);await fixture.pg.query(`INSERT INTO value_lens."${table}" (${names.map((n:string)=>'"'+n+'"').join(',')}) OVERRIDING SYSTEM VALUE VALUES (${values.map((_:unknown,i:number)=>'$'+(i+1)).join(',')})`,values);count++;}
    const actual=await fixture.pg.query<{n:number}>(`SELECT COUNT(*)::integer AS n FROM value_lens."${table}"`);if(actual.rows[0].n!==snapshot.tables[table].length)throw new Error('Restore count mismatch');pending.delete(table);restored.add(table);
   }
  }
  for(const f of snapshot.tables.files??[]){const key=`${f.org_id}/${f.id}`,bytes=Buffer.from(snapshot.objects[key]??'','base64');if(bytes.length!==f.size)throw new Error('Original bytes mismatch');const scan=snapshot.tables.file_checks?.find((c:any)=>c.file_id===f.id);if(scan&&createHash('sha256').update(bytes).digest('hex')!==scan.sha256)throw new Error('Original digest mismatch');}
  console.log(JSON.stringify({restoredTables:restored.size,restoredRows:count,verifiedFiles:Object.keys(snapshot.objects).length,productionModified:false}));
 }finally{await fixture.close();}
}else throw new Error('Use create or verify');
