// Mock OpenID Connect sign-in provider and Xero servers for end-to-end tests.
import http from 'node:http';
import crypto from 'node:crypto';

const read = async req => { const c = []; for await (const x of req) c.push(x); return Buffer.concat(c); };
const j = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');

export function mockOidc(port, { clientId, secret, email, name }) {
  const issuer = `http://localhost:${port}/idp`;
  const codes = new Map();
  return new Promise(r => {
    const s = http.createServer(async (req, res) => {
      const u = new URL(req.url, `http://localhost:${port}`);
      if (u.pathname === '/idp/.well-known/openid-configuration') return j(res, 200, { issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token' });
      if (u.pathname === '/idp/authorize') {
        const code = crypto.randomUUID();
        codes.set(code, { nonce: u.searchParams.get('nonce'), challenge: u.searchParams.get('code_challenge'), redirect: u.searchParams.get('redirect_uri') });
        const back = new URL(u.searchParams.get('redirect_uri')); back.searchParams.set('code', code); back.searchParams.set('state', u.searchParams.get('state'));
        res.writeHead(302, { location: back.toString() }); return res.end();
      }
      if (u.pathname === '/idp/token') {
        const p = new URLSearchParams((await read(req)).toString());
        const c = codes.get(p.get('code'));
        if (!c || p.get('client_secret') !== secret || p.get('client_id') !== clientId) return j(res, 400, { error: 'invalid_grant' });
        const ch = crypto.createHash('sha256').update(p.get('code_verifier')).digest('base64url');
        if (ch !== c.challenge) return j(res, 400, { error: 'invalid_grant', error_description: 'PKCE mismatch' });
        codes.delete(p.get('code'));
        const now = Math.floor(Date.now() / 1000);
        const idt = b64u({ alg: 'none' }) + '.' + b64u({ aud: clientId, iss: issuer, email_verified: true, nonce: c.nonce, exp: now + 3600, iat: now, email: s.email, name: s.name }) + '.sig';
        return j(res, 200, { id_token: idt, access_token: 'x', token_type: 'Bearer' });
      }
      res.writeHead(404); res.end();
    });
    s.email = email; s.name = name;
    s.listen(port, () => r(s));
  });
}

export function mockXero(port, { clientId, secret }) {
  const st = {
    codes: new Set(), access: new Set(), refresh: new Set(), usedRefresh: new Set(), tenantId: 'tenant-pcs-1', connId: 'conn-1', calls: [],
    accounts: [
      ['200', 'Sales', 'REVENUE'], ['300', 'Purchases', 'DIRECTCOSTS'], ['400', 'Advertising', 'EXPENSE'], ['404', 'Bank Fees', 'EXPENSE'],
      ['412', 'Consulting & Accounting', 'EXPENSE'], ['420', 'Entertainment', 'EXPENSE'], ['429', 'General Expenses', 'EXPENSE'], ['433', 'Insurance', 'EXPENSE'],
      ['445', 'Light, Power, Heating', 'EXPENSE'], ['449', 'Motor Vehicle Expenses', 'EXPENSE'], ['453', 'Office Expenses', 'EXPENSE'], ['469', 'Rent', 'EXPENSE'],
      ['473', 'Repairs and Maintenance', 'EXPENSE'], ['485', 'Subscriptions', 'EXPENSE'], ['489', 'Telephone & Internet', 'EXPENSE'], ['493', 'Travel - National', 'EXPENSE'],
    ].map(([Code, Name, Type]) => ({ AccountID: crypto.randomUUID(), Code, Name, Type, Status: 'ACTIVE' }))
      .concat([{ AccountID: 'bank-1', Code: '090', Name: 'Business Bank Account', Type: 'BANK', Status: 'ACTIVE', BankAccountType: 'BANK' },
        { AccountID: 'card-1', Code: '091', Name: 'Business Card', Type: 'BANK', Status: 'ACTIVE', BankAccountType: 'CREDITCARD' }]),
    taxRates: [{ Name: 'GST on Income', TaxType: 'OUTPUT', Status: 'ACTIVE' }, { Name: 'GST on Expenses', TaxType: 'INPUT', Status: 'ACTIVE' },
      { Name: 'GST Free Expenses', TaxType: 'EXEMPTEXPENSES', Status: 'ACTIVE' }, { Name: 'GST Free Income', TaxType: 'EXEMPTOUTPUT', Status: 'ACTIVE' }],
    contacts: [], invoices: [], bankTx: [], attachments: [],
  };
  // remove 425 Freight so setup has something to create
  const tokens = () => { const a = crypto.randomUUID(), r = crypto.randomUUID(); st.access.add(a); st.refresh.add(r); return { access_token: a, refresh_token: r, expires_in: 1800, token_type: 'Bearer', scope: 'openid offline_access accounting.invoices' }; };
  return new Promise(r => {
    const s = http.createServer(async (req, res) => {
      const u = new URL(req.url, `http://localhost:${port}`);
      const body = await read(req);
      st.calls.push(`${req.method} ${u.pathname}${u.search}`);
      if (u.pathname === '/identity/connect/authorize') {
        const code = crypto.randomUUID(); st.codes.add(code);
        const back = new URL(u.searchParams.get('redirect_uri')); back.searchParams.set('code', code); back.searchParams.set('state', u.searchParams.get('state'));
        st.lastScope = u.searchParams.get('scope');
        res.writeHead(302, { location: back.toString() }); return res.end();
      }
      const basicOk = req.headers.authorization === 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64');
      if (u.pathname === '/connect/token') {
        if (!basicOk) return j(res, 401, { error: 'invalid_client' });
        const p = new URLSearchParams(body.toString());
        if (p.get('grant_type') === 'authorization_code') { if (!st.codes.delete(p.get('code'))) return j(res, 400, { error: 'invalid_grant' }); return j(res, 200, tokens()); }
        if (p.get('grant_type') === 'refresh_token') {
          const rt = p.get('refresh_token');
          if (!st.refresh.has(rt) || st.usedRefresh.has(rt)) return j(res, 400, { error: 'invalid_grant' });
          st.usedRefresh.add(rt); st.refreshes = (st.refreshes || 0) + 1; return j(res, 200, tokens());
        }
        return j(res, 400, { error: 'unsupported_grant_type' });
      }
      if (u.pathname === '/connect/revocation') { st.revoked = true; return j(res, 200, {}); }
      if (u.pathname === '/__pay') { const id = u.searchParams.get('id'); const inv = st.invoices.find(i => i.InvoiceID === id); inv.Status = 'PAID'; inv.AmountDue = 0; inv.FullyPaidOnDate = `/Date(${Date.UTC(2026, 10, 3)}+0000)/`; return j(res, 200, inv); }
      if (u.pathname === '/__state') return j(res, 200, st);
      if (u.pathname === '/__expire') { st.access.clear(); return j(res, 200, {}); }
      const bearer = (req.headers.authorization || '').replace('Bearer ', '');
      if (!st.access.has(bearer)) return j(res, 401, { Title: 'Unauthorized', Detail: 'TokenExpired' });
      if (u.pathname.startsWith('/connections')) {
        if (req.method === 'DELETE') { st.disconnected = true; return j(res, 204, {}); }
        return j(res, 200, [{ id: st.connId, tenantId: st.tenantId, tenantName: 'PCS (new)', tenantType: 'ORGANISATION' }]);
      }
      if (req.headers['xero-tenant-id'] !== st.tenantId) return j(res, 403, { Title: 'Forbidden', Detail: 'bad tenant' });
      const path = u.pathname.replace('/api.xro/2.0', '');
      const J = body.length && (req.headers['content-type'] || '').includes('json') ? JSON.parse(body.toString()) : null;
      if (path === '/Organisation') return j(res, 200, { Organisations: [{ Name: 'PCS (new)', CountryCode: 'AU', BaseCurrency: 'AUD', IsDemoCompany: false }] });
      if (path === '/Accounts' && req.method === 'GET') return j(res, 200, { Accounts: st.accounts });
      if (path === '/Accounts' && req.method === 'PUT') { const a = { ...J, AccountID: crypto.randomUUID(), Status: 'ACTIVE' }; st.accounts.push(a); return j(res, 200, { Accounts: [a] }); }
      if (path === '/TaxRates') return j(res, 200, { TaxRates: st.taxRates });
      if (path === '/Contacts' && req.method === 'GET') {
        const m = /Name=="(.*)"/.exec(u.searchParams.get('where') || ''); const name = m ? m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : null;
        return j(res, 200, { Contacts: st.contacts.filter(c => c.Name === name) });
      }
      if (path === '/Contacts' && req.method === 'POST') { const out = J.Contacts.map(c => { const x = { ...c, ContactID: crypto.randomUUID() }; st.contacts.push(x); return x; }); return j(res, 200, { Contacts: out }); }
      if (path === '/Invoices' && req.method === 'GET') {
        let list = st.invoices;
        if (u.searchParams.get('IDs')) { const ids = u.searchParams.get('IDs').split(','); list = list.filter(i => ids.includes(i.InvoiceID)); }
        if (u.searchParams.get('InvoiceNumbers')) list = list.filter(i => i.InvoiceNumber === u.searchParams.get('InvoiceNumbers'));
        if (u.searchParams.get('ContactIDs')) list = list.filter(i => i.Contact.ContactID === u.searchParams.get('ContactIDs'));
        return j(res, 200, { Invoices: list });
      }
      if (path === '/Invoices' && req.method === 'POST') {
        const out = J.Invoices.map(inv => {
          const errs = [];
          for (const li of inv.LineItems) { if (!st.accounts.some(a => a.Code === li.AccountCode)) errs.push({ Message: `Account code '${li.AccountCode}' is not a valid code for this document.` }); if (!st.taxRates.some(t => t.TaxType === li.TaxType)) errs.push({ Message: `bad tax ${li.TaxType}` }); }
          if (errs.length) return { ...inv, HasErrors: true, ValidationErrors: errs };
          const ex = inv.InvoiceID && st.invoices.find(i => i.InvoiceID === inv.InvoiceID);
          const total = inv.LineItems.reduce((a, l) => a + l.Quantity * l.UnitAmount * (1 - (l.DiscountRate || 0) / 100), 0) * (inv.LineAmountTypes === 'Exclusive' ? 1.1 : 1);
          if (ex) { Object.assign(ex, inv, { Total: total, AmountDue: total }); return ex; }
          const x = { ...inv, InvoiceID: crypto.randomUUID(), Total: total, AmountDue: total, Status: inv.Status || 'DRAFT' }; st.invoices.push(x); return x;
        });
        st.lastIdem = req.headers['idempotency-key'];
        return j(res, 200, { Invoices: out });
      }
      if (path === '/BankTransactions' && req.method === 'POST') { const out = J.BankTransactions.map(b => { const x = { ...b, BankTransactionID: crypto.randomUUID() }; st.bankTx.push(x); return x; }); return j(res, 200, { BankTransactions: out }); }
      const att = /^\/(Invoices|BankTransactions)\/([^/]+)\/Attachments\/(.+)$/.exec(path);
      if (att && req.method === 'PUT') { st.attachments.push({ kind: att[1], id: att[2], name: decodeURIComponent(att[3]), size: body.length, type: req.headers['content-type'] }); return j(res, 200, { Attachments: [{ FileName: att[3] }] }); }
      return j(res, 404, { Title: 'Not found', Detail: path });
    });
    s.state = st;
    s.listen(port, () => r(s));
  });
}

export function mockResend(port, key) {
  const sent = [];
  return new Promise(r => {
    const s = http.createServer(async (req, res) => {
      const body = await read(req);
      if (req.url === '/emails' && req.method === 'POST') {
        if (req.headers.authorization !== `Bearer ${key}`) return j(res, 401, { message: 'bad key' });
        const m = JSON.parse(body.toString()); m.id = 'em_' + (sent.length + 1); sent.push(m);
        if (process.env.MAIL_DUMP) { const fs = await import('node:fs'); fs.mkdirSync(process.env.MAIL_DUMP, { recursive: true }); for (const a of m.attachments || []) fs.writeFileSync(`${process.env.MAIL_DUMP}/${m.id}-${a.filename}`, Buffer.from(a.content, 'base64')); }
        return j(res, 200, { id: m.id });
      }
      j(res, 404, {});
    });
    s.sent = sent; s.listen(port, () => r(s));
  });
}

export function mockS3(port, accessKey) {
  const objects = new Map(); let failNext = false;
  return new Promise(r => {
    const s = http.createServer(async (req, res) => {
      const body = await read(req);
      if (req.url === '/__fail') { failNext = true; return j(res, 200, {}); }
      const auth = req.headers.authorization || '';
      if (!auth.startsWith(`AWS4-HMAC-SHA256 Credential=${accessKey}/`) || !/SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date/.test(auth)) { res.writeHead(403); return res.end('<Error>SignatureDoesNotMatch</Error>'); }
      if (req.method === 'PUT') {
        if (failNext) { failNext = false; res.writeHead(500); return res.end('<Error>InternalError</Error>'); }
        const sha = (await import('node:crypto')).createHash('sha256').update(body).digest('hex');
        if (sha !== req.headers['x-amz-content-sha256']) { res.writeHead(400); return res.end('<Error>XAmzContentSHA256Mismatch</Error>'); }
        objects.set(decodeURIComponent(req.url), body); res.writeHead(200); return res.end();
      }
      res.writeHead(405); res.end();
    });
    s.objects = objects; s.listen(port, () => r(s));
  });
}
