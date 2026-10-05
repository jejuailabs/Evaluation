import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import type { Identity } from './api';

export type AuthEnv = {
  AUTH_PROVIDER?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  APP_URL?: string;
};
const fallback = '/?mode=app#/organizations';
const returnCookie = 'vl-login-return';

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || value.length > 2000 || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://value-lens.invalid');
    if (url.origin !== 'https://value-lens.invalid' || url.pathname !== '/') return fallback;
    // Only return to the workspace, never loop through another auth endpoint.
    const params = new URLSearchParams({ mode: 'app' });
    const org = url.searchParams.get('org');
    if (org && /^[a-zA-Z0-9-]{1,100}$/.test(org)) params.set('org', org);
    const hash = /^#\/[a-zA-Z0-9/_-]*$/.test(url.hash) ? url.hash : '#/organizations';
    return `/?${params}${hash}`;
  } catch { return fallback; }
}

function configuration(env: AuthEnv) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.APP_URL) return null;
  try {
    const supabase = new URL(env.SUPABASE_URL), app = new URL(env.APP_URL);
    if (supabase.protocol !== 'https:' || supabase.username || supabase.password || supabase.pathname !== '/') return null;
    const local = ['localhost', '127.0.0.1'].includes(app.hostname);
    if ((!local && app.protocol !== 'https:') || !['http:', 'https:'].includes(app.protocol) || app.username || app.password || app.pathname !== '/' || app.search || app.hash) return null;
    // A service-role / secret key must never be used by the user-session client.
    if (!env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) return null;
    return { url: supabase.origin, key: env.SUPABASE_PUBLISHABLE_KEY, origin: app.origin, secure: app.protocol === 'https:' };
  } catch { return null; }
}

export function authStatus(env: AuthEnv) {
  return env.AUTH_PROVIDER === 'supabase'
    ? { provider: 'google' as const, ready: !!configuration(env) }
    : { provider: 'chatgpt' as const, ready: true };
}

export function identityFromUser(user: User | null): Identity | null {
  if (!user || user.is_anonymous || !user.email || !user.email_confirmed_at) return null;
  // Authorization comes from our membership records, never editable user_metadata.
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  return { userId: `supabase:${user.id}`, email: user.email.trim().toLowerCase(), displayName: typeof name === 'string' ? name.slice(0,120) : user.email };
}

export function createAuthContext(request: Request, env: AuthEnv, fetcher: typeof fetch = fetch) {
  const config = configuration(env);
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer' });
  const cookieMap = new Map(parseCookieHeader(request.headers.get('Cookie') ?? '').map(c => [c.name, c.value ?? '']));
  const cookieOptions = { httpOnly: true, secure: config?.secure ?? true, sameSite: 'lax' as const, path: '/' };
  const client = config ? createServerClient(config.url, config.key, {
    global: { fetch: fetcher },
    cookieOptions: { ...cookieOptions, name: config.secure ? '__Host-value-lens-auth' : 'value-lens-auth-local' },
    cookies: {
      getAll: () => Array.from(cookieMap, ([name,value]) => ({ name, value })),
      setAll(cookies, cacheHeaders) {
        for (const { name, value, options } of cookies) {
          cookieMap.set(name, value);
          headers.append('Set-Cookie', serializeCookieHeader(name, value, { ...options, ...cookieOptions }));
        }
        if (cacheHeaders) for (const [name,value] of Object.entries(cacheHeaders)) headers.set(name, value);
      },
    },
  }) : null;
  function finish(response: Response): Response {
    // Forward refreshed cookies on EVERY response, including API authorization errors.
    const output = new Response(response.body, response);
    for (const [name,value] of headers) if (name !== 'set-cookie') output.headers.set(name,value);
    for (const cookie of headers.getSetCookie()) output.headers.append('Set-Cookie',cookie);
    return output;
  }
  function redirect(path: string) { return finish(new Response(null, { status:303, headers:{Location:path} })); }
  async function identity(): Promise<Identity | null> {
    if (!client) return null;
    // getSession alone trusts client-provided session data. getUser verifies with Auth.
    const { data, error } = await client.auth.getUser();
    if (error) return null;
    return identityFromUser(data.user);
  }
  async function handle(): Promise<Response> {
    const url = new URL(request.url), action = url.pathname.split('/').at(-1);
    const failure = (code:string) => redirect(`/?mode=app&auth_error=${code}#/start`);
    if (env.AUTH_PROVIDER !== 'supabase' || !client || !config) return failure('configuration');
    if (url.origin !== config.origin) return finish(Response.json({error:'등록된 서비스 주소에서 로그인해 주세요.'},{status:403}));
    try {
      if (action === 'google' && request.method === 'GET') {
        const target = safeReturnTo(url.searchParams.get('return_to'));
        const { data,error } = await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${config.origin}/auth/callback`,skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});
        if (error || !data.url) return failure('provider');
        const destination = new URL(data.url);
        if (destination.origin !== config.url || destination.pathname !== '/auth/v1/authorize' || destination.searchParams.get('provider') !== 'google') return failure('provider');
        headers.append('Set-Cookie', serializeCookieHeader(returnCookie,target,{...cookieOptions,maxAge:600}));
        return redirect(destination.href);
      }
      if (action === 'callback' && request.method === 'GET') {
        const target = safeReturnTo(cookieMap.get(returnCookie));
        headers.append('Set-Cookie',serializeCookieHeader(returnCookie,'',{...cookieOptions,maxAge:0}));
        if (url.searchParams.has('error')) return failure('cancelled');
        const code = url.searchParams.get('code');
        // The SDK consumes the HttpOnly PKCE verifier; no implicit token URL handling.
        if (!code || code.length > 2048) return failure('callback');
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error || !(await identity())) return failure('callback');
        return redirect(target);
      }
      if (action === 'logout' && request.method === 'POST') {
        if (request.headers.get('Origin') !== config.origin || request.headers.get('X-Value-Lens') !== '1') return finish(Response.json({error:'이 작업실에서 다시 시도해 주세요.'},{status:403}));
        const { error } = await client.auth.signOut({scope:'local'});
        if (error) return finish(Response.json({error:'로그아웃하지 못했어요. 다시 시도해 주세요.'},{status:503}));
        return finish(Response.json({ok:true}));
      }
      return finish(Response.json({error:'지원하지 않는 인증 요청이에요.'},{status:405}));
    } catch {
      // Do not log OAuth codes, tokens, cookies or upstream error bodies.
      return failure('unavailable');
    }
  }
  return { client, identity, finish, handle };
}
