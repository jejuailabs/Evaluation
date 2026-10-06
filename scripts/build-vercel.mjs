// Pin the target even when the build is run outside Vercel CI.
import { fileURLToPath } from 'node:url';
process.env.NITRO_PRESET = 'vercel';
process.argv = [process.execPath, fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), 'build'];
await import('../node_modules/vite/bin/vite.js');
