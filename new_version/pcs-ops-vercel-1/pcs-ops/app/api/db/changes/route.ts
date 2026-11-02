import { requireUser } from '@/lib/auth';
import { changes } from '@/lib/docs';
import { handler, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/db/changes?since=123&c=a,b → documents changed (or deleted) since rev 123. */
export const GET = handler(async (req: Request) => {
  await requireUser(req);
  const p = new URL(req.url).searchParams;
  const cs = (p.get('c') || '').split(',').filter(Boolean);
  return json(await changes(Number(p.get('since') || 0), cs));
});
