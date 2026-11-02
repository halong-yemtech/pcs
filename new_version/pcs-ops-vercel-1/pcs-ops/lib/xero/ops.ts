import { getDoc, listDocs, mutateDoc, setDoc } from '../docs';
import { ApiError } from '../http';
import { readAssetBytes } from '../storage';
import {
  EXP_ACCT, addDays, closeIfPaid, co, docketsOf, expGst, expTotal, invoicesOf, num, partIndex, pushHistory, todayISO,
} from '../flow';
import { connection, elementErrors, log, xero, xeroDate } from './client';

/** Xero settings live in the server-only "xero" collection so every screen can read them. */
export async function xeroSettings(): Promise<any> {
  return (await getDoc('xero', 'settings'))?.data || {};
}
async function saveSettings(patch: any, by: string | null) {
  const cur = await xeroSettings();
  await setDoc('xero', 'settings', { ...cur, ...patch, updatedAt: new Date().toISOString() }, by);
}

const ACCOUNT_NAMES: Record<string, [string, string]> = {
  '200': ['Sales', 'REVENUE'], '300': ['Purchases', 'DIRECTCOSTS'], '400': ['Advertising', 'EXPENSE'], '404': ['Bank Fees', 'EXPENSE'],
  '412': ['Consulting & Accounting', 'EXPENSE'], '420': ['Entertainment', 'EXPENSE'], '425': ['Freight & Courier', 'EXPENSE'],
  '429': ['General Expenses', 'EXPENSE'], '433': ['Insurance', 'EXPENSE'], '445': ['Light, Power, Heating', 'EXPENSE'],
  '449': ['Motor Vehicle Expenses', 'EXPENSE'], '453': ['Office Expenses', 'EXPENSE'], '469': ['Rent', 'EXPENSE'],
  '473': ['Repairs and Maintenance', 'EXPENSE'], '485': ['Subscriptions', 'EXPENSE'], '489': ['Telephone & Internet', 'EXPENSE'],
  '493': ['Travel - National', 'EXPENSE'],
};
const AU_TAX: Record<string, string> = { 'GST on Income': 'OUTPUT', 'GST on Expenses': 'INPUT', 'GST Free Expenses': 'EXEMPTEXPENSES', 'GST Free Income': 'EXEMPTOUTPUT' };

/**
 * First-run setup for a new Xero organisation: check the organisation, the account codes and tax
 * rates the app posts to, optionally create missing accounts, and list bank accounts for mapping.
 */
export async function setup(opts: { createMissing?: boolean }, by: string) {
  const company = co((await getDoc('settings', 'company'))?.data);
  const org = (await xero('GET', '/Organisation')).data?.Organisations?.[0] || {};
  let accounts: any[] = (await xero('GET', '/Accounts')).data?.Accounts || [];
  const taxRates: any[] = (await xero('GET', '/TaxRates')).data?.TaxRates || [];
  const expenses = await listDocs('expenses');

  const need = new Map<string, string>(); // code → purpose
  need.set(String(company.xeroSales), 'Sales invoices');
  need.set(String(company.xeroPurch), 'Supplier bills');
  for (const [cat, code] of Object.entries(EXP_ACCT)) if (!need.has(code)) need.set(code, `Expenses: ${cat}`);
  for (const e of expenses) if (e.data.account && !need.has(String(e.data.account))) need.set(String(e.data.account), 'Expense account in use');

  const active = () => new Set(accounts.filter(a => a.Status !== 'ARCHIVED' && a.Code).map(a => String(a.Code)));
  let missing = [...need.keys()].filter(c => !active().has(c));
  const created: string[] = [], failed: string[] = [];
  if (opts.createMissing) {
    for (const code of missing) {
      const [name, type] = ACCOUNT_NAMES[code] || [`PCS ${need.get(code)}`.slice(0, 150), code === String(company.xeroSales) ? 'REVENUE' : 'EXPENSE'];
      try { await xero('PUT', '/Accounts', { body: { Code: code, Name: name, Type: type } }); created.push(`${code} ${name}`); }
      catch (e: any) { failed.push(`${code}: ${e.message}`); }
    }
    accounts = (await xero('GET', '/Accounts')).data?.Accounts || [];
    missing = [...need.keys()].filter(c => !active().has(c));
  }

  const taxType = (name: string) => {
    const hit = taxRates.find(t => t.Name === name && t.Status === 'ACTIVE');
    return hit?.TaxType || (taxRates.some(t => t.TaxType === AU_TAX[name]) ? AU_TAX[name] : null);
  };
  const taxTypes = {
    sales: taxType(company.xeroTaxSales), purchases: taxType(company.xeroTaxPurch),
    gstFreePurchases: taxType('GST Free Expenses'), gstFreeSales: taxType('GST Free Income'),
  };
  const bankAccounts = accounts.filter(a => a.Type === 'BANK' && a.Status === 'ACTIVE')
    .map(a => ({ AccountID: a.AccountID, Name: a.Name, Code: a.Code || '', BankAccountType: a.BankAccountType || '' }));
  const warnings: string[] = [];
  if (org.CountryCode && org.CountryCode !== 'AU') warnings.push(`Organisation country is ${org.CountryCode}; the app's tax settings assume Australian GST.`);
  if (org.BaseCurrency && org.BaseCurrency !== 'AUD') warnings.push(`Base currency is ${org.BaseCurrency}; invoices are sent in AUD.`);
  for (const [k, v] of Object.entries(taxTypes)) if (!v && k !== 'gstFreeSales') warnings.push(`No Xero tax rate found for ${k}. Check the tax names on the Company screen.`);
  if (missing.length) warnings.push(`Account codes not in Xero: ${missing.join(', ')}. Run setup with “create missing accounts”, or change the codes on the Company screen.`);
  if (!bankAccounts.length) warnings.push('No bank accounts in Xero yet. Add the business bank account and card in Xero, then run setup again to map expenses.');

  const cur = await xeroSettings();
  const bankMap = { ...(cur.bankMap || {}) };
  if (!bankMap['Business bank account'] && bankAccounts.length === 1) bankMap['Business bank account'] = bankAccounts[0].AccountID;
  await saveSettings({
    orgName: org.Name || '', orgCountry: org.CountryCode || '', baseCurrency: org.BaseCurrency || '', isDemo: !!org.IsDemoCompany,
    taxTypes, bankAccounts, bankMap, invoiceStatus: cur.invoiceStatus || 'AUTHORISED', billStatus: cur.billStatus || 'AUTHORISED',
    expenseBillStatus: cur.expenseBillStatus || 'DRAFT', attachDockets: cur.attachDockets ?? true, attachReceipts: cur.attachReceipts ?? true,
    setupAt: new Date().toISOString(), setupBy: by, missingAccounts: missing, warnings,
  }, by);
  await log('setup', org.Name || null, !warnings.length, { created, failed, missing, warnings });
  return { org: { name: org.Name, country: org.CountryCode, currency: org.BaseCurrency, demo: !!org.IsDemoCompany }, created, failed, missing, taxTypes, bankAccounts, warnings };
}

export async function updateSettings(patch: any, by: string) {
  const allowed: any = {};
  for (const k of ['invoiceStatus', 'billStatus', 'expenseBillStatus']) if (patch[k] !== undefined) {
    if (!['DRAFT', 'SUBMITTED', 'AUTHORISED'].includes(patch[k])) throw new ApiError(400, 'invalid_argument', `Bad ${k}`);
    allowed[k] = patch[k];
  }
  for (const k of ['attachDockets', 'attachReceipts']) if (patch[k] !== undefined) allowed[k] = !!patch[k];
  if (patch.bankMap) allowed.bankMap = Object.fromEntries(Object.entries(patch.bankMap).filter(([, v]) => typeof v === 'string'));
  await saveSettings(allowed, by);
  return xeroSettings();
}

// ── contacts ──────────────────────────────────────────────────────────
const esc = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

async function findOrCreateContact(c: { name: string; email?: string; abn?: string; phone?: string; address?: string }): Promise<string> {
  const name = (c.name || '').trim();
  if (!name) throw new ApiError(400, 'invalid_argument', 'Contact has no name');
  const found = await xero('GET', '/Contacts', { query: { where: `Name=="${esc(name)}"`, summaryOnly: 'true' } });
  const hit = found.data?.Contacts?.[0];
  if (hit?.ContactID) return hit.ContactID;
  const body: any = { Name: name.slice(0, 255) };
  if (c.email) body.EmailAddress = c.email;
  if (c.abn) body.TaxNumber = c.abn.replace(/\s/g, '');
  if (c.phone) body.Phones = [{ PhoneType: 'DEFAULT', PhoneNumber: c.phone }];
  if (c.address) body.Addresses = [{ AddressType: 'STREET', AddressLine1: c.address.slice(0, 500) }];
  const r = await xero('POST', '/Contacts', { body: { Contacts: [body] }, query: { summarizeErrors: 'false' } });
  const el = r.data?.Contacts?.[0];
  const errs = elementErrors(el);
  if (errs.length || !el?.ContactID) throw new ApiError(400, 'xero_error', `Xero contact: ${errs.join('; ') || 'not created'}`);
  return el.ContactID;
}

async function contactFor(coll: 'customers' | 'suppliers', id: string, by: string): Promise<string> {
  const d = await getDoc(coll, id);
  if (!d) throw new ApiError(400, 'invalid_argument', `${coll === 'customers' ? 'Customer' : 'Supplier'} not found`);
  if (d.data.xeroContactId) return d.data.xeroContactId;
  const k = (d.data.contacts || [])[0] || {};
  const cid = await findOrCreateContact({
    name: d.data.name, email: d.data.email || k.email, abn: d.data.abn, phone: d.data.phone || k.phone, address: d.data.site || d.data.address,
  });
  await mutateDoc(coll, id, x => ({ ...x, xeroContactId: cid }), by);
  return cid;
}

async function attach(kind: 'Invoices' | 'BankTransactions', xeroId: string, assetId: string, label: string) {
  const a = await readAssetBytes(assetId);
  if (!a) return 'file not found';
  const ext = (a.name.split('.').pop() || 'pdf').toLowerCase();
  const fname = `${label}.${ext}`.replace(/[^A-Za-z0-9._-]+/g, '_');
  await xero('PUT', `/${kind}/${xeroId}/Attachments/${encodeURIComponent(fname)}`, { raw: a.buf, contentType: a.contentType });
  return null;
}

type Result = { ref: string; ok: boolean; skipped?: boolean; message: string; xeroId?: string };

async function existingInvoice(number: string, contactId: string) {
  const r = await xero('GET', '/Invoices', { query: { InvoiceNumbers: number, ContactIDs: contactId, summaryOnly: 'true' } });
  return (r.data?.Invoices || []).find((i: any) => i.Status !== 'DELETED' && i.Status !== 'VOIDED');
}

async function postInvoice(payload: any, key: string) {
  const r = await xero('POST', '/Invoices', { body: { Invoices: [payload] }, query: { summarizeErrors: 'false' }, idempotencyKey: key });
  const el = r.data?.Invoices?.[0];
  const errs = elementErrors(el);
  if (errs.length || !el?.InvoiceID) throw new ApiError(400, 'xero_error', errs.join('; ') || 'Xero did not create the invoice');
  return el;
}

// ── sales invoices (ACCREC) ───────────────────────────────────────────
export async function pushInvoices(refs: { id: string; vi: number }[], by: string): Promise<Result[]> {
  const s = await xeroSettings();
  const company = co((await getDoc('settings', 'company'))?.data);
  const out: Result[] = [];
  for (const { id, vi } of refs) {
    const d = await getDoc('deals', id);
    const v = d && invoicesOf(d.data)[vi];
    const ref = v?.no || `${id}#${vi}`;
    try {
      if (!d || !v) throw new ApiError(404, 'not_found', 'Invoice not found');
      if (v.xeroInvoiceId && v.xeroStatus !== 'DRAFT') { out.push({ ref, ok: true, skipped: true, message: `Already in Xero (${v.xeroStatus || 'sent'})`, xeroId: v.xeroInvoiceId }); continue; }
      if (!d.data.customerId) throw new ApiError(400, 'invalid_argument', `${d.data.no} has no customer`);
      const contactId = await contactFor('customers', d.data.customerId, by);
      const lines = (v.lines || []).filter((l: any) => num(l.supplied) > 0).map((l: any) => ({
        Description: `${l.code ? l.code + ' ' : ''}${l.desc || ''}`.trim().slice(0, 4000) || 'Item',
        Quantity: num(l.supplied), UnitAmount: +num(l.price).toFixed(4), DiscountRate: num(l.disc) || undefined,
        AccountCode: String(company.xeroSales), TaxType: d.data.quote?.gst === false ? (s.taxTypes?.gstFreeSales || 'EXEMPTOUTPUT') : s.taxTypes?.sales || 'OUTPUT',
      }));
      if (!lines.length) throw new ApiError(400, 'invalid_argument', 'Invoice has no supplied lines');
      const payload: any = {
        Type: 'ACCREC', Contact: { ContactID: contactId }, InvoiceNumber: v.no,
        Reference: [d.data.po?.no, d.data.no, v.docketNo].filter(Boolean).join(' / ').slice(0, 255),
        Date: v.date || todayISO(), DueDate: v.due || addDays(v.date || todayISO(), 30), LineAmountTypes: 'Exclusive',
        CurrencyCode: 'AUD', Status: s.invoiceStatus || 'AUTHORISED', LineItems: lines,
      };
      const prior = v.xeroInvoiceId ? { InvoiceID: v.xeroInvoiceId } : await existingInvoice(v.no, contactId);
      if (prior?.InvoiceID) payload.InvoiceID = prior.InvoiceID;
      if (prior && prior.Status && prior.Status !== 'DRAFT') {
        await saveInvoiceLink(id, vi, prior.InvoiceID, prior.Status, by, `Invoice ${v.no} linked to existing Xero invoice`);
        out.push({ ref, ok: true, skipped: true, message: `Linked to the existing Xero invoice (${prior.Status})`, xeroId: prior.InvoiceID });
        continue;
      }
      const el = await postInvoice(payload, `pcs-inv-${id}-${v.no}-${Math.floor(Date.now() / 60000)}`);
      await saveInvoiceLink(id, vi, el.InvoiceID, el.Status, by, `Invoice ${v.no} sent to Xero (${el.Status})`);
      let note = '';
      const k = docketsOf(d.data).find((x: any) => x.docketNo === v.docketNo);
      if (s.attachDockets !== false && k?.podAssetId) {
        try { const e = await attach('Invoices', el.InvoiceID, k.podAssetId, `${k.docketNo}-signed`); if (!e) note = ' · signed docket attached'; }
        catch (e: any) { note = ` · docket not attached: ${e.message}`; }
      }
      await log('push.invoice', v.no, true, { invoiceId: el.InvoiceID, status: el.Status });
      out.push({ ref, ok: true, message: `Sent (${el.Status})${note}`, xeroId: el.InvoiceID });
    } catch (e: any) {
      await log('push.invoice', ref, false, { error: e.message });
      out.push({ ref, ok: false, message: e.message || 'Failed' });
    }
  }
  return out;
}

async function saveInvoiceLink(dealId: string, vi: number, invoiceId: string, status: string, by: string, note: string) {
  await mutateDoc('deals', dealId, d => {
    const vs = invoicesOf(d).map((x: any) => ({ ...x }));
    if (!vs[vi]) return null;
    vs[vi] = { ...vs[vi], xeroInvoiceId: invoiceId, xeroStatus: status, xeroAt: new Date().toISOString() };
    d.invoices = vs; d.invoice = null;
    pushHistory(d, by, note);
    return d;
  }, by);
}

// ── supplier bills (ACCPAY) from received purchase orders ─────────────
export async function pushBills(ids: string[], by: string): Promise<Result[]> {
  const s = await xeroSettings();
  const company = co((await getDoc('settings', 'company'))?.data);
  const parts = partIndex(await listDocs('catalog'), await listDocs('parts'));
  const deals = new Map((await listDocs('deals')).map(d => [d.id, d.data]));
  const out: Result[] = [];
  for (const id of ids) {
    const p = await getDoc('pos', id);
    const ref = p?.data.no || id;
    try {
      if (!p) throw new ApiError(404, 'not_found', 'Purchase order not found');
      if (p.data.xeroBillId && p.data.xeroStatus !== 'DRAFT') { out.push({ ref, ok: true, skipped: true, message: `Already in Xero (${p.data.xeroStatus || 'sent'})`, xeroId: p.data.xeroBillId }); continue; }
      const sup = p.data.supplierId ? await getDoc('suppliers', p.data.supplierId) : null;
      if (!sup) throw new ApiError(400, 'invalid_argument', 'Purchase order has no supplier');
      const contactId = await contactFor('suppliers', sup.id, by);
      const recv = (p.data.lines || []).filter((l: any) => num(l.received) > 0);
      if (!recv.length) throw new ApiError(400, 'invalid_argument', 'Nothing received on this purchase order yet');
      const dt = p.data.supInvoiceDate || String(p.data.receivedAt || p.data.date || todayISO()).slice(0, 10);
      const number = p.data.supInvoice || p.data.no;
      const sale = p.data.saleId ? deals.get(p.data.saleId)?.no : '';
      const payload: any = {
        Type: 'ACCPAY', Contact: { ContactID: contactId }, InvoiceNumber: number,
        Reference: [p.data.no, sale].filter(Boolean).join(' / '), Date: dt, DueDate: addDays(dt, num(sup.data.terms ?? 30)),
        LineAmountTypes: 'Exclusive', CurrencyCode: 'AUD', Status: s.billStatus || 'AUTHORISED',
        LineItems: recv.map((l: any) => {
          const it = parts.get(l.itemId) || {};
          return {
            Description: `${it.partNo || ''} ${it.description || ''}${l.supCode ? ' (' + l.supCode + ')' : ''}`.trim().slice(0, 4000) || 'Item',
            Quantity: num(l.received), UnitAmount: +num(l.price).toFixed(4), AccountCode: String(company.xeroPurch), TaxType: s.taxTypes?.purchases || 'INPUT',
          };
        }),
      };
      const prior = p.data.xeroBillId ? { InvoiceID: p.data.xeroBillId } : await existingInvoice(number, contactId);
      if (prior?.InvoiceID) payload.InvoiceID = prior.InvoiceID;
      if (prior && prior.Status && prior.Status !== 'DRAFT') {
        await mutateDoc('pos', id, x => ({ ...x, xeroBillId: prior.InvoiceID, xeroStatus: prior.Status, xeroAt: new Date().toISOString() }), by);
        out.push({ ref, ok: true, skipped: true, message: `Linked to the existing Xero bill (${prior.Status})`, xeroId: prior.InvoiceID }); continue;
      }
      const el = await postInvoice(payload, `pcs-bill-${id}-${Math.floor(Date.now() / 60000)}`);
      await mutateDoc('pos', id, x => ({
        ...x, xeroBillId: el.InvoiceID, xeroStatus: el.Status, xeroAt: new Date().toISOString(),
        history: [...(x.history || []), { at: new Date().toISOString(), by, note: `Bill sent to Xero (${el.Status})` }].slice(-60),
      }), by);
      await log('push.bill', ref, true, { invoiceId: el.InvoiceID, status: el.Status });
      out.push({ ref, ok: true, message: `Sent (${el.Status})`, xeroId: el.InvoiceID });
    } catch (e: any) {
      await log('push.bill', ref, false, { error: e.message });
      out.push({ ref, ok: false, message: e.message || 'Failed' });
    }
  }
  return out;
}

// ── expenses: spend money (paid from a mapped bank/card) or a bill ────
export async function pushExpenses(ids: string[], by: string): Promise<Result[]> {
  const s = await xeroSettings();
  const company = co((await getDoc('settings', 'company'))?.data);
  const deals = new Map((await listDocs('deals')).map(d => [d.id, d.data]));
  const contactCache = new Map<string, string>();
  const out: Result[] = [];
  for (const id of ids) {
    const e = await getDoc('expenses', id);
    const ref = e?.data.no || id;
    try {
      if (!e) throw new ApiError(404, 'not_found', 'Expense not found');
      if (e.data.xeroId) { out.push({ ref, ok: true, skipped: true, message: 'Already in Xero', xeroId: e.data.xeroId }); continue; }
      const x = e.data;
      const payee = (x.payee || '').trim() || 'Sundry supplier';
      let contactId = contactCache.get(payee);
      if (!contactId) { contactId = await findOrCreateContact({ name: payee }); contactCache.set(payee, contactId); }
      const sale = x.saleId ? deals.get(x.saleId)?.no : '';
      const taxType = x.gstFree ? (s.taxTypes?.gstFreePurchases || 'EXEMPTEXPENSES') : (s.taxTypes?.purchases || 'INPUT');
      const line: any = {
        Description: (x.description || x.category || 'Expense').slice(0, 4000), Quantity: 1, UnitAmount: +expTotal(x).toFixed(2),
        AccountCode: String(x.account || EXP_ACCT[x.category] || '429'), TaxType: taxType,
      };
      if (!x.gstFree && x.gst != null) line.TaxAmount = +expGst(x).toFixed(2);
      const reference = [x.ref, x.no, sale].filter(Boolean).join(' / ').slice(0, 255);
      const bank = s.bankMap?.[x.paidBy];
      let xeroId: string, type: string, status: string;
      if (bank && x.paidBy !== 'Personal (reimburse)') {
        const r = await xero('POST', '/BankTransactions', {
          query: { summarizeErrors: 'false' }, idempotencyKey: `pcs-exp-${id}`,
          body: { BankTransactions: [{ Type: 'SPEND', Contact: { ContactID: contactId }, BankAccount: { AccountID: bank }, Date: x.date || todayISO(),
            Reference: reference, LineAmountTypes: 'Inclusive', CurrencyCode: 'AUD', Status: 'AUTHORISED', LineItems: [line] }] },
        });
        const el = r.data?.BankTransactions?.[0];
        const errs = elementErrors(el);
        if (errs.length || !el?.BankTransactionID) throw new ApiError(400, 'xero_error', errs.join('; ') || 'Xero did not create the transaction');
        xeroId = el.BankTransactionID; type = 'SPEND'; status = el.Status;
      } else {
        const el = await postInvoice({
          Type: 'ACCPAY', Contact: { ContactID: contactId }, InvoiceNumber: x.ref || x.no,
          Reference: (x.paidBy === 'Personal (reimburse)' ? 'Reimburse staff · ' : '') + reference, Date: x.date || todayISO(),
          DueDate: x.date || todayISO(), LineAmountTypes: 'Inclusive', CurrencyCode: 'AUD', Status: s.expenseBillStatus || 'DRAFT', LineItems: [line],
        }, `pcs-exp-${id}`);
        xeroId = el.InvoiceID; type = 'ACCPAY'; status = el.Status;
      }
      let note = '';
      if (s.attachReceipts !== false && x.receiptId) {
        try { const err = await attach(type === 'SPEND' ? 'BankTransactions' : 'Invoices', xeroId, x.receiptId, `${x.no}-receipt`); if (!err) note = ' · receipt attached'; }
        catch (er: any) { note = ` · receipt not attached: ${er.message}`; }
      }
      await mutateDoc('expenses', id, d => ({ ...d, xeroId, xeroType: type, xeroStatus: status, xeroAt: new Date().toISOString() }), by);
      await log('push.expense', ref, true, { xeroId, type, status });
      out.push({ ref, ok: true, message: `${type === 'SPEND' ? 'Spend money' : 'Bill'} created (${status})${note}`, xeroId });
    } catch (er: any) {
      await log('push.expense', ref, false, { error: er.message });
      out.push({ ref, ok: false, message: er.message || 'Failed' });
    }
  }
  return out;
}

// ── payments: pull status back and close sales ────────────────────────
export async function syncPayments(by = 'xero', only?: string[]) {
  if (!(await connection())) throw new ApiError(400, 'xero_not_connected', 'Xero is not connected');
  const deals = await listDocs('deals');
  const pos = await listDocs('pos');
  const want = new Set<string>();
  for (const d of deals) for (const v of invoicesOf(d.data)) if (v.xeroInvoiceId && (!v.paid || only?.includes(v.xeroInvoiceId))) want.add(v.xeroInvoiceId);
  for (const p of pos) if (p.data.xeroBillId && !p.data.xeroPaid) want.add(p.data.xeroBillId);
  const ids = [...want].filter(i => !only || only.includes(i));
  const status = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 40) {
    const r = await xero('GET', '/Invoices', { query: { IDs: ids.slice(i, i + 40).join(','), summaryOnly: 'true' } });
    for (const inv of r.data?.Invoices || []) status.set(inv.InvoiceID, inv);
  }
  let paid = 0, closed = 0, bills = 0;
  for (const d of deals) {
    const touched = invoicesOf(d.data).some((v: any) => v.xeroInvoiceId && status.has(v.xeroInvoiceId));
    if (!touched) continue;
    await mutateDoc('deals', d.id, x => {
      let changed = false;
      const vs = invoicesOf(x).map((v: any) => {
        const st = v.xeroInvoiceId && status.get(v.xeroInvoiceId);
        if (!st) return v;
        const n = { ...v };
        if (n.xeroStatus !== st.Status || num(n.xeroAmountDue) !== num(st.AmountDue)) { n.xeroStatus = st.Status; n.xeroAmountDue = num(st.AmountDue); changed = true; }
        if (st.Status === 'PAID' && !n.paid) {
          n.paid = true; n.paidAt = xeroDate(st.FullyPaidOnDate) || todayISO(); n.paidVia = 'Xero'; changed = true; paid++;
          x.history = [...(x.history || []), { at: new Date().toISOString(), by, note: `Invoice ${n.no} paid in Xero`, stage: x.stage }].slice(-60);
        }
        if ((st.Status === 'VOIDED' || st.Status === 'DELETED') && v.xeroStatus !== st.Status) {
          x.history = [...(x.history || []), { at: new Date().toISOString(), by, note: `Invoice ${n.no} ${st.Status.toLowerCase()} in Xero`, stage: x.stage }].slice(-60);
        }
        return n;
      });
      if (!changed) return null;
      x.invoices = vs; x.invoice = null; x.updatedAt = new Date().toISOString();
      if (closeIfPaid(x, by, 'Payment recorded in Xero')) closed++;
      return x;
    }, by);
  }
  for (const p of pos) {
    const st = p.data.xeroBillId && status.get(p.data.xeroBillId);
    if (!st) continue;
    if (st.Status === 'PAID' && !p.data.xeroPaid) {
      bills++;
      await mutateDoc('pos', p.id, x => ({ ...x, xeroStatus: 'PAID', xeroPaid: true, xeroPaidAt: xeroDate(st.FullyPaidOnDate) || todayISO() }), by);
    } else if (st.Status !== p.data.xeroStatus) {
      await mutateDoc('pos', p.id, x => ({ ...x, xeroStatus: st.Status }), by);
    }
  }
  const result = { checked: ids.length, invoicesPaid: paid, salesClosed: closed, billsPaid: bills, at: new Date().toISOString() };
  await saveSettings({ lastSync: result.at, lastSyncResult: result }, by);
  await log('sync', null, true, result);
  return result;
}
