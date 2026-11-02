import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { ApiError, body, handler, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Admin: list people who have signed in and their role overrides. */
export const GET = handler(async (req: Request) => {
  await requireUser(req, 'admin');
  const r = await q('select email, name, role, last_seen from app_users order by last_seen desc nulls last');
  return json({
    users: r.rows,
    rules: {
      allowedDomains: process.env.ALLOWED_EMAIL_DOMAINS || '', defaultRole: process.env.DEFAULT_ROLE || 'editor',
      adminEmails: process.env.ADMIN_EMAILS || '',
    },
  });
});

/** Admin: POST { email, role: viewer|editor|admin|blocked|null, name? } */
export const POST = handler(async (req: Request) => {
  const me = await requireUser(req, 'admin');
  const { email, role, name } = await body(req);
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new ApiError(400, 'invalid_argument', 'Enter a valid email');
  if (role != null && !['viewer', 'editor', 'admin', 'blocked'].includes(role)) throw new ApiError(400, 'invalid_argument', 'Bad role');
  if (e === me.email && role !== 'admin' && role != null) throw new ApiError(400, 'invalid_argument', 'You cannot remove your own admin access');
  await q(`insert into app_users (email, name, role) values ($1, $2, $3)
           on conflict (email) do update set role = excluded.role, name = coalesce(excluded.name, app_users.name)`, [e, name || null, role ?? null]);
  return json({ ok: true });
});
