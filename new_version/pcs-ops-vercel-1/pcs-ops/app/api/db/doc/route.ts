import { requireUser } from '@/lib/auth';
import { getDoc } from '@/lib/docs';
import { handler, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/db/doc?c=settings&id=company */
export const GET = handler(async (req: Request) => {
  await requireUser(req);
  const p = new URL(req.url).searchParams;
  const d = await getDoc(p.get('c') || '', p.get('id') || '');
  return json({ exists: !!d, doc: d });
});
