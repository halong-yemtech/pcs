import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { handler } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Admin: full JSON backup of every document (files are listed, not embedded). Same format the importer reads. */
export const GET = handler(async (req: Request) => {
  await requireUser(req, 'admin');
  const r = await q(`select collection, id, data from docs where not deleted and collection not in ('xero','emails','alertsent') order by collection, id`);
  const collections: Record<string, any[]> = {};
  for (const x of r.rows) (collections[x.collection] ||= []).push({ id: x.id, data: x.data });
  const a = await q('select id, original_name as name, content_type as "contentType", size_bytes as size from assets order by created_at');
  const out = { format: 'pcs-export', version: 1, exportedAt: new Date().toISOString(), source: 'vercel', collections, assets: a.rows };
  return new Response(JSON.stringify(out), {
    headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="pcs-export_${out.exportedAt.slice(0, 10)}.json"`, 'cache-control': 'no-store' },
  });
});
