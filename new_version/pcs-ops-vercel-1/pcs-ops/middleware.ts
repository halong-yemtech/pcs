import { SESSION_COOKIE, verify, readCookie, devBypass } from './lib/session';

/**
 * Every page, file and API call needs a valid session, except sign-in, the Xero webhook
 * (verified by HMAC signature) and cron (verified by CRON_SECRET). Route handlers re-check
 * the session and the user's role, so this is a first line of defence, not the only one.
 */
export const config = {
  matcher: ['/((?!api/auth/|api/xero/webhook|api/cron/|_next/static|_next/image|favicon.ico|signed-out.html|app/logo.png).*)'],
};

export async function middleware(req: Request) {
  if (devBypass()) return;
  const ok = await verify(readCookie(req.headers.get('cookie'), SESSION_COOKIE));
  if (ok) return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'Sign in required' } }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  const login = new URL('/api/auth/login', url.origin);
  if (url.pathname !== '/' && url.pathname !== '/index.html') login.searchParams.set('next', url.pathname);
  return Response.redirect(login.toString(), 302);
}
