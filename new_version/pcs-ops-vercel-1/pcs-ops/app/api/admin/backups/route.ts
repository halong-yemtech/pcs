import { requireUser } from '@/lib/auth';
import { backupStatus, runBackup } from '@/lib/backup';
import { handler, json } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET: backup history and whether the last good one is over 8 days old. Any signed-in user may read it. */
export const GET = handler(async (req: Request) => { await requireUser(req); return json(await backupStatus()); });

/** POST: back up now (admin). */
export const POST = handler(async (req: Request) => {
  const u = await requireUser(req, 'admin');
  return json(await runBackup('manual', u.email));
});
