import { requireUser } from '@/lib/auth';
import { setDoc, checkRef } from '@/lib/docs';
import { ApiError, body, handler, json } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Admin: POST a pcs-export JSON (documents only; use `npm run db:import` for exports with files).
 * Existing documents with the same id are replaced; nothing is deleted.
 */
export const POST = handler(async (req: Request) => {
  const u = await requireUser(req, 'admin');
  const b = await body(req);
  if (b?.format !== 'pcs-export' || typeof b.collections !== 'object') throw new ApiError(400, 'invalid_argument', 'Not a PCS export file');
  let n = 0;
  for (const [c, docs] of Object.entries<any[]>(b.collections)) {
    if (c === 'xero') continue;
    checkRef(c);
    for (const d of docs) { await setDoc(c, d.id, d.data, u.email); n++; }
  }
  return json({ ok: true, documents: n });
});
