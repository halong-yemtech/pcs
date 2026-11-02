import { requireUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { maxBytes, storageDriver } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  await requireUser(req);
  return json({ driver: storageDriver(), maxBytes: maxBytes(), serverUploadMax: 4 * 1024 * 1024 });
});
