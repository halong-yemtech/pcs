import { requireUser } from '@/lib/auth';
import { snapshot } from '@/lib/docs';
import { handler, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/db/snapshot?c=catalog,parts → every live document in those collections + current rev. */
export const GET = handler(async (req: Request) => {
  await requireUser(req);
  const cs = (new URL(req.url).searchParams.get('c') || '').split(',').filter(Boolean);
  return json(await snapshot(cs));
});
