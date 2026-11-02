import { appUrl, redirect, setCookie } from '@/lib/http';
import { authorizeUrl, pkceChallenge, randomString } from '@/lib/oidc';
import { sign } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Starts staff sign-in (placeholder OIDC provider, see lib/oidc.ts). */
export async function GET(req: Request) {
  const state = randomString(16), nonce = randomString(16), verifier = randomString(32);
  const next = new URL(req.url).searchParams.get('next') || '/';
  const tx = await sign({ state, nonce, verifier, next: next.startsWith('/') ? next : '/', exp: Math.floor(Date.now() / 1000) + 600 });
  const url = await authorizeUrl(`${appUrl(req)}/api/auth/callback`, state, nonce, await pkceChallenge(verifier));
  return redirect(url, [setCookie('pcs_oauth', tx, { maxAge: 600, path: '/api/auth' })]);
}
