import { defineConfig, loadEnv } from 'vite';
import vinext from 'vinext';
import { nitro } from 'nitro/vite';

export default defineConfig(({ mode }) => {
  // Only the server process reads secrets. Never define client-visible secret replacements.
  const local = loadEnv(mode, process.cwd(), '');
  for (const key of ['DATABASE_URL','APP_URL','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_STORAGE_BUCKET','PLATFORM_ADMIN_USER_IDS','OPENAI_API_KEY','OPENAI_MODEL']) {
    if (process.env[key] === undefined && local[key] !== undefined) process.env[key] = local[key];
  }
  return { plugins: [vinext(), nitro({ preset: process.env.NITRO_PRESET || (process.env.VERCEL ? 'vercel' : 'node-server'), vercel: { functions: { maxDuration: 120, regions: ['icn1'] } } })],
    server: { host: '127.0.0.1', port: 5173 } };
});
