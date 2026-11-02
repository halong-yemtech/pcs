import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { handler, json } from '@/lib/http';
import { connection, xeroConfigured } from '@/lib/xero/client';
import { xeroSettings } from '@/lib/xero/ops';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  const u = await requireUser(req);
  const configured = xeroConfigured();
  const c = configured ? await connection() : null;
  const s = await xeroSettings();
  const recent = u.role === 'admin' ? (await q('select at, action, ref, ok, detail from xero_log order by at desc limit 25')).rows : [];
  return json({
    configured, connected: !!c,
    tenant: c ? { id: c.tenant_id, name: c.tenant_name } : null,
    tenants: c?.tenants?.map((t: any) => ({ id: t.tenantId, name: t.tenantName })) || [],
    connectedAt: c?.connected_at || null, connectedBy: c?.connected_by || null, scopes: c?.scopes || null,
    settings: s, webhook: !!process.env.XERO_WEBHOOK_KEY, recent,
  });
});
