import { env } from 'cloudflare:workers';
import { createAuthContext, type AuthEnv } from '../../../server/auth';
export const dynamic = 'force-dynamic';
const handle = (request: Request) => createAuthContext(request, env as AuthEnv).handle();
export const GET = handle;
export const POST = handle;
