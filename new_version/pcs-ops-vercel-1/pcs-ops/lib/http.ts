/** Small helpers shared by route handlers. Web-standard Request/Response only. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function json(data: any, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function fail(e: any): Response {
  if (e instanceof ApiError) return json({ error: { code: e.code, message: e.message } }, e.status);
  console.error(e);
  return json({ error: { code: 'internal', message: 'Server error' } }, 500);
}

/** Wrap a handler so thrown ApiErrors become JSON responses. */
export function handler<A extends any[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A): Promise<Response> => {
    try { return await fn(...a); } catch (e) { return fail(e); }
  };
}

export function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(name: string, value: string, opts: { maxAge?: number; path?: string } = {}): string {
  const secure = (process.env.APP_URL || '').startsWith('https://') ? '; Secure' : '';
  const age = opts.maxAge != null ? `; Max-Age=${opts.maxAge}` : '';
  return `${name}=${encodeURIComponent(value)}; Path=${opts.path || '/'}; HttpOnly; SameSite=Lax${secure}${age}`;
}

export function redirect(location: string, cookiesToSet: string[] = []): Response {
  const h = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookiesToSet) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
}

export function appUrl(req: Request): string {
  return (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, '');
}

export async function body(req: Request): Promise<any> {
  try { return await req.json(); } catch { throw new ApiError(400, 'invalid_argument', 'Expected a JSON body'); }
}
