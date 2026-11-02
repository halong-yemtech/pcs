import { requireUser } from '@/lib/auth';
import { deleteDoc, getDoc, newId, setDoc, updateDoc } from '@/lib/docs';
import { isApprover } from '@/lib/rules.mjs';
import { ApiError, body, handler, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Collections only the server (Xero integration, admin tools) may write. */
const SERVER_ONLY = new Set(['xero', 'emails', 'alertsent']);

/** POST /api/db/write { op: set|update|delete|add, c, id?, data? } */
export const POST = handler(async (req: Request) => {
  const u = await requireUser(req, 'editor');
  const { op, c, id, data } = await body(req);
  if (SERVER_ONLY.has(c)) throw new ApiError(403, 'not_granted', 'That collection is managed by the server');
  // approval limits and approvers can only be changed by an admin
  if (c === 'settings' && id === 'alerts' && u.role !== 'admin') throw new ApiError(403, 'not_granted', 'Only an admin can change alert and approval settings');
  await guardApprovals(c, id, op, data, u);
  let doc;
  if (op === 'set') doc = await setDoc(c, id, data, u.email);
  else if (op === 'add') doc = await setDoc(c, newId(), data, u.email);
  else if (op === 'update') doc = await updateDoc(c, id, data, u.email);
  else if (op === 'delete') doc = await deleteDoc(c, id, u.email);
  else throw new ApiError(400, 'invalid_argument', 'Unknown op');
  return json({ doc });
});

/** Approval decisions can only be recorded by an approver (settings/alerts approvers, or an admin). */
const approvalsOf = (c: string, d: any): any[] =>
  !d ? [] : c === 'deals' ? [d.quote?.approval] : c === 'pos' ? [d.approval] : c === 'rfqs' ? (d.suppliers || []).map((x: any) => x?.quote?.priceApproval) : [];
async function guardApprovals(c: string, id: string, op: string, data: any, u: { email: string; role: string }) {
  if (!['deals', 'pos', 'rfqs'].includes(c) || !['set', 'update'].includes(op) || !data) return;
  const cur = (await getDoc(c, id))?.data;
  const next = op === 'set' ? data : { ...(cur || {}), ...data };
  const before = approvalsOf(c, cur), after = approvalsOf(c, next);
  const decided = after.some((a, i) => a && ['approved', 'rejected'].includes(a.status) &&
    (before[i]?.status !== a.status || before[i]?.decidedAt !== a.decidedAt || before[i]?.sig !== a.sig));
  if (!decided) return;
  const settings = (await getDoc('settings', 'alerts'))?.data;
  if (!isApprover(u.email, u.role, settings)) throw new ApiError(403, 'not_granted', 'Only an approver can approve or reject');
  if (after.some((a, i) => a && ['approved', 'rejected'].includes(a.status) && before[i]?.decidedAt !== a.decidedAt && a.decidedBy !== u.email))
    throw new ApiError(400, 'invalid_argument', 'Approval must be recorded under your own name');
}
