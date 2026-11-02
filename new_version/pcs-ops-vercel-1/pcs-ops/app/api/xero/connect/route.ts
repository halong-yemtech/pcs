import { requireUser } from '@/lib/auth';
import { appUrl, handler, redirect, setCookie } from '@/lib/http';
import { randomString } from '@/lib/oidc';
import { sign } from '@/lib/session';
import { authorizeUrl } from '@/lib/xero/client';

export const dynamic = 'force-dynamic';

/** Admin opens this in the browser to authorise the PCS Xero organisation. */
export const GET = handler(async (req: Request) => {
  await requireUser(req, 'admin');
  const state = randomString(16);
  const tx = await sign({ state, exp: Math.floor(Date.now() / 1000) + 600 });
  return redirect(authorizeUrl(`${appUrl(req)}/api/xero/callback`, state), [setCookie('pcs_xero', tx, { maxAge: 600, path: '/api/xero' })]);
});
