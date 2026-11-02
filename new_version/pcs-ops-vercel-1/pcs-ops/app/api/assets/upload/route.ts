import { requireUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { storeBytes } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST raw file bytes. Headers: content-type, x-filename (URI-encoded). Returns { id, contentType, sizeBytes }. */
export const POST = handler(async (req: Request) => {
  const u = await requireUser(req, 'editor');
  const type = (req.headers.get('content-type') || '').split(';')[0].trim();
  const name = decodeURIComponent(req.headers.get('x-filename') || 'file');
  const buf = await req.arrayBuffer();
  return json(await storeBytes(buf, type, name, u.email));
});
