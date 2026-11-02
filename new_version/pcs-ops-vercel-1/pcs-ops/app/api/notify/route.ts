import { requireUser } from '@/lib/auth';
import { notifyApproval } from '@/lib/alerts';
import { ApiError, body, handler, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** POST { type: approval_request|approval_decision, kind: quote|po|price, coll, id, si? } → emails approvers / requester. */
export const POST = handler(async (req: Request) => {
  const u = await requireUser(req, 'editor');
  const b = await body(req);
  if (!['approval_request', 'approval_decision'].includes(b.type)) throw new ApiError(400, 'invalid_argument', 'Unknown type');
  if (!['deals', 'pos', 'rfqs'].includes(b.coll)) throw new ApiError(400, 'invalid_argument', 'Unknown record');
  return json(await notifyApproval(b.type, String(b.kind), b.coll, String(b.id), b.si == null ? undefined : Number(b.si), { email: u.email, name: u.name }));
});
