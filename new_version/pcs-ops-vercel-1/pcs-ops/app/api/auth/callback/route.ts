import { resolveRole } from '@/lib/auth';
import { q } from '@/lib/db';
import { appUrl, cookies, redirect, setCookie } from '@/lib/http';
import { decodeJwt, exchangeCode, validateIdToken } from '@/lib/oidc';
import { SESSION_COOKIE, sign, verify } from '@/lib/session';

export const dynamic = 'force-dynamic';

function deny(req: Request, reason: string) {
  const u = new URL('/signed-out.html', appUrl(req));
  u.searchParams.set('reason', reason);
  return redirect(u.toString(), [setCookie('pcs_oauth', '', { maxAge: 0, path: '/api/auth' })]);
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get('error')) return deny(req, p.get('error_description') || p.get('error'));
  const tx = await verify<{ state: string; nonce: string; verifier: string; next: string }>(cookies(req).pcs_oauth);
  if (!tx || tx.state !== p.get('state') || !p.get('code')) return deny(req, 'Sign-in expired. Please try again.');
  try {
    const tokens = await exchangeCode(p.get('code')!, `${appUrl(req)}/api/auth/callback`, tx.verifier);
    const who = await validateIdToken(decodeJwt(tokens.id_token), tx.nonce);
    const role = await resolveRole(who.email);
    if (!role) return deny(req, `${who.email} does not have access to the PCS operations system.`);
    await q(`insert into app_users (email, name, last_seen) values ($1, $2, now())
             on conflict (email) do update set name = excluded.name, last_seen = now()`, [who.email, who.name]);
    const hours = Number(process.env.SESSION_HOURS || 12);
    const session = await sign({ email: who.email, name: who.name, exp: Math.floor(Date.now() / 1000) + hours * 3600 });
    return redirect(new URL(tx.next || '/', appUrl(req)).toString(), [
      setCookie(SESSION_COOKIE, session, { maxAge: hours * 3600 }),
      setCookie('pcs_oauth', '', { maxAge: 0, path: '/api/auth' }),
    ]);
  } catch (e: any) {
    console.error('sign-in failed', e);
    return deny(req, 'Sign-in failed: ' + (e?.message || 'unknown error'));
  }
}
