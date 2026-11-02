import { requireUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { disconnect, log } from '@/lib/xero/client';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  const u = await requireUser(req, 'admin');
  await disconnect();
  await log('disconnect', null, true, { by: u.email });
  return json({ ok: true });
});
