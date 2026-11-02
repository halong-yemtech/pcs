import { q } from './db';
import { getDoc, listDocs, setDoc } from './docs';
import { emailConfig, send } from './email';
import { resolveRole, type Role } from './auth';
import * as R from './rules.mjs';

/**
 * Notifications: immediate approval emails, escalations and the daily summary.
 * Sent from the system address (EMAIL_FROM); documents to customers/suppliers go from each person.
 */
const appUrl = () => (process.env.APP_URL || '').replace(/\/$/, '');
const link = (coll: string, id: string) => `${appUrl()}/?open=${coll}:${id}`;
const withId = (docs: any[]) => docs.map(d => ({ ...d.data, _id: d.id }));

export async function loadAll() {
  const [deals, orders, rfqs, pos, customers, suppliers, states] = await Promise.all(
    ['deals', 'orders', 'rfqs', 'pos', 'customers', 'suppliers', 'alertstate'].map(c => listDocs(c)));
  const alertSettings = (await getDoc('settings', 'alerts'))?.data || null;
  const stock: [string, any][] = [];
  for (const d of await listDocs('stock')) for (const [k, v] of Object.entries(d.data.items || {})) stock.push([k, v]);
  return { deals: withId(deals), orders: withId(orders), rfqs: withId(rfqs), pos: withId(pos), customers: withId(customers), suppliers: withId(suppliers), states: withId(states), stock, alertSettings };
}

/** Admin emails: ADMIN_EMAILS plus app_users with the admin role. */
export async function adminEmails(): Promise<string[]> {
  const env = R.list(process.env.ADMIN_EMAILS);
  const r = await q(`select email from app_users where role = 'admin'`);
  return [...new Set([...env, ...r.rows.map((x: any) => x.email)])];
}
/** Directors approve; if none are set yet, admins do. */
export async function approverEmails(settings: any): Promise<string[]> {
  const d = R.list(R.settingsOf(settings).directors);
  return d.length ? d : await adminEmails();
}
async function names(): Promise<Map<string, string>> {
  const r = await q('select email, name from app_users');
  return new Map(r.rows.map((x: any) => [x.email, x.name || x.email]));
}

async function sendSystem(to: string[], subject: string, text: string) {
  const cfg = emailConfig();
  if (!cfg.configured || !to.length) return { status: 'skipped' as const };
  const r = await send({ from: cfg.from, to, cc: [], subject, text, attachments: [] });
  await setDoc('emails', 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), {
    at: new Date().toISOString(), by: 'system', to, cc: [], subject, attachments: [], provider: cfg.provider, status: r.status, ref: { kind: 'notification', coll: '', id: '', no: '', saleNo: '' },
  }, 'system');
  return r;
}

const bullet = (it: any) => `• ${it.label}: ${it.title}\n  ${it.detail}${it.escalate ? '  (escalated)' : ''}\n  ${link(it.coll, it.id)}`;

/** Immediate email when approval is requested or decided. */
export async function notifyApproval(type: 'approval_request' | 'approval_decision', kind: string, coll: string, id: string, si: number | undefined, actor: { email: string; name: string }) {
  const rec = (await getDoc(coll, id))?.data;
  if (!rec) return { sent: 0 };
  const settings = (await getDoc('settings', 'alerts'))?.data;
  let a: any, label = '', title = '';
  if (kind === 'quote') { a = rec.quote?.approval; label = 'Quote'; title = `${rec.quote?.no} · ${rec.no}`; }
  else if (kind === 'po') { a = rec.approval; label = 'Purchase order'; title = rec.no; }
  else { const sp = (rec.suppliers || [])[si ?? -1]; a = sp?.quote?.priceApproval; label = 'Buy price increase'; title = `${rec.no}${sp?.quote?.ref ? ' · quote ' + sp.quote.ref : ''}`; }
  if (!a) return { sent: 0 };
  if (type === 'approval_request' && a.status === 'pending') {
    const to = (await approverEmails(settings)).filter(e => e !== actor.email);
    const r = await sendSystem(to, `Approval needed: ${label} ${title}`,
      `${actor.name || actor.email} has asked a Director to approve ${label.toLowerCase()} ${title}.\n\nReason: ${a.reason || 'over the approval limit'}\n\nOpen it to approve or reject:\n${link(coll, id)}\n\nPCS operations system`);
    return { sent: r.status === 'skipped' ? 0 : to.length };
  }
  if (type === 'approval_decision' && ['approved', 'rejected'].includes(a.status) && a.requestedBy && String(a.requestedBy).includes('@') && a.requestedBy !== actor.email) {
    const r = await sendSystem([a.requestedBy], `${label} ${title} ${a.status}`,
      `${actor.name || actor.email} ${a.status} ${label.toLowerCase()} ${title}.${a.comment ? `\n\nComment: ${a.comment}` : ''}\n\n${a.status === 'approved' ? `You can now send it. ${actor.name || 'The Director'} will be copied on the email automatically` : 'Change it and ask again'}:\n${link(coll, id)}\n\nPCS operations system`);
    return { sent: r.status === 'skipped' ? 0 : 1 };
  }
  return { sent: 0 };
}

/** Hourly: escalation emails (once per item) and, at the summary hour, one digest per person. */
export async function runAlerts(opts: { forceDigest?: boolean; now?: Date } = {}) {
  const data = await loadAll();
  const s = R.settingsOf(data.alertSettings);
  const now = opts.now || new Date();
  const today = R.localDate(s.timezone, now);
  const items = R.activeItems(R.attention({ ...data, today }), data.states, today);
  const sentDocs = await listDocs('alertsent');
  const sent = new Set(sentDocs.map(d => d.id));
  const nm = await names();
  const out = { items: items.length, escalations: 0, digests: 0, digestRecipients: [] as string[], today };

  // escalations: once per item key, to managers (or admins if none are set)
  const managers = R.list(s.managers).length ? R.list(s.managers) : await adminEmails();
  const newEsc = items.filter((i: any) => i.escalate && !sent.has('esc-' + R.stateId(i.key)));
  if (newEsc.length && managers.length) {
    await sendSystem(managers, `Escalated: ${newEsc.length} item${newEsc.length > 1 ? 's' : ''} overdue`,
      `These have gone ${s.escalateDays} or more days past their limit:\n\n${newEsc.map((i: any) => bullet({ ...i, detail: `${i.detail} · owner ${i.owner ? nm.get(i.owner) || i.owner : 'unassigned'}` })).join('\n\n')}\n\nPCS operations system`);
    for (const i of newEsc) await setDoc('alertsent', 'esc-' + R.stateId(i.key), { key: i.key, at: now.toISOString(), to: managers }, 'system');
    out.escalations = newEsc.length;
  }

  // daily summary
  const digestId = `digest-${today}`;
  if (opts.forceDigest || (R.localHour(s.timezone, now) === Number(s.digestHour) && !sent.has(digestId))) {
    const approvers = await approverEmails(data.alertSettings);
    const people = new Set<string>([...items.map((i: any) => i.owner).filter(Boolean), ...approvers, ...managers]);
    const roles = new Map<string, Role | null>();
    for (const e of people) roles.set(e, await resolveRole(e));
    for (const e of people) {
      const role = roles.get(e);
      if (!role) continue;
      const mine = items.filter((i: any) => R.itemFor(i, e, role, data.alertSettings));
      if (!mine.length) continue;
      const ap = mine.filter((i: any) => i.severity === 'approval'), rest = mine.filter((i: any) => i.severity !== 'approval');
      const first = (nm.get(e) || e).split(/[\s@]/)[0];
      await sendSystem([e], `${mine.length} item${mine.length > 1 ? 's' : ''} need${mine.length > 1 ? '' : 's'} attention · PCS`,
        `Good morning ${first},\n\n${ap.length ? `Waiting for your approval\n\n${ap.map(bullet).join('\n\n')}\n\n` : ''}${rest.length ? `Needs attention\n\n${rest.map(bullet).join('\n\n')}\n\n` : ''}Snooze or dismiss items in the app (bell icon): ${appUrl()}/\n\nPCS operations system`);
      out.digests++; out.digestRecipients.push(e);
    }
    await setDoc('alertsent', digestId, { at: now.toISOString(), recipients: out.digestRecipients }, 'system');
  }
  return out;
}
