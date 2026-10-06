import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import type { Identity } from './api';

export type AuthEnv = {
  AUTH_PROVIDER?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  APP_URL?: string;
};
const fallback = '/app?mode=app#/organizations';
const returnCookie = 'vl-login-return';

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || value.length > 2000 || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://value-lens.invalid');
    if (url.origin !== 'https://value-lens.invalid' || !['/', '/app', '/app/'].includes(url.pathname)) return fallback;
    // Only return to the workspace, never loop through another auth endpoint.
    const params = new URLSearchParams({ mode: 'app' });
    const org = url.searchParams.get('org');
    if (org && /^[a-zA-Z0-9-]{1,100}$/.test(org)) params.set('org', org);
    const hash = /^#\/[a-zA-Z0-9/_-]*$/.test(url.hash) ? url.hash : '#/organizations';
    return `/app?${params}${hash}`;
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

export type AuthMethods = ReturnType<typeof authStatus> & {
  emailReady: boolean;
  googleReady: boolean;
  status: 'unconfigured' | 'available' | 'unavailable';
};
const methodCache = new Map<string, { expires: number; value: AuthMethods }>();

/** Check the actual provider switches, rather than treating configured keys as working OAuth. */
export async function availableAuthMethods(env: AuthEnv, fetcher: typeof fetch = fetch): Promise<AuthMethods> {
  const base = authStatus(env), config = configuration(env);
  const disabled = { ...base, emailReady: false, googleReady: false, status: 'unconfigured' as const };
  if (env.AUTH_PROVIDER !== 'supabase' || !config) return disabled;
  const key = `${config.url}|${config.key}`;
  const cached = fetcher === fetch ? methodCache.get(key) : undefined;
  if (cached && cached.expires > Date.now()) return cached.value;
  let value: AuthMethods;
  try {
    const response = await fetcher(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.key }, signal: AbortSignal.timeout(4000), cache: 'no-store',
    });
    if (!response.ok) throw new Error('Auth settings unavailable');
    const settings = await response.json() as { external?: { email?: boolean; google?: boolean } };
    value = { ...base, emailReady: settings.external?.email === true, googleReady: settings.external?.google === true, status: 'available' };
  } catch {
    value = { ...disabled, status: 'unavailable' };
  }
  if (fetcher === fetch) {
    if (methodCache.size > 8) methodCache.clear();
    methodCache.set(key, { value, expires: Date.now() + (value.status === 'available' ? 60_000 : 10_000) });
  }
  return value;
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
  let emailRetryAfter: number | undefined;
  const authFetch: typeof fetch = async (input, options) => {
    const response = await fetcher(input, options);
    const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (target.origin === config?.url && target.pathname === '/auth/v1/otp' && response.status === 429) {
      // The SDK does not retain response headers. Never invent a 60-second reset for a project quota.
      const retry = response.headers.get('Retry-After');
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : NaN;
      if (Number.isFinite(seconds) && seconds > 0 && seconds <= 86400) emailRetryAfter = seconds;
    }
    return response;
  };
  const client = config ? createServerClient(config.url, config.key, {
    global: { fetch: authFetch },
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
    const failure = (code:string) => {
      const target = new URL(safeReturnTo(cookieMap.get(returnCookie) ?? url.searchParams.get('return_to')), url.origin);
      target.searchParams.set('auth_error', code);
      return redirect(`${target.pathname}${target.search}${target.hash}`);
    };
    const emailFailure = (status:number, error:string, code?:string, retryAfter?:number) => {
      // A rejected resend must not replace the verifier for a previously delivered link.
      headers.delete('Set-Cookie');
      return finish(Response.json({error, ...(code ? {code} : {}), ...(retryAfter ? {retryAfter} : {})}, {
        status, headers: retryAfter ? {'Retry-After': String(retryAfter)} : undefined,
      }));
    };
    if (action === 'email') {
      if (request.method !== 'POST') return emailFailure(405, '이메일 인증 요청은 POST만 사용할 수 있어요.');
      if (env.AUTH_PROVIDER !== 'supabase' || !client || !config) return emailFailure(503, '이메일 로그인 연결을 준비 중이에요.');
      if (url.origin !== config.origin || request.headers.get('Origin') !== config.origin || request.headers.get('X-Value-Lens') !== '1') return emailFailure(403, '이 작업실에서 다시 시도해 주세요.');
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return emailFailure(415, '요청 형식을 확인해 주세요.');
      if (Number(request.headers.get('Content-Length')) > 4096) return emailFailure(413, '요청이 너무 커요.');
      let input: {email?: unknown; returnTo?: unknown};
      try {
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > 4096) return emailFailure(413, '요청이 너무 커요.');
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid input');
        input = parsed;
      } catch { return emailFailure(400, '이메일 주소를 확인해 주세요.'); }
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return emailFailure(400, '이메일 주소를 확인해 주세요.');
      const target = safeReturnTo(typeof input.returnTo === 'string' ? input.returnTo : undefined);
      try {
        // Public account registration is independent of organization membership.
        // The session is only established after the email link's PKCE code is exchanged.
        const { error } = await client.auth.signInWithOtp({ email, options: {
          shouldCreateUser: true, emailRedirectTo: `${config.origin}/auth/callback`,
        } });
        if (error) {
          if (error.status === 429 && error.code === 'over_email_send_rate_limit') {
            return emailFailure(429, '서비스의 인증 메일 발송 한도에 도달했어요. 메일 발송 설정 확인이 필요해요.', 'email_delivery_limit', emailRetryAfter);
          }
          if (error.status === 429) return emailFailure(429, '인증 요청이 잠시 제한됐어요. 잠시 후 다시 시도해 주세요.', 'request_rate_limit', emailRetryAfter);
          if (error.code === 'email_address_not_authorized') {
            return emailFailure(503, '서비스의 메일 발송 설정이 아직 준비되지 않았어요.', 'email_delivery_unavailable');
          }
          // Do not disclose whether an address already has an account, or upstream details.
          return emailFailure(503, '인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
        }
        headers.append('Set-Cookie', serializeCookieHeader(returnCookie, target, { ...cookieOptions, maxAge:3600 }));
        return finish(Response.json({ ok:true, retryAfter:60 }));
      } catch { return emailFailure(503, '이메일 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    }
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
