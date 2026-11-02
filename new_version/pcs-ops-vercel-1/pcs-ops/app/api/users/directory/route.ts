import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { handler, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Everyone who has signed in (for the sale Owner picker). */
export const GET = handler(async (req: Request) => {
  await requireUser(req);
  const r = await q(`select email, name from app_users where coalesce(role,'') <> 'blocked' order by name nulls last, email`);
  return json({ users: r.rows });
});
