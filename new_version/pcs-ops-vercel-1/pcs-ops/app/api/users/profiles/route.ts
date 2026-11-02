import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { body, handler, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** POST { ids: [email…] } → { email: { name, isMe } } for "uploaded by" / "changed by" labels. */
export const POST = handler(async (req: Request) => {
  const u = await requireUser(req);
  const ids: string[] = ((await body(req)).ids || []).slice(0, 500).map((s: string) => (String(s).includes('@') ? String(s).toLowerCase() : String(s)));
  const r = await q('select email, name from app_users where email = any($1)', [ids]);
  const out: Record<string, any> = {};
  for (const id of ids) out[id] = { name: id.includes('@') ? id : 'Team member', isMe: id === u.email };
  for (const x of r.rows) out[x.email] = { name: x.name || x.email, isMe: x.email === u.email };
  return json(out);
});
