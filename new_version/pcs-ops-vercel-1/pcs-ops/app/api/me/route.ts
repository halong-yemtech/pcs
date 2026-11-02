import { canWrite, requireUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { storageDriver } from '@/lib/storage';
import { xeroConfigured } from '@/lib/xero/client';
import { emailConfig } from '@/lib/email';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  const u = await requireUser(req);
  return json({
    id: u.email, email: u.email, name: u.name, role: u.role, canWrite: canWrite(u),
    storage: storageDriver(), maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 20),
    xero: { configured: xeroConfigured() },
    email_cfg: (({ configured, provider, from, sendAsUser, bccSender }) => ({ configured, provider, from, sendAsUser, bccSender }))(emailConfig()),
  });
});
