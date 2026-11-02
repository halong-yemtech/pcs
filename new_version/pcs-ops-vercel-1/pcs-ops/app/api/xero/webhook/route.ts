import { hmacBase64, safeEqual } from '@/lib/crypto';
import { connection, log } from '@/lib/xero/client';
import { syncPayments } from '@/lib/xero/ops';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Xero webhooks. Xero signs the raw body with the webhooks key (HMAC-SHA256, base64) in
 * x-xero-signature. Must answer 200 for a valid signature and 401 otherwise, with an empty body,
 * within 5 seconds ("intent to receive" validation uses the same rule).
 */
export async function POST(req: Request) {
  const key = process.env.XERO_WEBHOOK_KEY;
  const raw = await req.text();
  const sig = req.headers.get('x-xero-signature') || '';
  if (!key || !safeEqual(hmacBase64(key, raw), sig)) return new Response(null, { status: 401 });
  try {
    const events: any[] = JSON.parse(raw || '{}').events || [];
    const c = await connection();
    const ids = events
      .filter(e => e.eventCategory === 'INVOICE' && (!c || e.tenantId === c.tenant_id))
      .map(e => e.resourceId).filter(Boolean);
    if (ids.length && c) await syncPayments('xero', [...new Set(ids)]);
  } catch (e: any) {
    await log('webhook', null, false, { error: e?.message });
  }
  return new Response(null, { status: 200 });
}
