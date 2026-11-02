import { appUrl, redirect, setCookie } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return redirect(`${appUrl(req)}/signed-out.html`, [setCookie(SESSION_COOKIE, '', { maxAge: 0 })]);
}
