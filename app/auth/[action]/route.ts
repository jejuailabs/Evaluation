import { getRuntime } from '../../../server/runtime';
import { createAuthContext, type AuthEnv } from '../../../server/auth';
export const dynamic = 'force-dynamic';
const handle = (request: Request) => createAuthContext(request, getRuntime()).handle();
export const GET = handle;
export const POST = handle;
