import { requireUser } from '@/lib/auth';
import { appUrl, cookies, redirect, setCookie } from '@/lib/http';
import { verify } from '@/lib/session';
import { completeConnect, log } from '@/lib/xero/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const back = (msg: string) => redirect(`${appUrl(req)}/?xero=${encodeURIComponent(msg)}`, [setCookie('pcs_xero', '', { maxAge: 0, path: '/api/xero' })]);
  try {
    const u = await requireUser(req, 'admin');
    const p = new URL(req.url).searchParams;
    if (p.get('error')) return back('error:' + (p.get('error_description') || p.get('error')));
    const tx = await verify<{ state: string }>(cookies(req).pcs_xero);
    if (!tx || tx.state !== p.get('state') || !p.get('code')) return back('error:Xero sign-in expired, try again');
    const { tenant, tenants } = await completeConnect(p.get('code')!, `${appUrl(req)}/api/xero/callback`, u.email);
    await log('connect', tenant.tenantName, true, { by: u.email, orgs: tenants.length });
    return back(tenants.length > 1 ? 'choose' : 'connected');
  } catch (e: any) {
    console.error('xero callback', e);
    return back('error:' + (e?.message || 'connection failed'));
  }
}
