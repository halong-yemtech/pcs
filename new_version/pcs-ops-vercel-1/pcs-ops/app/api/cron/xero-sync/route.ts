import { safeEqual } from '@/lib/crypto';
import { json } from '@/lib/http';
import { connection, log } from '@/lib/xero/client';
import { syncPayments } from '@/lib/xero/ops';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Safety net for missed webhooks. Vercel Cron calls this with Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get('authorization') || '', `Bearer ${secret}`)) return json({ error: 'unauthorised' }, 401);
  if (!(await connection())) return json({ skipped: 'Xero not connected' });
  try { return json(await syncPayments('xero-cron')); }
  catch (e: any) { await log('cron', null, false, { error: e?.message }); return json({ error: e?.message }, 500); }
}
