import { requireUser } from '@/lib/auth';
import { ApiError, body, handler, json } from '@/lib/http';
import { pushBills, pushExpenses, pushInvoices } from '@/lib/xero/ops';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST { kind: 'invoices', refs: [{ id: dealId, vi: invoiceIndex }] }
 *      { kind: 'bills',    ids: [poId] }
 *      { kind: 'expenses', ids: [expenseId] }
 */
export const POST = handler(async (req: Request) => {
  const u = await requireUser(req, 'editor');
  const b = await body(req);
  const n = (b.refs || b.ids || []).length;
  if (!n || n > 50) throw new ApiError(400, 'invalid_argument', 'Send between 1 and 50 records at a time');
  let results;
  if (b.kind === 'invoices') results = await pushInvoices(b.refs, u.email);
  else if (b.kind === 'bills') results = await pushBills(b.ids, u.email);
  else if (b.kind === 'expenses') results = await pushExpenses(b.ids, u.email);
  else throw new ApiError(400, 'invalid_argument', 'Unknown kind');
  return json({ results });
});
