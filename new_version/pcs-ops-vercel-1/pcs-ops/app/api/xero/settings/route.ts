import { requireUser } from '@/lib/auth';
import { body, handler, json } from '@/lib/http';
import { updateSettings } from '@/lib/xero/ops';

export const dynamic = 'force-dynamic';

/** Admin: POST { invoiceStatus?, billStatus?, expenseBillStatus?, bankMap?, attachDockets?, attachReceipts? } */
export const POST = handler(async (req: Request) => {
  const u = await requireUser(req, 'admin');
  return json(await updateSettings(await body(req), u.email));
});
