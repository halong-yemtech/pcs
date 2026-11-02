/**
 * STAFF SIGN-IN PLUG POINT
 * Every API route calls requireUser()/getUser() below, and nothing else knows how people sign in.
 * The default sign-in (/api/auth/* + lib/oidc.ts) is a placeholder generic OIDC flow that issues
 * the signed `pcs_session` cookie. To use another provider (Auth.js, Clerk, Supabase Auth, …),
 * make getUser() return { email, name } from that provider's session and keep resolveRole()
 * for PCS roles. See README → "Staff sign-in".
 */
import { q } from './db';
import { ApiError } from './http';
import { SESSION_COOKIE, verify, readCookie, devBypass } from './session';

export type Role = 'viewer' | 'editor' | 'admin';
export type User = { email: string; name: string; role: Role };
const RANK: Record<string, number> = { viewer: 1, editor: 2, admin: 3 };

const list = (v?: string) => (v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/** Decide a signed-in person's role: app_users row > ADMIN_EMAILS > allowed domain + DEFAULT_ROLE. */
export async function resolveRole(email: string): Promise<Role | null> {
  const e = email.toLowerCase();
  const r = await q('select role from app_users where email = $1', [e]);
  const o = r.rows[0]?.role;
  if (o) return o === 'blocked' ? null : o;
  if (list(process.env.ADMIN_EMAILS).includes(e)) return 'admin';
  const domain = e.split('@')[1] || '';
  if (list(process.env.ALLOWED_EMAIL_DOMAINS).includes(domain)) {
    const d = (process.env.DEFAULT_ROLE || 'editor') as Role;
    return RANK[d] ? d : 'editor';
  }
  return null;
}

/** The signed-in user for this request, with their current role (checked on every request). */
export async function getUser(req: Request): Promise<User | null> {
  if (devBypass()) {
    return { email: (process.env.DEV_USER_EMAIL || 'dev@localhost').toLowerCase(), name: 'Developer', role: 'admin' };
  }
  const s = await verify<{ email: string; name: string }>(readCookie(req.headers.get('cookie'), SESSION_COOKIE));
  if (!s?.email) return null;
  const role = await resolveRole(s.email);
  if (!role) return null;
  return { email: s.email.toLowerCase(), name: s.name || s.email, role };
}

export async function requireUser(req: Request, min: Role = 'viewer'): Promise<User> {
  const u = await getUser(req);
  if (!u) throw new ApiError(401, 'unauthenticated', 'Sign in required');
  if (RANK[u.role] < RANK[min]) throw new ApiError(403, 'not_granted', `Needs ${min} access`);
  return u;
}

export const canWrite = (u: User) => RANK[u.role] >= RANK.editor;
