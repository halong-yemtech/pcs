import { requireUser } from '@/lib/auth';
import { body, handler, json } from '@/lib/http';
import { registerBlob } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  const u = await requireUser(req, 'editor');
  const b = await body(req);
  return json(await registerBlob(b.url, b.pathname, b.contentType, Number(b.size), b.name || 'file', u.email));
});
