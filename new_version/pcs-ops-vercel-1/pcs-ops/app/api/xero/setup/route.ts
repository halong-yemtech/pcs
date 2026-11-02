import { requireUser } from '@/lib/auth';
import { body, handler, json } from '@/lib/http';
import { setup } from '@/lib/xero/ops';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Admin: POST { createMissing?: boolean } → checks the Xero organisation and saves mappings. */
export const POST = handler(async (req: Request) => {
  const u = await requireUser(req, 'admin');
  const b = await body(req).catch(() => ({}));
  return json(await setup({ createMissing: !!b.createMissing }, u.email));
});
