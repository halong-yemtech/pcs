/**
 * Business rules shared with the UI (ported from public/app/app.js so the server applies the
 * same sale-number workflow when Xero reports a payment). Keep the two in step.
 */
export const GST = 0.1;
export const num = (v: any) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => { const d = new Date(iso || Date.now()); d.setDate(d.getDate() + num(n)); return d.toISOString().slice(0, 10); };

export const CO_DEF = {
  name: 'PCS', xeroSales: '200', xeroPurch: '300', xeroTaxSales: 'GST on Income', xeroTaxPurch: 'GST on Expenses',
};
export const co = (settings: any) => ({ ...CO_DEF, ...Object.fromEntries(Object.entries(settings || {}).filter(([, v]) => v !== '' && v != null)) });

export const EXP_ACCT: Record<string, string> = {
  'Motor vehicle & fuel': '449', 'Freight & courier': '425', 'Tools & consumables': '429', 'Repairs & maintenance': '473', Rent: '469',
  'Light & power': '445', 'Telephone & internet': '489', 'Subscriptions & software': '485', 'Office & stationery': '453',
  'Advertising & marketing': '400', 'Travel & accommodation': '493', 'Meals & entertainment': '420', Insurance: '433',
  'Accounting & legal': '412', 'Bank fees': '404', General: '429',
};
export const PAID_BY = ['Business bank account', 'Business card', 'Personal (reimburse)', 'Cash'];

export const expTotal = (e: any) => num(e.total);
export const expGst = (e: any) => (e.gstFree ? 0 : num(e.gst ?? num(e.total) / 11));
export const expNet = (e: any) => expTotal(e) - expGst(e);

export const docketsOf = (d: any): any[] => d.dockets || (d.dispatch ? [d.dispatch] : []);
export const invoicesOf = (d: any): any[] => d.invoices || (d.invoice ? [d.invoice] : []);
export const suppliedQty = (d: any, i: number) => docketsOf(d).reduce((a, k) =>
  a + num(((k.lines || []).find((l: any) => l.li === i) || (k.lines || []).find((l: any, j: number) => l.li == null && j === i) || {}).supplied), 0);
export const backOrder = (d: any) => (d.quote?.lines || []).map((l: any, i: number) => Math.max(0, num(l.qty) - suppliedQty(d, i)));
export const hasBO = (d: any) => backOrder(d).some((x: number) => x > 1e-9);
export const uninvoiced = (d: any) => docketsOf(d).filter(k => !invoicesOf(d).some(v => v.docketNo === k.docketNo));

/** A sale closes when every invoice is paid and nothing is left to dispatch or invoice. */
export const readyToClose = (d: any) =>
  d.stage !== 'closed' && d.stage !== 'lost' && invoicesOf(d).length > 0 && invoicesOf(d).every(v => v.paid) && !hasBO(d) && !uninvoiced(d).length;

export function closeIfPaid(d: any, by: string | null, why: string) {
  if (!readyToClose(d)) return false;
  d.stage = 'closed'; d.closedAt = todayISO(); d.nextAction = ''; d.nextDate = '';
  pushHistory(d, by, `${why} · all invoices paid, sale closed`);
  return true;
}

export function pushHistory(d: any, by: string | null, note: string) {
  d.history = [...(d.history || []), { at: new Date().toISOString(), by, note, stage: d.stage }].slice(-60);
  d.updatedAt = new Date().toISOString();
}

/** Part / item descriptions: catalog chunks merged with overrides, same as the UI's rebuild(). */
export function partIndex(catalogDocs: any[], overrides: any[]): Map<string, any> {
  const m = new Map<string, any>();
  for (const c of catalogDocs.sort((a, b) => num(a.data.seq) - num(b.data.seq))) for (const [k, v] of Object.entries(c.data.items || {})) m.set(k, v);
  for (const o of overrides) { if (o.data.deleted) m.delete(o.id); else m.set(o.id, { ...(m.get(o.id) || {}), ...o.data }); }
  return m;
}
