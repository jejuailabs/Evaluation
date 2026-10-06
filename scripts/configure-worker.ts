import {getRuntime} from '../server/runtime';
const env=getRuntime();
if(!env.DB||!env.WORKER_SECRET)throw new Error('Database and WORKER_SECRET required');
await env.DB.prepare('SELECT value_lens.configure_worker(?)').bind(env.WORKER_SECRET).run();
console.log(JSON.stringify({scheduled:true,secretExposed:false}));
process.exit(0);
