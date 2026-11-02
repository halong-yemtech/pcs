import { requireUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { syncPayments } from '@/lib/xero/ops';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Pull invoice and bill payment status from Xero; paid invoices close their sale. */
export const POST = handler(async (req: Request) => {
  const u = await requireUser(req, 'editor');
  return json(await syncPayments(u.email));
});
