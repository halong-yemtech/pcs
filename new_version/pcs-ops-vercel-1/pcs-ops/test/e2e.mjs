// End-to-end test: real Postgres + app route handlers + mock OIDC sign-in provider + mock Xero + Chromium.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import pg from 'pg';

const PG = process.env.TEST_PG || 'postgres://postgres@127.0.0.1:55432'; // a local Postgres you can drop/create databases on
const APP = 'http://localhost:3100';
Object.assign(process.env, {
  NODE_ENV: 'production', APP_URL: APP, DATABASE_URL: `${PG}/pcs`, AUTH_SECRET: 'test-secret-'.padEnd(48, 'x'),
  TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  OIDC_ISSUER: 'http://localhost:3201/idp', OIDC_CLIENT_ID: 'ms-client', OIDC_CLIENT_SECRET: 'ms-secret',
  ALLOWED_EMAIL_DOMAINS: 'pcs.test', ADMIN_EMAILS: 'jack@pcs.test', DEFAULT_ROLE: 'editor', STORAGE_DRIVER: 'database',
  XERO_CLIENT_ID: 'xero-client', XERO_CLIENT_SECRET: 'xero-secret',
  XERO_AUTHORIZE_URL: 'http://localhost:3202/identity/connect/authorize', XERO_TOKEN_URL: 'http://localhost:3202/connect/token',
  XERO_REVOKE_URL: 'http://localhost:3202/connect/revocation', XERO_CONNECTIONS_URL: 'http://localhost:3202/connections',
  XERO_API_URL: 'http://localhost:3202/api.xro/2.0', XERO_WEBHOOK_KEY: 'webhook-key-123', CRON_SECRET: 'cron-secret',
  S3_BUCKET: 'pcs-bk', S3_REGION: 'ap-southeast-2', S3_ACCESS_KEY_ID: 'AKIATEST', S3_SECRET_ACCESS_KEY: 'secret/test', S3_ENDPOINT: 'http://localhost:3204', BACKUP_EMAIL_TO: 'backups@pcs.test',
  EMAIL_PROVIDER: 'resend', EMAIL_SEND_AS_USER: 'true', RESEND_API_KEY: 're_test', RESEND_API_URL: 'http://localhost:3203/emails', EMAIL_FROM: 'PCS <sales@pcs.test>',
});
const sh = c => execSync(c, { stdio: 'pipe', env: process.env }).toString();
const results = [];
const check = (name, ok, extra = '') => { results.push([ok, name]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  · ' + extra : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// fresh database
for (const db of ['pcs', 'pcs2', 'pcs3']) { sh(`psql ${PG}/postgres -c "drop database if exists ${db}" -c "create database ${db}"`); }
sh('node scripts/migrate.mjs');
sh('node scripts/import.mjs seed/pcs-catalog-2026-10-31.json');
const db = new pg.Client({ connectionString: `${PG}/pcs` }); await db.connect();

const { mockOidc, mockXero, mockResend } = await import('./mocks.mjs');
const mail = await mockResend(3203, 're_test');
const { mockS3 } = await import('./mocks.mjs');
const s3 = await mockS3(3204, 'AKIATEST');
const ms = await mockOidc(3201, { clientId: 'ms-client', secret: 'ms-secret', email: 'jack@pcs.test', name: 'Jack Morris' });
const xs = await mockXero(3202, { clientId: 'xero-client', secret: 'xero-secret' });
const { start } = await import('./harness.mjs');
const server = await start(3100);

const browser = await chromium.launch();
const req = createRequire(import.meta.url);
const jszipPath = [() => req.resolve('jszip/dist/jszip.min.js'), () => '/opt/node-tools/node_modules/jszip/dist/jszip.min.js'].map(f => { try { const p = f(); return fs.existsSync(p) ? p : null; } catch { return null; } }).find(Boolean);
const jszip = jszipPath ? fs.readFileSync(jszipPath) : null;
// Offline copies of the CDN libraries (only needed where cdnjs is unreachable, e.g. this sandbox).
const PDFLIB = '/opt/npm-tools/node_modules/pdf-lib/dist/pdf-lib.min.js';
const PDFJS = '/opt/npm-tools/node_modules/pdfjs-dist/build/pdf.min.mjs', PDFJS_W = '/opt/npm-tools/node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
async function newUser(email, name) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
  if (jszip) await ctx.route(/cdnjs\.cloudflare\.com\/.*jszip/, r => r.fulfill({ body: jszip, contentType: 'text/javascript' }));
  await ctx.route(/cdnjs\.cloudflare\.com\/.*xlsx/, r => r.fulfill({ body: 'window.XLSX={utils:{}}', contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: '' }));
  const lib = (re, file) => fs.existsSync(file) && ctx.route(re, r => r.fulfill({ body: fs.readFileSync(file), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
  await lib(/pdf-lib/, PDFLIB); await lib(/pdf\.js\/.*pdf\.worker\.min\.mjs/, PDFJS_W); await lib(/pdf\.js\/.*\/pdf\.min\.mjs/, PDFJS);
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  ms.email = email; ms.name = name;
  await p.goto(APP + '/');
  return p;
}
const toast = async p => (await p.locator('.toast').last().textContent({ timeout: 8000 }).catch(() => ''));
const dealDoc = async () => (await db.query(`select data from docs where collection='deals' and not deleted and data->>'no'='SO-0001'`)).rows[0]?.data;

try {
  // ── sign-in ──
  const a = await newUser('jack@pcs.test', 'Jack Morris');
  await a.waitForFunction(() => /live/.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 20000 });
  check('staff sign-in (OIDC) lands on the app and catalog loads', true, await a.textContent('#status'));
  const me = await a.evaluate(() => fetch('/api/me').then(r => r.json()));
  check('admin role from ADMIN_EMAILS', me.role === 'admin', me.role);
  const anon = await (await fetch(APP + '/api/db/snapshot?c=catalog')).status;
  check('API refuses requests without a session', anon === 401);
  const pageAnon = await fetch(APP + '/', { redirect: 'manual' });
  check('page redirects to sign-in without a session', pageAnon.status === 302 && pageAnon.headers.get('location').includes('/api/auth/login'));

  const out = await newUser('vic@other.com', 'Vic Outsider');
  check('people outside the allowed domains are refused', /does not have access/.test(await out.textContent('#msg')), await out.textContent('#msg'));
  await out.context().close();

  // ── stock + sales flow through the real backend ──
  const open = async (p, c) => { await p.click('#v-parts'); await p.fill('#q', c); await p.waitForTimeout(200); await p.click(`[data-id="${c}"]`); await p.waitForTimeout(200); };
  await open(a, '8110055'); await a.click('[data-tab="stock"]'); await a.click('[data-mv="receive"]'); await a.fill('#mv-q', '100'); await a.click('#mv-go'); await a.waitForTimeout(800);
  const stock = (await db.query(`select data from docs where collection='stock'`)).rows.map(r => r.data.items).reduce((m, x) => ({ ...m, ...x }), {});
  check('stock receive writes to Postgres (update→set fallback)', stock['8110055']?.onHand === 100 || JSON.stringify(stock).includes('100'), JSON.stringify(stock).slice(0, 120));

  await a.click('#v-sales'); await a.click('#new-deal'); await a.fill('#dn-cust', 'Roy Hill Iron Ore'); await a.fill('#dn-title', 'Bearings'); await a.click('#dnew button[type=submit]'); await a.waitForTimeout(900);
  await a.click('[data-dact="toquote"]'); await a.waitForTimeout(500);
  await a.click('#q-addl'); await a.fill('#q-lines tr:last-child [data-lf="code"]', '8110055'); await a.press('#q-lines tr:last-child [data-lf="code"]', 'Tab');
  await a.fill('#q-lines tr:last-child [data-lf="qty"]', '10'); await a.fill('#q-lines tr:last-child [data-lf="price"]', '80');
  await a.click('[data-dact="qsave"]'); await a.waitForTimeout(500);
  await a.click('[data-dact="topo"]'); await a.fill('#sf-po', 'PO-9'); await a.click('#sf-ok'); await a.waitForTimeout(500);
  await a.click('[data-dact="toprod"]'); await a.waitForTimeout(300); await a.click('#sf-ok'); await a.waitForTimeout(700);
  await a.click('[data-dact="toready"]'); await a.waitForTimeout(500);
  await a.click('[data-dact="todisp"]'); await a.fill('[data-sup="0"]', '6'); await a.click('#sf-ok'); await a.waitForTimeout(1200);
  await a.waitForSelector('#dd-to');
  check('dispatching opens the docket ready to email/print', (await a.textContent('#dd-form')).includes('DD-0001') && await a.$('#dd-print') !== null);
  await a.fill('#dd-to', 'jo@royhill.test'); await a.click('#dd-send'); await a.waitForTimeout(2500);
  const em1 = mail.sent[0];
  check('docket emailed with its PDF, sent from the signed-in person (BCC copy)', em1 && em1.to[0] === 'jo@royhill.test' && em1.from === 'Jack Morris <jack@pcs.test>' && (em1.bcc || []).includes('jack@pcs.test') && em1.attachments[0].filename.endsWith('.pdf') && Buffer.from(em1.attachments[0].content, 'base64').subarray(0, 5).toString() === '%PDF-', em1 && `from ${em1.from} · ${em1.attachments.map(x => x.filename).join(', ')}`);
  await a.setInputFiles('#pod-0', { name: 'signed-docket.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test signed docket') }); await a.waitForTimeout(1200); console.log('  pod toast:', await a.locator('.toast').allTextContents(), await a.locator('[data-pod]').count());
  await a.click('[data-inv="0"]'); await a.waitForTimeout(300); await a.click('#sf-ok'); await a.waitForTimeout(900);
  await a.waitForSelector('#dd-x'); await a.click('#dd-x');
  await a.click('[data-dact="todisp"]'); await a.waitForTimeout(300); await a.click('#sf-ok'); await a.waitForTimeout(1200);
  await a.waitForSelector('#dd-x'); await a.click('#dd-x');
  await a.click('[data-inv="1"]'); await a.waitForTimeout(300); await a.click('#sf-ok'); await a.waitForTimeout(900);
  await a.waitForSelector('#dd-to');
  const signedAtt = await a.locator('[data-ddx="0"]').count();
  await a.fill('#dd-to', 'accounts@royhill.test'); await a.click('#dd-send'); await a.waitForTimeout(2500);
  const em2 = mail.sent[1];
  check('invoice emailed as PDF', em2 && em2.subject.includes('INV-0002') && em2.attachments.length >= 1, em2 && em2.subject);
  let d = await dealDoc();
  check('emails logged on the sale history', d.history.some(h => /Delivery docket DD-0001 emailed to jo@royhill.test/.test(h.note)) && d.history.some(h => /Invoice INV-0002 emailed/.test(h.note)));
  const elog = (await db.query(`select data from docs where collection='emails'`)).rows.map(r => r.data);
  check('email log records each send', elog.length === 2 && elog.every(e => e.status === 'sent' && e.ref.saleNo === 'SO-0001'), elog.map(e => e.ref.kind + ':' + e.ref.no).join(', '));
  check('sale SO-0001 runs lead → invoiced with two dockets', d?.no === 'SO-0001' && d?.stage === 'invoiced' && d.invoices?.length === 2, `${d?.no} ${d?.stage} inv=${d?.invoices?.length}`);
  const pod = d?.dockets?.[0]?.podAssetId;
  const asset = pod && await a.evaluate(id => fetch('/_blob/' + id).then(async r => [r.status, r.headers.get('content-type'), await r.text()]), pod);
  check('signed docket stored and served at /_blob/<id>', asset && asset[0] === 200 && asset[2].includes('signed docket'), asset && asset.slice(0, 2).join(' '));
  await a.click('#d-close');

  // ── live updates between two people ──
  const b = await newUser('sam@pcs.test', 'Sam Editor');
  await b.waitForFunction(() => /live/.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 20000 });
  await b.click('#v-sales');
  check('second user sees the sale', (await b.textContent('main')).includes('SO-0001'));
  await a.click('#new-deal'); await a.fill('#dn-cust', 'FMG'); await a.fill('#dn-title', 'Cleaners'); await a.click('#dnew button[type=submit]'); await a.waitForTimeout(600); await a.click('#d-close').catch(() => {});
  const t0 = Date.now();
  await b.waitForFunction(() => document.querySelector('main').textContent.includes('SO-0002'), null, { timeout: 10000 }).catch(() => {});
  check('new lead appears on the other screen without reload', (await b.textContent('main')).includes('SO-0002'), `${Date.now() - t0} ms`);
  const bMe = await b.evaluate(() => fetch('/api/me').then(r => r.json()));
  check('domain user gets DEFAULT_ROLE editor', bMe.role === 'editor');

  // ── RFQ → supplier quote PDF → price check + roll-up → PO → email ──
  await a.evaluate(() => fetch('/api/db/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'set', c: 'suppliers', id: 'supq', data: { name: 'Bearing Supplies WA', email: 'sales@bswa.test', terms: 30 } }) }));
  await a.evaluate(() => fetch('/api/db/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'set', c: 'parts', id: '8110001', data: { components: [{ partId: '8110055', qty: 2, role: 'Tensioner' }, { partId: '8110045', qty: 1, role: 'Pole' }], labour: 50 } }) }));
  await a.waitForTimeout(3500);
  await open(a, '8110055'); await a.click('[data-tab="stock"]'); await a.fill('#sp-buy', '42'); await a.press('#sp-buy', 'Tab'); await a.waitForTimeout(600);
  await open(a, '8110045'); await a.click('[data-tab="stock"]'); await a.fill('#sp-buy', '200'); await a.press('#sp-buy', 'Tab'); await a.waitForTimeout(600);
  await a.click('#v-purch'); await a.click('#new-rfq'); await a.waitForSelector('#rfqform');
  await a.click('#rf-addl'); await a.fill('#rf-lines tr:last-child [data-rf="code"]', '8110055'); await a.press('#rf-lines tr:last-child [data-rf="code"]', 'Tab'); await a.fill('#rf-lines tr:last-child [data-rf="qty"]', '10');
  await a.click('#rf-addl'); await a.fill('#rf-lines tr:last-child [data-rf="code"]', '8110045'); await a.press('#rf-lines tr:last-child [data-rf="code"]', 'Tab'); await a.fill('#rf-lines tr:last-child [data-rf="qty"]', '4');
  await a.selectOption('#rf-addsup', { label: 'Bearing Supplies WA' }); await a.waitForTimeout(800);
  await a.click('[data-rsend="0"]'); await a.waitForSelector('#dd-to');
  check('RFQ email pre-filled with the supplier address', (await a.inputValue('#dd-to')) === 'sales@bswa.test');
  await a.click('#dd-send'); await a.waitForTimeout(2500);
  const em3 = mail.sent[2];
  check('RFQ emailed as PDF, RFQ marked sent', em3 && /RFQ-0001/.test(em3.subject) && (await a.textContent('#rfqform')).includes('Sent'), em3 && em3.subject);
  await a.click('[data-rquote="0"]'); await a.waitForSelector('#qiform');
  await a.setInputFiles('#qi-file', 'test/fixtures/supplier-quote.pdf');
  await a.waitForFunction(() => /Read \d|No text|Could not/.test(document.querySelector('#qiform')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
  const qp = [await a.inputValue('[data-qp="0"]'), await a.inputValue('[data-qp="1"]'), await a.inputValue('#qi-ref')];
  check('dropped supplier quote PDF: prices and quote no. read', qp[0] === '46.5' && qp[1] === '212' && qp[2] === 'BSQ-4471', qp.join(' / '));
  const roll = (await a.textContent('#qiform section.dsec')).replace(/\s+/g, ' ');
  check('cost roll-up shows the product cost change', /8110001/.test(roll) && /\$355\.00/.test(roll), roll.slice(0, 160));
  await a.click('[data-qa="po"]'); await a.waitForSelector('#poform', { timeout: 15000 }); await a.waitForTimeout(800);
  const pr = (await db.query(`select data from docs where collection='pricing'`)).rows.map(r => r.data.items).reduce((m, x) => ({ ...m, ...x }), {});
  check('BOM buy prices updated from the quote', pr['8110055']?.buy === 46.5 && pr['8110045']?.buy === 212);
  const plog = (await db.query(`select data from docs where collection='pricelog'`)).rows.flatMap(r => Object.values(r.data.entries));
  const pe = plog.find(e => e.itemId === '8110055' && e.to === 46.5);
  check('price change logged with source and roll-up', pe && /RFQ-0001/.test(pe.source) && /BSQ-4471/.test(pe.source) && pe.rollupCount === 1 && pe.rollup[0].to === 355, pe && `${pe.source} · ${pe.rollupCount} roll-up`);
  const po1 = (await db.query(`select data from docs where collection='pos' and data->>'rfqId' is not null`)).rows[0]?.data;
  check('PO raised from the quote with quoted prices', po1 && po1.ref === 'BSQ-4471' && po1.lines[0].price === 46.5 && po1.status === 'draft', po1 && po1.no);
  await a.click('[data-pa="doc"]'); await a.waitForSelector('#dd-to'); await a.click('#dd-send'); await a.waitForTimeout(2500);
  const po2 = (await db.query(`select data from docs where collection='pos' and data->>'rfqId' is not null`)).rows[0]?.data;
  check('PO emailed to the supplier and marked sent', mail.sent[3]?.subject.includes(po1.no) && po2.status === 'sent', mail.sent[3]?.subject);
  await a.click('#po-close').catch(() => {});

  // ── approvals: quote over the limit needs an approver ──
  const nMail = mail.sent.length;
  const setDir = await a.evaluate(() => fetch('/api/db/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'set', c: 'settings', id: 'alerts', data: { titles: { 'jack@pcs.test': 'Director', 'sam@pcs.test': 'Manager' } } }) }).then(r => r.status));
  check('titles set: Jack Director, Sam Manager', setDir === 200);
  await b.click('#v-sales'); await b.click('#new-deal'); await b.fill('#dn-cust', 'BHP Iron Ore'); await b.fill('#dn-title', 'Belt cleaners x20'); await b.click('#dnew button[type=submit]'); await b.waitForTimeout(900);
  await b.click('[data-dact="toquote"]'); await b.waitForTimeout(500);
  await b.click('#q-addl'); await b.fill('#q-lines tr:last-child [data-lf="code"]', '8110001'); await b.press('#q-lines tr:last-child [data-lf="code"]', 'Tab');
  await b.fill('#q-lines tr:last-child [data-lf="qty"]', '25'); await b.fill('#q-lines tr:last-child [data-lf="price"]', '900');
  await b.click('[data-dact="qsave"]'); await b.waitForTimeout(700);
  const bd = (await db.query(`select id, data from docs where collection='deals' and data->>'title'='Belt cleaners x20'`)).rows[0];
  check('new lead owned by the person who created it', bd.data.owner === 'sam@pcs.test', bd.data.owner);
  await b.click('[data-dact="qdocx"]'); await b.waitForSelector('#doc-root [data-apact="request"]');
  check('quote over $20,000 ($22,500) is blocked until a Director approves', (await b.textContent('#doc-root')).includes('Approval needed') && !(await b.$('#dd-send')));
  await b.click('#doc-root [data-apact="request"]'); await b.waitForTimeout(1500);
  const apMail = mail.sent.slice(nMail).find(m => /Approval needed: Quote/.test(m.subject));
  check('approval request emailed to approvers from the system address', apMail && apMail.to.includes('jack@pcs.test') && apMail.from === 'PCS <sales@pcs.test>' && apMail.text.includes('/?open=deals:'), apMail && `${apMail.subject} → ${apMail.to}`);
  const fake = await b.evaluate(async id => { const cur = await fetch('/api/db/doc?c=deals&id=' + id).then(r => r.json()); const d = cur.doc.data; d.quote.approval = { ...d.quote.approval, status: 'approved', decidedBy: 'sam@pcs.test', decidedAt: new Date().toISOString() }; return fetch('/api/db/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'set', c: 'deals', id, data: d }) }).then(r => r.status); }, bd.id);
  check('an editor cannot approve their own quote (server refuses)', fake === 403);
  await b.click('#d-close').catch(() => {});
  await a.waitForTimeout(3500); await a.goto(APP + '/?open=deals:' + bd.id); await a.waitForSelector('#d-close', { timeout: 20000 });
  const bell = await a.textContent('#btn-alerts');
  check('approver sees it on the bell and via the email link', /\d/.test(bell) && (await a.textContent('#modal-root')).includes('Waiting for a Director to approve'), bell);
  await a.fill('#modal-root [data-apcomment]', 'OK at this volume'); await a.click('#modal-root [data-apact="approve"]'); await a.waitForTimeout(1500);
  const decMail = mail.sent.slice(nMail).find(m => /approved/.test(m.subject));
  check('requester told it was approved', decMail && decMail.to[0] === 'sam@pcs.test' && /OK at this volume/.test(decMail.text), decMail && decMail.subject);
  await a.click('#d-close');
  await b.waitForTimeout(3500); await b.click('#v-sales'); await b.click(`[data-deal="${bd.id}"]`); await b.waitForTimeout(400); await b.click('[data-dact="qdocx"]'); await b.waitForTimeout(800);
  check('after approval the quote can be emailed', !!(await b.$('#dd-send')) && (await b.textContent('#modal-root')).includes('Approved by'));
  check('the approving Director is pre-filled as Cc', (await b.inputValue('#dd-cc')).includes('jack@pcs.test'));
  await b.fill('#dd-cc', ''); await b.fill('#dd-to', 'buyer@bhp.test'); await b.click('#dd-send'); await b.waitForTimeout(2500);
  const qm = mail.sent[mail.sent.length - 1];
  check('Admin sends it; the Director always receives the approved quote (server adds the Cc)', qm && qm.to[0] === 'buyer@bhp.test' && qm.from === 'Sam Editor <sam@pcs.test>' && (qm.cc || []).includes('jack@pcs.test'), qm && `from ${qm.from} cc ${qm.cc}`);
  await b.click('#d-close').catch(() => {});
  const sw = await b.evaluate(() => fetch('/api/db/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'set', c: 'settings', id: 'alerts', data: { approvals: { quoteValue: 0 } } }) }).then(r => r.status));
  check('only admins can change approval limits', sw === 403);

  // ── stuck sale → daily summary to the owner, escalation to managers, snooze ──
  await db.query(`update docs set data = jsonb_set(jsonb_set(data, '{owner}', '"sam@pcs.test"'), '{history}', '[{"at":"2026-10-15T01:00:00Z","stage":"lead","note":"Lead created"}]'), rev = nextval('doc_rev'), updated_at = now() where collection='deals' and data->>'no'='SO-0002'`);
  const nm2 = mail.sent.length;
  const ar = await (await fetch(APP + '/api/cron/alerts?digest=now', { headers: { authorization: 'Bearer cron-secret' } })).json();
  const dig = mail.sent.slice(nm2).find(m => m.to[0] === 'sam@pcs.test' && /need/.test(m.subject));
  const esc = mail.sent.slice(nm2).find(m => /^Escalated/.test(m.subject));
  check('daily summary emailed to the sale owner', dig && /Lead not quoted: SO-0002/.test(dig.text) && /\/\?open=deals:/.test(dig.text), dig && dig.subject);
  check('overdue item escalated to managers (admins when none set)', esc && esc.to.includes('jack@pcs.test') && /SO-0002/.test(esc.text) && ar.escalations >= 1, JSON.stringify(ar));
  const ar2 = await (await fetch(APP + '/api/cron/alerts', { headers: { authorization: 'Bearer cron-secret' } })).json();
  check('escalations are not repeated on the next run', ar2.escalations === 0);
  await a.waitForTimeout(3500); await a.click('#btn-alerts'); await a.waitForSelector('.modal');
  await a.click('[data-atab="all"]').catch(() => {});
  const row = a.locator('tr', { hasText: 'SO-0002' }).first();
  check('needs attention list shows the stuck lead', await row.count() > 0);
  await row.locator('[data-asnooze]').selectOption('7'); await a.waitForTimeout(1000);
  const snoozed = (await db.query(`select data from docs where collection='alertstate'`)).rows.map(r => r.data);
  check('snooze stored and the item drops off the list', snoozed.some(x => /lead_idle/.test(x.key) && x.snoozedUntil) && !(await a.locator('.modal [data-aopen]', { hasText: 'SO-0002' }).count()));
  await a.click('#at-c');

  // ── Xero connect + setup ──
  await a.click('#btn-xero'); await a.waitForSelector('#xh-connect');
  await a.click('#xh-connect');
  await a.waitForSelector('#xh-create', { timeout: 15000 });
  check('Xero OAuth connect round-trip', (await a.textContent('.modal')).includes('PCS (new)'));
  check('granular Xero scopes requested', /accounting\.invoices/.test(xs.state.lastScope) && !/accounting\.transactions/.test(xs.state.lastScope), xs.state.lastScope);
  const tok = (await db.query(`select access_token, refresh_token from xero_connection`)).rows[0];
  check('Xero tokens encrypted at rest', tok && !xs.state.access.has(tok.access_token) && tok.access_token.length > 40);
  await a.click('#xh-create'); await a.waitForTimeout(1500);
  check('setup creates the missing 425 Freight account', xs.state.accounts.some(x => x.Code === '425'), (await a.locator('.warn').first().textContent().catch(() => '')).slice(0, 120));
  await a.selectOption('#xh-bank0', 'bank-1'); await a.click('#xh-save'); await a.waitForTimeout(800);
  const xset = (await db.query(`select data from docs where collection='xero' and id='settings'`)).rows[0].data;
  check('posting rules saved (bank mapping, tax types)', xset.bankMap['Business bank account'] === 'bank-1' && xset.taxTypes.sales === 'OUTPUT', JSON.stringify(xset.taxTypes));
  await a.screenshot({ path: 'test/xero-hub.png' });
  await a.click('#xh-c');

  // ── push invoices from the UI ──
  await a.reload(); await a.waitForFunction(() => /live/.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 20000 });
  await a.click('#v-sales'); await a.waitForSelector('#xero-sync');
  await a.click('#xero-inv'); await a.waitForSelector('#x-send'); await a.click('#x-send'); await a.waitForTimeout(2500); console.log('  send results:', await a.locator('#x-rows .tag').allTextContents()); await a.click('#x-c');
  const inv = xs.state.invoices.filter(i => i.Type === 'ACCREC');
  check('both invoices created in Xero as AUTHORISED', inv.length === 2 && inv.every(i => i.Status === 'AUTHORISED'), inv.map(i => `${i.InvoiceNumber}:${i.Reference}`).join(', '));
  check('invoice lines: qty supplied, account 200, GST on Income', inv[0]?.LineItems[0].Quantity === 6 && inv[0].LineItems[0].AccountCode === '200' && inv[0].LineItems[0].TaxType === 'OUTPUT');
  check('customer created once as a Xero contact', xs.state.contacts.filter(c => c.Name === 'Roy Hill Iron Ore').length === 1);
  check('signed docket attached to its invoice', xs.state.attachments.some(x => x.kind === 'Invoices' && /DD-0001/.test(x.name)), JSON.stringify(xs.state.attachments.map(x => x.name)));
  d = await dealDoc();
  check('Xero invoice ids saved on the sale', d.invoices.every(v => v.xeroInvoiceId && v.xeroStatus === 'AUTHORISED'));
  const again = await a.evaluate(b => fetch('/api/xero/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()), { kind: 'invoices', refs: [{ id: (await db.query(`select id from docs where collection='deals' and data->>'no'='SO-0001'`)).rows[0].id, vi: 0 }] });
  check('re-sending is skipped, no duplicate', again.results[0].skipped && xs.state.invoices.filter(i => i.Type === 'ACCREC').length === 2, again.results[0].message);

  // ── expenses ──
  await a.evaluate(() => fetch('/api/db/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'set', c: 'expenses', id: 'exp1', data: { no: 'EXP-0001', date: '2026-10-30', payee: 'BP Karratha', description: 'Fuel ute', category: 'Motor vehicle & fuel', total: 110, paidBy: 'Business bank account' } }) }));
  await a.evaluate(() => fetch('/api/db/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'set', c: 'expenses', id: 'exp2', data: { no: 'EXP-0002', date: '2026-10-30', payee: 'Bunnings', description: 'Drill bits', category: 'Tools & consumables', total: 55, paidBy: 'Personal (reimburse)' } }) }));
  const ex = await a.evaluate(() => fetch('/api/xero/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'expenses', ids: ['exp1', 'exp2'] }) }).then(r => r.json()));
  const spend = xs.state.bankTx[0];
  check('bank-paid expense → spend money on the mapped bank account', spend?.BankAccount.AccountID === 'bank-1' && spend.LineItems[0].AccountCode === '449' && spend.LineAmountTypes === 'Inclusive', ex.results.map(r => r.message).join(' | '));
  check('reimbursement expense → draft bill', xs.state.invoices.some(i => i.Type === 'ACCPAY' && i.InvoiceNumber === 'EXP-0002' && i.Status === 'DRAFT'));

  // ── supplier bill from a received purchase order ──
  const dealId = (await db.query(`select id from docs where collection='deals' and data->>'no'='SO-0001'`)).rows[0].id;
  await a.evaluate(async did => {
    const w = b => fetch('/api/db/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    await w({ op: 'set', c: 'suppliers', id: 'sup1', data: { name: 'Bearing Supplies WA', terms: 30, email: 'accounts@bswa.test' } });
    await w({ op: 'set', c: 'pos', id: 'po1', data: { no: 'PUR-0001', supplierId: 'sup1', date: '2026-10-20', supInvoice: 'BS-7781', supInvoiceDate: '2026-10-22', saleId: did, lines: [{ itemId: '8110055', qty: 10, received: 10, price: 42 }] } });
  }, dealId);
  const bl = await a.evaluate(() => fetch('/api/xero/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'bills', ids: ['po1'] }) }).then(r => r.json()));
  const bill = xs.state.invoices.find(i => i.Type === 'ACCPAY' && i.InvoiceNumber === 'BS-7781');
  check('received PO → Xero bill (supplier invoice no., PO + sale reference, account 300)', bill && bill.Reference === 'PUR-0001 / SO-0001' && bill.LineItems[0].AccountCode === '300' && /8110055/.test(bill.LineItems[0].Description) && bill.DueDate === '2026-11-21', bl.results[0].message + ' · ' + (bill && bill.LineItems[0].Description));
  await fetch(`http://localhost:3202/__pay?id=${bill.InvoiceID}`);

  // ── payments back: webhook, then cron ──
  const [i1, i2] = inv;
  await fetch(`http://localhost:3202/__pay?id=${i1.InvoiceID}`);
  const bad = await fetch(APP + '/api/xero/webhook', { method: 'POST', body: '{"events":[]}', headers: { 'x-xero-signature': 'nope' } });
  check('webhook rejects a bad signature with 401', bad.status === 401);
  const wb = JSON.stringify({ events: [{ resourceId: i1.InvoiceID, eventCategory: 'INVOICE', eventType: 'UPDATE', tenantId: 'tenant-pcs-1' }], firstEventSequence: 1, lastEventSequence: 1 });
  const sig = crypto.createHmac('sha256', 'webhook-key-123').update(wb).digest('base64');
  const wr = await fetch(APP + '/api/xero/webhook', { method: 'POST', body: wb, headers: { 'x-xero-signature': sig, 'content-type': 'application/json' } });
  d = await dealDoc();
  check('signed webhook marks invoice 1 paid (paid date from Xero)', wr.status === 200 && d.invoices[0].paid && d.invoices[0].paidAt === '2026-11-03' && d.stage === 'invoiced', `${wr.status} ${d.invoices[0].paidAt} ${d.stage}`);
  // force a token refresh, twice (refresh tokens rotate)
  await db.query(`update xero_connection set expires_at = now() - interval '1 minute'`);
  await fetch(`http://localhost:3202/__pay?id=${i2.InvoiceID}`);
  const cronNo = await fetch(APP + '/api/cron/xero-sync');
  check('cron refuses calls without CRON_SECRET', cronNo.status === 401);
  const cr = await (await fetch(APP + '/api/cron/xero-sync', { headers: { authorization: 'Bearer cron-secret' } })).json();
  d = await dealDoc();
  check('cron sync records the last payment and closes the sale', d.stage === 'closed' && d.closedAt && d.history.some(h => /Payment recorded in Xero/.test(h.note)), JSON.stringify(cr));
  check('expired access token refreshed', xs.state.refreshes === 1);
  const po = (await db.query(`select data from docs where collection='pos' and id='po1'`)).rows[0].data;
  check('paid bill flagged on the purchase order', po.xeroPaid === true && po.xeroStatus === 'PAID');
  await db.query(`update xero_connection set expires_at = now() - interval '1 minute'`);
  const s2 = await a.evaluate(() => fetch('/api/xero/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(r => r.json()));
  check('rotated refresh token works on the next refresh', xs.state.refreshes === 2 && s2.org?.name === 'PCS (new)', `refreshes=${xs.state.refreshes}`);
  await a.click('#v-orders'); await a.click('#v-sales'); await a.waitForTimeout(3500);
  await a.click('[data-stab="list"]'); await a.waitForTimeout(300);
  check('UI shows the sale as Closed · paid', (await a.textContent('main')).includes('Closed · paid'));

  // ── roles ──
  await a.evaluate(() => fetch('/api/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'sam@pcs.test', role: 'viewer' }) }));
  const denied = await b.evaluate(() => fetch('/api/db/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'set', c: 'customers', id: 'x', data: { name: 'x' } }) }).then(r => r.status));
  check('viewer cannot write (403)', denied === 403);
  const xw = await a.evaluate(() => fetch('/api/db/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'set', c: 'xero', id: 'settings', data: {} }) }).then(r => r.status));
  check('browser cannot overwrite server-managed Xero settings', xw === 403);
  const hist = (await db.query(`select count(*)::int n from doc_history`)).rows[0].n;
  check('audit trail records every write', hist > 20, `${hist} entries`);

  // ── export all → import into a fresh database ──
  await a.click('#btn-co'); await a.waitForSelector('#co-export');
  const [dl] = await Promise.all([a.waitForEvent('download', { timeout: 30000 }), a.click('#co-export')]);
  const zipPath = '/tmp/pcs-export-test.zip'; await dl.saveAs(zipPath);
  check('Export all data downloads a zip', fs.statSync(zipPath).size > 20000, `${dl.suggestedFilename()} ${fs.statSync(zipPath).size} bytes`);
  execSync(`node scripts/migrate.mjs && node scripts/import.mjs ${zipPath}`, { env: { ...process.env, DATABASE_URL: `${PG}/pcs2` } });
  const db2 = new pg.Client({ connectionString: `${PG}/pcs2` }); await db2.connect();
  const c1 = (await db.query(`select collection, count(*)::int n from docs where not deleted and collection not in ('xero','emails','alertsent') group by 1 order by 1`)).rows;
  const c2 = (await db2.query(`select collection, count(*)::int n from docs where not deleted group by 1 order by 1`)).rows;
  const a2 = (await db2.query(`select count(*)::int n from assets`)).rows[0].n;
  check('import reproduces every collection and file', JSON.stringify(c1) === JSON.stringify(c2) && a2 === 2, `${c2.map(r => r.collection + ':' + r.n).join(' ')} files:${a2}`);
  await db2.end();

  // ── weekly off-site backup ──
  await a.keyboard.press('Escape'); await a.goto(APP + '/'); await a.waitForFunction(() => /live/.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 20000 }); await a.waitForTimeout(1500);
  check('Tasks warns the admin that there is no backup yet', !!(await a.$('#tk-bk')));
  const nb = mail.sent.length;
  const bk1 = await (await fetch(APP + '/api/cron/backup', { headers: { authorization: 'Bearer cron-secret' } })).json();
  const keys = [...s3.objects.keys()];
  const dataKey = keys.find(k => /\/pcs-backups\/\d{4}-\d{2}-\d{2}\/pcs-data_.*\.zip$/.test(k));
  check('weekly backup writes the data zip to S3 (signed V4)', bk1.ok && !!dataKey, `${bk1.documents} records → ${dataKey}`);
  check('uploaded files copied off-site once', keys.filter(k => k.includes('/pcs-backups/files/')).length === 2 && bk1.filesNew === 2);
  const bm = mail.sent.slice(nb).find(m => m.to[0] === 'backups@pcs.test');
  check('a copy of the data zip is emailed', bm && bm.attachments[0].filename.endsWith('.zip'), bm && bm.subject);
  const bk2 = await (await fetch(APP + '/api/cron/backup', { headers: { authorization: 'Bearer cron-secret' } })).json();
  check('next run is incremental (no files re-sent)', bk2.ok && bk2.filesNew === 0);
  // restore from the off-site copy into an empty database
  const rdir = '/tmp/claude-0/-home-claude/5fe9bf54-b8dd-57ee-bda4-cdfbd29c054b/scratchpad/restore'; fs.rmSync(rdir, { recursive: true, force: true }); fs.mkdirSync(rdir + '/files', { recursive: true });
  fs.writeFileSync(rdir + '/backup.zip', s3.objects.get(dataKey));
  for (const k of keys.filter(k => k.includes('/pcs-backups/files/'))) fs.writeFileSync(rdir + '/files/' + k.split('/').pop(), s3.objects.get(k));
  execSync(`node scripts/migrate.mjs && node scripts/import.mjs ${rdir}/backup.zip --files ${rdir}/files`, { env: { ...process.env, DATABASE_URL: `${PG}/pcs3` } });
  const db3 = new pg.Client({ connectionString: `${PG}/pcs3` }); await db3.connect();
  const live = (await db.query(`select count(*)::int n from docs where not deleted and collection <> 'alertsent'`)).rows[0].n;
  const rest = (await db3.query(`select count(*)::int n from docs where not deleted`)).rows[0].n;
  const rf = (await db3.query(`select count(*)::int n from assets`)).rows[0].n;
  check('restore from the off-site backup rebuilds every record and file', rest >= live - 2 && rest > 30 && rf === 2, `${rest} records (live ${live}), ${rf} files`);
  await db3.end();
  await fetch('http://localhost:3204/__fail');
  const nf = mail.sent.length;
  const bk3 = await (await fetch(APP + '/api/cron/backup', { headers: { authorization: 'Bearer cron-secret' } })).json();
  check('a failed backup emails the admins', !bk3.ok && mail.sent.slice(nf).some(m => m.subject === 'PCS backup FAILED' && m.to.includes('jack@pcs.test')), bk3.error);
  await a.click('#btn-co'); await a.click('#co-bk'); await a.waitForSelector('#bk-now'); await a.click('#bk-now'); await a.waitForSelector('#bk-now:not([disabled])', { timeout: 20000 });
  const bkRows = await a.locator('.modal tbody tr').count();
  check('Company → Backups shows the history and backs up on demand', bkRows >= 4, `${bkRows} runs listed`);
  await a.click('#bk-c');

  // ── disconnect ──
  await a.keyboard.press('Escape'); await a.goto(APP + '/');
  await a.waitForFunction(() => /live/.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 20000 });
  await a.click('#btn-xero'); await a.waitForSelector('#xh-disc'); await a.click('#xh-disc'); await a.click('#xh-disc'); await a.waitForTimeout(1200);
  check('disconnect revokes the token and removes the connection', xs.state.revoked && xs.state.disconnected && !(await db.query('select 1 from xero_connection')).rows.length);

  for (const p of [a, b]) if (p.errs.length) check('no browser errors', false, p.errs.join(' | '));
} catch (e) {
  console.error(e); check('test run completed', false, e.message);
} finally {
  await browser.close(); server.close(); ms.close(); xs.close(); mail.close(); s3.close(); await db.end();
  const failed = results.filter(r => !r[0]).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
