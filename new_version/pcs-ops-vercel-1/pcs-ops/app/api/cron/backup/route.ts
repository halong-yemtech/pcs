import { safeEqual } from '@/lib/crypto';
import { runBackup } from '@/lib/backup';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Weekly (vercel.json). Vercel Cron sends Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get('authorization') || '', `Bearer ${secret}`)) return json({ error: 'unauthorised' }, 401);
  const r = await runBackup('weekly', 'cron');
  return json(r, r.ok ? 200 : 500);
}
