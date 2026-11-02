import { requireUser } from '@/lib/auth';
import { body, handler, json } from '@/lib/http';
import { chooseTenant, log } from '@/lib/xero/client';

export const dynamic = 'force-dynamic';

/** Admin: pick which authorised Xero organisation the app posts to. */
export const POST = handler(async (req: Request) => {
  const u = await requireUser(req, 'admin');
  const t = await chooseTenant((await body(req)).tenantId);
  await log('tenant', t.tenantName, true, { by: u.email });
  return json({ ok: true, tenant: { id: t.tenantId, name: t.tenantName } });
});
