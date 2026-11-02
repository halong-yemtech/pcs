import { requireUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { readAsset, safeName } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/assets/:id (also served at /_blob/:id) → the file, for signed-in users only. */
export const GET = handler(async (req: Request, ctx: { params: any }) => {
  await requireUser(req);
  const { id } = await ctx.params;
  const a = await readAsset(id);
  if (!a) return json({ error: { code: 'not_found', message: 'File not found' } }, 404);
  return new Response(a.body as any, {
    headers: {
      'content-type': a.contentType,
      'content-length': String(a.size),
      'content-disposition': `inline; filename="${safeName(a.name)}"`,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
});
