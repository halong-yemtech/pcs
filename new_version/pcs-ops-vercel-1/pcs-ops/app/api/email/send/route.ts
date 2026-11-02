import { requireUser } from '@/lib/auth';
import { getDoc, newId, setDoc } from '@/lib/docs';
import { emailConfig, send, senderFor, type Attachment } from '@/lib/email';
import { ApiError, body, handler, json } from '@/lib/http';
import { readAssetBytes } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_TOTAL = 15 * 1024 * 1024;
const KINDS = new Set(['quote', 'rfq', 'po', 'invoice', 'docket', 'packing', 'build', 'other']);

/**
 * POST { to[], cc[], subject, text, attachments: [{ filename, contentType, base64 } | { assetId, filename }],
 *        ref: { kind, coll, id, no, saleNo } }
 * Sends as the signed-in person (EMAIL_SEND_AS_USER) or from EMAIL_FROM with Reply-To = them; logs it in "emails".
 */
export const POST = handler(async (req: Request) => {
  const u = await requireUser(req, 'editor');
  const cfg = emailConfig();
  if (!cfg.configured) throw new ApiError(400, 'email_not_configured', 'Email is not set up on the server');
  const b = await body(req);
  const to: string[] = (b.to || []).map((x: string) => String(x).trim()).filter(Boolean);
  const cc: string[] = (b.cc || []).map((x: string) => String(x).trim()).filter(Boolean);
  if (!to.length || to.length + cc.length > 20) throw new ApiError(400, 'invalid_argument', 'Between 1 and 20 recipients');
  const bad = [...to, ...cc].filter(x => !EMAIL_RE.test(x));
  if (bad.length) throw new ApiError(400, 'invalid_argument', `Invalid address: ${bad.join(', ')}`);
  const subject = String(b.subject || '').slice(0, 300).trim();
  if (!subject) throw new ApiError(400, 'invalid_argument', 'Subject is required');
  const text = String(b.text || '').slice(0, 50_000);

  const atts: Attachment[] = [];
  for (const a of (b.attachments || []).slice(0, 15)) {
    if (a.assetId) {
      const f = await readAssetBytes(String(a.assetId));
      if (!f) throw new ApiError(400, 'invalid_argument', `Attachment not found: ${a.filename || a.assetId}`);
      atts.push({ filename: String(a.filename || f.name), contentType: f.contentType, content: Buffer.from(f.buf) });
    } else if (a.base64) {
      atts.push({ filename: String(a.filename || 'attachment'), contentType: String(a.contentType || 'application/octet-stream'), content: Buffer.from(String(a.base64), 'base64') });
    }
  }
  if (atts.reduce((n, a) => n + a.content.length, 0) > MAX_TOTAL) throw new ApiError(413, 'too_large', 'Attachments are over 15 MB');

  const ref = b.ref || {};
  // Admin raises, Director approves, Admin sends: the approving Director always gets a copy of what went out.
  if ((ref.kind === 'quote' && ref.coll === 'deals') || (ref.kind === 'po' && ref.coll === 'pos')) {
    const rec = (await getDoc(String(ref.coll), String(ref.id || '')))?.data;
    const a = ref.kind === 'quote' ? rec?.quote?.approval : rec?.approval;
    const dir = a?.status === 'approved' && String(a.decidedBy || '').includes('@') ? String(a.decidedBy).toLowerCase() : '';
    if (dir && dir !== u.email && !to.includes(dir) && !cc.includes(dir)) cc.push(dir);
  }
  const record: any = {
    at: new Date().toISOString(), by: u.email, to, cc, subject, attachments: atts.map(a => a.filename), provider: cfg.provider,
    ref: { kind: KINDS.has(ref.kind) ? ref.kind : 'other', coll: String(ref.coll || ''), id: String(ref.id || ''), no: String(ref.no || ''), saleNo: String(ref.saleNo || '') },
  };
  const id = newId();
  try {
    const who = senderFor(u);
    record.from = who.from;
    const r = await send({ from: who.from, replyTo: who.replyTo, to, cc: cc.filter(x => !who.bcc.includes(x)), bcc: who.bcc, subject, text, attachments: atts });
    record.status = r.status; record.providerId = r.providerId || null;
    await setDoc('emails', id, record, u.email);
    return json({ ok: true, id, status: r.status });
  } catch (e: any) {
    record.status = 'failed'; record.error = e?.message || 'failed';
    await setDoc('emails', id, record, u.email);
    throw e;
  }
});
