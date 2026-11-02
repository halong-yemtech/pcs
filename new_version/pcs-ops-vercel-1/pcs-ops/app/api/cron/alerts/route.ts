import { safeEqual } from '@/lib/crypto';
import { runAlerts } from '@/lib/alerts';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Hourly (vercel.json). Escalations as they happen; the daily summary at the configured local hour. ?digest=now forces the summary. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get('authorization') || '', `Bearer ${secret}`)) return json({ error: 'unauthorised' }, 401);
  try { return json(await runAlerts({ forceDigest: new URL(req.url).searchParams.get('digest') === 'now' })); }
  catch (e: any) { console.error('alerts cron', e); return json({ error: e?.message }, 500); }
}
