import { ApiError } from './http';

/**
 * Outgoing email: the provider is the dev team's choice (EMAIL_PROVIDER).
 *   resend   → Resend API            (RESEND_API_KEY)
 *   postmark → Postmark API          (POSTMARK_SERVER_TOKEN)
 *   graph    → Microsoft 365 mailbox via Microsoft Graph sendMail, app-only
 *              (GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET; Mail.Send application permission;
 *               sends as EMAIL_FROM's mailbox and saves to its Sent Items)
 *   log      → records the email but does not send it (testing / staging)
 * To add another (SMTP via nodemailer, SendGrid, Gmail API…), add a branch to send() below.
 *
 * EMAIL_SEND_AS_USER=true sends documents FROM the signed-in person (e.g. "Jack Morris <jack@pcs.com.au>"):
 *   graph    → sent from their own Microsoft 365 mailbox; appears in their Outlook Sent Items
 *   resend / postmark → their address on the verified domain; they get a BCC copy (EMAIL_BCC_SENDER, default on)
 * Only addresses at EMAIL_SENDER_DOMAINS (default: ALLOWED_EMAIL_DOMAINS) are used; others fall back to EMAIL_FROM.
 * Notifications (approvals, escalations, daily summary) always come from EMAIL_FROM.
 */
export type Attachment = { filename: string; contentType: string; content: Buffer };
export type Mail = { from: string; replyTo?: string; to: string[]; cc: string[]; bcc?: string[]; subject: string; text: string; attachments: Attachment[] };

export function emailConfig() {
  const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase();
  const from = process.env.EMAIL_FROM || '';
  const ready =
    provider === 'log' ||
    (provider === 'resend' && !!process.env.RESEND_API_KEY) ||
    (provider === 'postmark' && !!process.env.POSTMARK_SERVER_TOKEN) ||
    (provider === 'graph' && !!(process.env.GRAPH_TENANT_ID && process.env.GRAPH_CLIENT_ID && process.env.GRAPH_CLIENT_SECRET));
  const sendAsUser = process.env.EMAIL_SEND_AS_USER === 'true';
  const bccSender = sendAsUser && provider !== 'graph' && process.env.EMAIL_BCC_SENDER !== 'false';
  return { provider, from, sendAsUser, bccSender, configured: ready && (provider === 'log' || !!from) };
}

const addr = (s: string) => { const m = /<([^>]+)>/.exec(s); return (m ? m[1] : s).trim(); };
const nameOf = (s: string) => { const m = /^\s*"?([^"<]+?)"?\s*</.exec(s); return m ? m[1].trim() : undefined; };

export async function send(m: Mail): Promise<{ status: 'sent' | 'logged'; providerId?: string }> {
  const { provider } = emailConfig();
  if (provider === 'log') return { status: 'logged' };
  if (provider === 'resend') {
    const res = await fetch(process.env.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: m.from, to: m.to, cc: m.cc.length ? m.cc : undefined, bcc: m.bcc?.length ? m.bcc : undefined, reply_to: m.replyTo, subject: m.subject, text: m.text,
        attachments: m.attachments.map(a => ({ filename: a.filename, content: a.content.toString('base64'), content_type: a.contentType })),
      }),
    });
    const d: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(502, 'email_failed', `Resend: ${d.message || d.name || res.status}`);
    return { status: 'sent', providerId: d.id };
  }
  if (provider === 'postmark') {
    const res = await fetch(process.env.POSTMARK_API_URL || 'https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN!, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        From: m.from, To: m.to.join(','), Cc: m.cc.join(',') || undefined, Bcc: m.bcc?.join(',') || undefined, ReplyTo: m.replyTo, Subject: m.subject, TextBody: m.text,
        MessageStream: process.env.POSTMARK_STREAM || 'outbound',
        Attachments: m.attachments.map(a => ({ Name: a.filename, Content: a.content.toString('base64'), ContentType: a.contentType })),
      }),
    });
    const d: any = await res.json().catch(() => ({}));
    if (!res.ok || d.ErrorCode) throw new ApiError(502, 'email_failed', `Postmark: ${d.Message || res.status}`);
    return { status: 'sent', providerId: d.MessageID };
  }
  if (provider === 'graph') {
    const tok = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GRAPH_CLIENT_ID!, client_secret: process.env.GRAPH_CLIENT_SECRET!, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }),
    });
    const t: any = await tok.json().catch(() => ({}));
    if (!tok.ok) throw new ApiError(502, 'email_failed', `Microsoft Graph sign-in failed: ${t.error_description || t.error || tok.status}`);
    const rcpt = (list: string[]) => list.map(a => ({ emailAddress: { address: a } }));
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(addr(m.from))}/sendMail`, {
      method: 'POST', headers: { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: m.subject, body: { contentType: 'Text', content: m.text }, toRecipients: rcpt(m.to), ccRecipients: rcpt(m.cc), bccRecipients: rcpt(m.bcc || []),
          replyTo: m.replyTo ? rcpt([m.replyTo]) : undefined,
          attachments: m.attachments.map(a => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.filename, contentType: a.contentType, contentBytes: a.content.toString('base64') })),
        },
        saveToSentItems: true,
      }),
    });
    if (!res.ok) { const d: any = await res.json().catch(() => ({})); throw new ApiError(502, 'email_failed', `Microsoft Graph: ${d.error?.message || res.status}`); }
    return { status: 'sent' };
  }
  throw new ApiError(400, 'email_not_configured', 'Email is not set up (EMAIL_PROVIDER)');
}

export function senderFor(user: { email: string; name: string }) {
  const cfg = emailConfig();
  const domains = (process.env.EMAIL_SENDER_DOMAINS || process.env.ALLOWED_EMAIL_DOMAINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const dom = user.email.split('@')[1]?.toLowerCase() || '';
  if (cfg.sendAsUser && domains.includes(dom)) {
    const nm = String(user.name || '').replace(/["<>]/g, '').trim();
    return { from: nm ? `${nm} <${user.email}>` : user.email, replyTo: undefined as string | undefined, bcc: cfg.bccSender ? [user.email] : [], asUser: true };
  }
  return { from: cfg.from || 'PCS <noreply@localhost>', replyTo: user.email, bcc: [] as string[], asUser: false };
}

export { addr, nameOf };
