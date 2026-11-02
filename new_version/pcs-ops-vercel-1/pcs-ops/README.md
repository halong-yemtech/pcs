# PCS Operations: BOM Register

This repo is the end-to-end operations system for **PCS (White Label Conveyor Products)**. It covers:

- **Bill of materials:** a 4-level BOM (Product → Part → Component → Item).
- **Product range:** product types with width/arm/material variants, and belt-cleaner module rules.
- **Stock and prices:** buy and sell prices, and stock control.
- **Sales pipeline:** one sale number from lead to payment (lead → quote → customer PO → production → ready → dispatched → invoiced → closed · paid → sales history).
- **Purchasing:** RFQs to suppliers, supplier quote PDFs checked against BOM buy prices with a cost roll-up, purchase orders, receiving, and a buy price log.
- **Needs attention:** stuck-sale rules for every stage, Director approval for anything over $20,000 (titles: Admin, Manager, Director), an owner on each sale, escalation to managers, a bell + list in the app, and a daily summary email.
- **Documents:** every quote, RFQ, PO, delivery docket, packing list, build sheet and invoice can be downloaded as PDF or Word, printed, or emailed from the app.
- **Expenses log.**
- **Document library:** GA drawings, manufacturing drawings and IOMs, each with a revision number.
- **Live Xero integration.**

It was prototyped as a claude.ai artifact. This repo is the **production version for Vercel**:

| Part | What it is |
|---|---|
| Database | Postgres |
| Staff sign-in | **Dev team's choice**: a pluggable layer, with a generic OpenID Connect login as the working placeholder |
| File storage | Vercel Blob |
| Accounting | A two-way Xero integration built for a **new, unused Xero organisation** |
| Email | **Dev team's choice**: Resend, Postmark or a Microsoft 365 mailbox (Graph), or `log` for testing |

> **Status for the dev team:** the code is complete. An end-to-end run (76/76 checks) has passed against a real Postgres 16, with a mock sign-in provider, a mock Xero server and Chromium (see [Testing](#testing)).
> Building could not be verified because the build sandbox had no npm registry access. **Still to do before go-live:**
> - Run `npm install && npm run build`.
> - Deploy to a Vercel preview.
> - Choose and set up the staff sign-in provider (section 2.3).
> - Test against the **Xero Demo Company** before connecting the real organisation.

---

## 1. Architecture

```
Browser  ──  public/index.html + public/app/app.js        (the operations UI, vanilla JS, ~300 KB)
            public/app/pcs-backend.js                    (adapter: window.claude.use('db'|'assets'|'downloads'|'user'))
   │  fetch, session cookie
   ▼
Next.js 15 on Vercel (route handlers only, Node runtime)
   middleware.ts            every request needs a signed session (except sign-in, Xero webhook, cron)
   /api/auth/*              staff sign-in: placeholder generic OIDC (code + PKCE), swappable
   /api/db/*                JSON document store: snapshot, change feed, set / update(deep merge) / delete
   /api/assets/*            file upload + download (served to the UI at /_blob/<id>)
   /api/xero/*              connect, setup, push, sync, webhook
   /api/cron/xero-sync      hourly safety-net payment sync
   /api/email/send          outgoing email with PDF attachments, logged per sale (sent as the signed-in person)
   /api/notify              approval request / decision emails
   /api/cron/alerts         hourly: escalations + the daily summary at the set local hour
   /api/users, /api/admin/* roles, export / import
   │
   ├── Postgres  (docs, doc_history, assets, app_users, xero_connection, xero_log)
   ├── Vercel Blob (files)
   └── Xero Accounting API (plain fetch, no SDK)
```

### Why the UI talks to the backend through an adapter

`app.js` was written against claude.ai's artifact runtime API. `public/app/pcs-backend.js` provides the same API (`collection().onSnapshot`, `doc().set/update/delete`, `assets.upload`, `downloads.save`, `user.id/can/profiles`) on top of this backend's REST endpoints. As a result:

- The UI runs unchanged.
- The same `app.js` still works in the claude.ai artifact until cutover. Features that only exist when hosted (Xero hub, Team access, Sign out) appear only when `window.PCS` is present.

### Live updates

Each browser polls `GET /api/db/changes?since=<rev>` every 3 s (every 20 s when the tab is hidden).

- Every write bumps a global Postgres sequence (`docs.rev`).
- Polling works on serverless without websockets. Swapping in Supabase Realtime or Pusher later only touches `pcs-backend.js`.

### Repo layout

```
app/api/**/route.ts     API (Web-standard Request/Response)
lib/                    db, auth (sign-in plug point), session, oidc (placeholder), docs store, storage, flow (sale rules), xero/client + xero/ops
middleware.ts           session gate
db/schema.sql           idempotent schema, applied on every deploy
scripts/                migrate.mjs, import.mjs, build-client.mjs (bundles the Vercel Blob browser uploader)
public/                 the UI (index.html, app/app.js, app/pcs-backend.js, logo, signed-out page)
seed/                   catalog snapshot (60 product types, 2,389 items) for staging
test/                   harness + mocks + e2e test
```

---

## 2. Deploy to Vercel

### 2.1 Project
1. Push this folder to a private GitHub repo and **Import** it in Vercel. The framework is detected as Next.js, and the build command comes from `vercel-build` in `package.json` (migrate → bundle → `next build`).
2. Use a **Pro** team:
   - Vercel's Hobby plan is for non-commercial use only.
   - Hobby also limits cron to once a day, and `vercel.json` schedules the Xero sync hourly.

### 2.2 Storage (Vercel → Storage / Marketplace)
- **Postgres:** add **Neon** (or any Postgres; Supabase and RDS also work). This sets `DATABASE_URL`. Use the **pooled** connection string.
- **Blob:** create a Blob store and connect it to the project. This sets `BLOB_READ_WRITE_TOKEN`.

### 2.3 Staff sign-in (dev team's choice)
How staff log in is left to the dev team. Whatever you choose, **only two places change**:
- `lib/auth.ts` → `getUser(req)`, which returns `{ email, name, role }` for the request.
- The `/api/auth/*` routes.

Everything else calls `requireUser(req, role)`. Roles always come from `resolveRole(email)`, which reads Team access overrides, `ADMIN_EMAILS` and `ALLOWED_EMAIL_DOMAINS` + `DEFAULT_ROLE`.

**Recommendation:** use **Microsoft 365 (Entra ID)** if PCS staff have Microsoft 365 mailboxes. The same account then signs people in *and* sends their quotes, POs and invoices from their own mailbox (section 3C).

**Option A: keep the built-in placeholder (generic OpenID Connect).**
- It works with any OIDC provider. Register a web app with the provider, set the redirect URI to `https://<your-domain>/api/auth/callback`, and set the env vars below.
- It issues the app's own signed `pcs_session` cookie.

| Provider | `OIDC_ISSUER` |
|---|---|
| Microsoft Entra ID (Microsoft 365) | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| Google Workspace | `https://accounts.google.com` |
| Okta | `https://<org>.okta.com` (or your custom authorization server URL) |
| Auth0 | `https://<tenant>.<region>.auth0.com/` |

**Option B: use a library or hosted auth** (Auth.js, Clerk, Supabase Auth, WorkOS…).
1. Add the provider's sign-in pages and routes.
2. In `lib/auth.ts`, make `getUser()` read that provider's session and return `{ email, name, role: await resolveRole(email) }`.
3. Make `middleware.ts` check that provider's session instead of `pcs_session`.
4. Make `/api/auth/logout` sign out of it.
5. Delete `lib/oidc.ts` and `/api/auth/login` and `/api/auth/callback` once they are unused.

The UI only needs two things from sign-in:
- `GET /api/me` works for a signed-in user.
- Unauthenticated API calls get a **401**. The UI then sends the browser to `/api/auth/login`. Change that path in `public/app/pcs-backend.js` (`signIn()`) if yours differs.

**Local development:** set `DEV_AUTH_BYPASS=true`. You are then signed in as `DEV_USER_EMAIL` with the admin role. This is ignored when `NODE_ENV=production`.

### 2.4 Environment variables
See `.env.example` for the full list.

| Variable | Notes |
|---|---|
| `APP_URL` | `https://ops.pcs.com.au` (no trailing slash). Used to build the OAuth redirect URIs. |
| `AUTH_SECRET` | Generate with `openssl rand -base64 48`. Signs session cookies. |
| `TOKEN_ENCRYPTION_KEY` | Generate with `openssl rand -base64 32`. AES-256-GCM key for the Xero tokens. **Back it up**: if it is lost, Xero has to be reconnected. |
| `DATABASE_URL` | Set by Neon. |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Only if you keep the placeholder sign-in (step 2.3). |
| `ALLOWED_EMAIL_DOMAINS` | e.g. `pcs.com.au`. Anyone signing in from these domains gets `DEFAULT_ROLE`. |
| `ADMIN_EMAILS` | Comma-separated list. Admins can connect Xero, manage team access and export data. |
| `DEFAULT_ROLE` | `editor` (default) or `viewer`. |
| `STORAGE_DRIVER` | `vercel-blob`. `database` stores files in Postgres, which is fine for local development. |
| `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` | From step 2.6. |
| `XERO_SCOPES` | Leave at the default. These are granular scopes, required for Xero apps created after 2 March 2026. |
| `XERO_WEBHOOK_KEY` | From step 2.6. |
| `CRON_SECRET` | Any long random string. Vercel sends it to the cron route. |
| `EMAIL_PROVIDER`, `EMAIL_FROM` + provider keys | See section 3A. Until these are set, the Email button explains that email isn't set up. |

### 2.5 First deploy and data
1. Deploy. `scripts/migrate.mjs` creates the tables during the build. It is idempotent and runs on every deploy.
2. Load the data:
   - **Staging:** `DATABASE_URL=… npm run db:import -- seed/pcs-catalog-2026-10-31.json`
   - **Go-live:** in the claude.ai BOM Register, an admin clicks **Company → Export all data**. This downloads `pcs-export_<date>.zip`, containing `data.json` plus every uploaded file. Then run `DATABASE_URL=… BLOB_READ_WRITE_TOKEN=… npm run db:import -- pcs-export_<date>.zip`. File ids are kept, so records still point at their drawings and dockets. Add `--dry-run` to preview first.
3. Sign in as an admin.

### 2.6 Xero (new, unused organisation)

**Create the Xero app.** At developer.xero.com, go to **My Apps → New app**:
- **Integration type:** Web app
- **Company URL:** your site
- **Redirect URI:** `https://<your-domain>/api/xero/callback`
- Generate a secret, then set `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` and redeploy.

**Rehearse on the Demo Company first.** In the app, click the **Xero** button, then **Connect to Xero**, and choose the **Demo Company (AU)**. Run the whole flow there before connecting the real organisation.

**Connect the real organisation.** Disconnect the demo, then connect again and choose the PCS organisation. If several organisations were authorised, pick PCS in the Xero screen.

**Run setup.** Click **Setup + create missing accounts**. This:
- Checks the organisation is AU / AUD.
- Checks every account code the app posts to: sales 200, purchases 300, and the expense category codes 400–493. Any that are missing are created.
- Maps the tax rates: GST on Income → `OUTPUT`, GST on Expenses → `INPUT`, GST Free Expenses → `EXEMPTEXPENSES`.
- Lists the bank accounts.

**Set the posting rules** in the same screen:
- How invoices go in: approved (the default) or draft.
- How bills go in: approved (the default) or draft.
- How reimbursement expenses go in (draft by default).
- Which Xero bank account each "Paid by" option maps to. Business bank account and Business card become *Spend Money*, so they reconcile straight against the bank feed. Unmapped options go in as bills.

**Set up webhooks.** In the Xero app go to **Webhooks**:
- **Delivery URL:** `https://<your-domain>/api/xero/webhook`
- **Events:** Invoices
- Copy the **webhooks key** into `XERO_WEBHOOK_KEY` and redeploy, then click **Send 'Intent to receive'**. The endpoint answers 200 for a valid signature and 401 otherwise, as Xero requires.

**Invoice numbering.** The app numbers invoices `INV-0001…`. In Xero:
- Either don't raise sales invoices by hand,
- or change Xero's invoice prefix (Invoice settings) to something else, e.g. `X-`, so the two series never collide.

---

## 3. How the Xero integration works

| PCS record | Goes to Xero as | Key fields |
|---|---|---|
| Sales invoice (one per delivery docket) | `ACCREC` invoice | Number = `INV-####`, Reference = `customer PO / SO-#### / DD-####`, lines = quantities supplied on that docket, account `xeroSales` (200), tax `OUTPUT`. The signed docket (POD) is attached. |
| Customer / supplier | Contact | Found by exact name, or created. The `ContactID` is saved on the customer or supplier record. |
| Received purchase order | `ACCPAY` bill | Number = supplier invoice no. (or `PUR-####`), Reference = `PUR-#### / SO-####`, received quantities only, account `xeroPurch` (300), due date from the supplier's terms. |
| Expense paid from a mapped bank or card | Spend Money (`SPEND` bank transaction) | Account by category (e.g. Motor vehicle → 449). Amounts tax inclusive, using the GST from the receipt. The receipt is attached. |
| Expense paid personally or unmapped | `ACCPAY` bill (draft by default) | Same account and tax rules. Reference is marked "Reimburse staff". |

**Sending:** use **Send to Xero** in the Xero export dialogs (Sales → *Send invoices to Xero*, Purchasing, Expenses) or the Xero screen. The CSV export stays available as a fallback. Duplicates are prevented three ways:
- Records already sent are skipped.
- Before creating an invoice, the app looks it up by number and contact. If one exists it is linked, not created again.
- An `Idempotency-Key` header is sent with each request.

**Payments back:** the paid status comes back three ways:
- **Instantly:** through the signed webhook.
- **Hourly:** through cron.
- **On demand:** through **Sync Xero payments**.

When Xero reports an invoice as `PAID`:
- The invoice is marked paid, with Xero's paid date.
- If every invoice on the sale is paid and nothing is left to dispatch or invoice, the sale moves to **Closed · paid** automatically, and to Sales history 60 days later.
- Paid bills are flagged on their purchase order.
- Voided or deleted invoices are noted in the sale's history.

**Tokens:**
- Access tokens are refreshed under a row lock.
- Xero refresh tokens **rotate on every use**, and each new one is saved before anything else can use it.
- Both tokens are AES-256-GCM encrypted at rest.

**Disconnect:** this deletes the Xero connection and revokes the refresh token.

---

## 3A. Documents, printing and email

**Document engine.** Each document is described once in `public/app/app.js` (`specQuote`, `specRfq`, `specPo`, `specDocket`, `specPacking`, `specBuild`, `specInvoice`). The same description renders to:
- **PDF:** pdf-lib, in the browser.
- **Word:** the existing .docx writer.
- **Print:** a clean A4 page with the PCS letterhead.
- **Email:** the PDF is attached.

Every document button opens one dialog with **Download PDF**, **Download Word**, **Print** and **Email**:
- **Recipient:** pre-filled from the customer contact (quotes, dockets, invoices) or the supplier (RFQs, POs).
- **Subject and message:** pre-written, and editable.
- **Extra attachments:** the signed docket for invoices. For build sheets, the product's latest GA and manufacturer's drawings.
- **Workshop documents** (build sheet, packing list) carry no prices.

**Sending.** `POST /api/email/send` handles every email:
- It sends from `EMAIL_FROM`, with **Reply-To set to the signed-in person**, so replies come back to them.
- Every send (or failure) is written to the server-only `emails` collection, shown under **Sent emails** in Sales and Purchasing.
- The browser also adds a line to the record's history (e.g. "Invoice INV-0002 emailed to accounts@…").
- Emailing a draft PO marks it **Sent**. Emailing an RFQ marks that supplier as sent.

**Choosing the email provider** is the dev team's call, set by `EMAIL_PROVIDER`. `lib/email.ts` has a branch for each:

| Provider | Setup |
|---|---|
| `resend` | Create an API key and verify the PCS sending domain (SPF/DKIM DNS records). |
| `postmark` | Server token, plus a verified sender signature or domain. |
| `graph` | Entra app registration with the **Mail.Send application** permission (admin consent). `EMAIL_FROM` must be a real mailbox, e.g. sales@. Sent mail appears in that mailbox's Sent Items. Restrict the app to that mailbox with an Exchange application access policy. |
| `log` | Records the email without sending. Use it for staging. |

SMTP (nodemailer) or another API can be added as one more branch in `send()`.

**Printing and email only work on the hosted version.** The claude.ai copy can download PDF and Word but can't print or send.

## 3C. Needs attention: stuck sales, approvals, owners

**Rules.** `lib/rules.mjs` is the **one** rules file:
- The server imports it for the hourly check and the summary email.
- `scripts/build-client.mjs` bundles it to `public/app/rules.js` for the browser (the generated file is committed).
- **Edit `lib/rules.mjs` only.**

Admins set the limits in the app: bell → **Alert & approval settings**, stored in `settings/alerts`.

| Rule | Default limit |
|---|---|
| Lead with no quote | 3 days in Lead |
| Quote awaiting customer response | 7 days after "Sent to customer", repeats weekly |
| Quote about to expire / expired | 3 days before validity ends |
| Customer PO received, production not started | 2 days |
| Build order past due | due date |
| Ready but not dispatched | 2 days |
| Dispatched but not invoiced | 1 day after the docket |
| Invoice payment overdue | due date, repeats weekly |
| RFQ supplier quote not received | reply-by date |
| Supplier delivery late | PO expected date |
| Next action date passed | the date |
| Stock below minimum | the item's minimum on the Stock tab, counting stock already on order |
| Not enough stock for an open sale | a sale at PO received, production or ready needs more of an item than is on hand plus on order (built items are left to their build orders) |

**How long a sale has been in a stage** comes from its history (`stageSince`).

**Owners and escalation**
- Every sale has an **Owner**, defaulting to the person who created the lead and editable on the sale.
- An item goes to the sale's owner. Purchasing items go to whoever raised them.
- After **escalate days** past a limit (default 3), the item is emailed **once** to the **managers**. If no managers are set, it goes to the admins.
- Unassigned items also go to the managers.

**Approvals.** The default limits below are changeable, and 0 switches an approval off.

| What | Needs approval when | What is blocked until approved |
|---|---|---|
| Quote | ex-GST total over **$20,000** | emailing, printing or downloading the quote |
| Purchase order | ex-GST total over **$20,000** | Mark as sent, emailing, printing or downloading |
| Quote discount over a set % | **off** by default | as for quotes |
| Buy price increase from a supplier quote | **off** by default | applying the prices and creating the PO |

**Three titles, kept simple:** **Admin**, **Manager** and **Director**.
- **Admin and Manager are the same:** they raise and send. The difference is the title only.
- **Directors approve anything over $20,000.**
- **Setting titles:** in Company → Team access. Stored as `titles` in `settings/alerts`, with the Directors kept in step as `directors`.
- **Who can approve:** only Directors. Admins can approve **only until a Director is named**, so the system is never stuck.
- **Request:** the request goes on the record and is emailed to the Directors. The email links straight to the record (`/?open=deals:<id>`).
- **Decide:** the Director approves or rejects with a comment, and the requester is emailed the outcome.
- **Send:** the Admin emails the approved quote or PO. **The approving Director is always copied.** The app pre-fills the Cc, and `/api/email/send` adds it on the server even if someone removes it, so the Director receives exactly what went out.
- **Editing re-locks it:** each approval stores a fingerprint of the lines, so editing an approved quote or PO needs approval again.
- **The server enforces it:** `/api/db/write` refuses an approval or rejection from anyone who isn't a Director, or recorded under someone else's name. Only admins can change `settings/alerts`.

**How people are told**
- **Tasks (home screen):** the app opens on **Tasks**, every rule above turned into a to-do. Items are grouped as *Approvals*, *Overdue* and *Coming up*, and each has an action button (*Follow up the customer*, *Raise the invoice*, *Chase payment*, *Review & approve*…) that opens the record. Snooze and dismiss are on every task. Tiles show the counts and the open pipeline, and a strip shows how many sales are stuck at each stage. Toggle between *My tasks* and *Everyone*.
- **The bell:** a count of *your* items (blue when an approval is waiting) and a **Needs attention** list, showing *For me* or *Everyone*.
- **The sales board:** a ⚑ flag on stuck sale cards, plus a **Needs attention** tab.
- **Snooze or dismiss:** snooze for 1 day to 2 weeks, or dismiss with a reason. Both are stored in `alertstate` and shared with the team. A dismissed item comes back if its situation changes, e.g. the next weekly follow-up.
- **The 7am summary:** `/api/cron/alerts` runs hourly. At the set local hour (default 7:00, `Australia/Perth`) it sends each person **one** summary email of their items, grouped by approvals and overdue items, each with a link.
- **Immediate emails:** approval requests, decisions and escalations go out immediately.

**Who emails come from**
- **Notifications:** from `EMAIL_FROM` (e.g. notifications@), so they are easy to filter.
- **Documents to customers and suppliers:** from the signed-in person when `EMAIL_SEND_AS_USER=true`. Only addresses at `EMAIL_SENDER_DOMAINS` are used.
  - **Recommended, Microsoft 365:** with `EMAIL_PROVIDER=graph`, mail is sent from the person's own mailbox and appears in their Outlook **Sent Items**. Replies come straight back to them. This is the main reason to pick **Microsoft 365 for staff sign-in too** (section 2.3): one account for login and sending.
  - **Resend or Postmark:** the person's address on the verified domain, plus an automatic BCC copy to them, since these services have no Sent Items.

## 3B. RFQ → supplier quote → price check → PO

1. **Raise the RFQ.** Go to Purchasing → **RFQs** → **+ New RFQ**. Add the items and quantities, optionally link a sale, and add one or more suppliers. Then **Send RFQ** emails each supplier a PDF with the price columns left blank.
2. **Record the quote.** When a quote comes back, click **Record quote** and drop the supplier's PDF in. The PDF is stored with the RFQ, and its text is read in the browser by pdf.js:
   - Each line is matched by our item code, ordering number or the supplier's part number. If none of those match, it falls back to the description.
   - The unit price is taken from that line. Where possible it is checked against qty × unit = line total, and each line is marked *Matched*, *Check*, *Best guess* or *Not found*.
   - The quote number, lead time and validity are also picked up.
   - Scanned (image-only) PDFs can't be read, so those prices are typed in.
3. **Check the prices.** For each line the screen shows the current BOM buy price, the quoted price and the % change, with an **Update BOM buy price** tick box. The **cost roll-up** below lists every product, part and component whose cost would change, with cost now → new cost and margin now → new against the sell price. It updates as boxes are ticked.
4. **Apply prices & create PO.** This:
   - Updates the ticked buy prices.
   - Optionally updates the supplier's price list.
   - Writes a **buy price log** entry for each change. The entry records the source (RFQ, supplier and quote no.), the person, and the cost roll-up.
   - Raises a draft PO with the quoted prices, linked to the RFQ and sale.
   - Opens the PO ready to email.

   With several suppliers on one RFQ, the RFQ shows a price comparison, and you raise the PO from the chosen supplier's quote.

**Where changes are logged.** Buy price changes from quotes, PO receipts and manual edits all go into `pricelog` (monthly documents). They appear under Purchasing → **Price log** and on each item's **Prices & stock** tab.

## 3E. Weekly off-site backup

**When it runs:** every **Sunday night**, via Vercel Cron `/api/cron/backup` at 17:23 UTC (about 1:23am Monday in Perth). An admin can also run one any time from **Company → Backups**.

**What it saves:**
- A zip of **every record** (`data.json` in the importer's format), saved to `pcs-backups/YYYY-MM-DD/pcs-data_<stamp>.zip`.
- Each uploaded file (drawings, receipts, signed dockets, supplier quote PDFs), copied **once** to `pcs-backups/files/`. Later runs only add new files.

**Destinations:** set any or all in the env vars; the dev team chooses.

| Destination | Env | Notes |
|---|---|---|
| S3-compatible storage (AWS S3, Cloudflare R2, Backblaze B2, Wasabi) | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT` (not AWS) | Signed with AWS SigV4 (no SDK; checked against AWS's published test vectors). Turn on **bucket versioning** and add a **lifecycle rule** to expire old `pcs-backups/20*` zips after e.g. 12 months. |
| Microsoft 365 OneDrive or SharePoint | `BACKUP_ONEDRIVE_USER` (e.g. backups@…) or `BACKUP_DRIVE_ID`, plus the `GRAPH_*` app with **Files.ReadWrite.All** (or **Sites.Selected**) | Lands in PCS's own Microsoft 365, outside Vercel and Neon. Files over 4 MB use an upload session. |
| Email copy | `BACKUP_EMAIL_TO` | The data zip (not the files) is emailed each week if it is under 10 MB. |

**Failures and monitoring**
- A failed backup emails the admins straight away.
- If there has been no successful backup for 8 days, admins see a **Backup** task at the top of the Tasks screen.
- Every run is logged in the `backups` table, shown in Company → Backups.

**Restore:**
1. Set up a fresh database (`npm run db:migrate`).
2. Download a `pcs-data_*.zip` and the `files/` folder from the backup destination.
3. Run `npm run db:import -- pcs-data_<stamp>.zip --files ./files`.
4. Reconnect Xero afterwards: tokens are deliberately not in backups.

Neon also keeps its own point-in-time history (7 days on the free plan, longer on paid plans), so it is the first port of call for undoing a mistake. The weekly backup covers losing the database or the Vercel account altogether.

## 4. Data model

Postgres table `docs(collection, id, data jsonb, rev, deleted, updated_at, updated_by)`. Every write is also appended to `doc_history`, which serves as the audit trail.

| Collection | Contents |
|---|---|
| `catalog` | c00–c06: imported product database (items + product types) |
| `parts`, `products` | edits / new items and product types (override the catalog) |
| `pricing`, `stock` | buy/sell prices and on-hand qty, 16 hash shards each (`items.{itemId}`) |
| `moves` | stock movement log, monthly shards |
| `deals` | sales: the **sale number (SO-####)** record holding quote, customer PO, dockets, invoices, history |
| `orders` | build orders (MO-####), always raised from a sale |
| `customers`, `suppliers`, `pos`, `expenses`, `documents` | as named |
| `settings` | `company` (name, ABN, bank, Xero account codes, terms) |
| `rfqs` | requests for quotation: lines, suppliers, each supplier's quote (PDF asset, prices, ref) and the PO raised |
| `pricelog` | buy price change log with source and cost roll-up, monthly documents |
| `emails` | every email sent (or failed): server-only |
| `settings/alerts` | rule limits, approval limits, Directors, managers, summary hour (admins only) |
| `alertstate` | snoozed / dismissed items (shared) |
| `alertsent` | escalations and summaries already sent: server-only |
| `xero` | `settings`: written by the server only (mappings, last sync) |

The sale rules live in `public/app/app.js`. The server has a copy in `lib/flow.ts` (used when Xero reports payments). **Keep the two in step.**

### Roles
| Role | Can do |
|---|---|
| viewer | Read only |
| editor | Everything except the admin tools |
| admin | Connect and set up Xero, Team access (Company → Team access), export and import |

A role set in Team access overrides the env rules. `blocked` removes access.

---

## 5. Security notes

**Sessions**
- HMAC-signed, HttpOnly, SameSite=Lax cookie (Secure over https). Default length 12 h.
- The role is re-checked against the database on **every** API request. Middleware is a first gate only.

**Sign-in**
- The placeholder OIDC flow uses PKCE, state and nonce.
- The ID token comes straight from the provider's token endpoint over TLS with the client secret, so its signature check is skipped, as OIDC Core §3.1.3.7(6) allows.
- Issuer, audience, nonce, expiry and `email_verified` are still validated.
- The final provider is the dev team's call (section 2.3).

**Files**
- Served only through `/api/assets/:id`, which requires a session. Blob URLs are never sent to browsers.
- Responses carry `nosniff` and a sandbox CSP, so uploaded SVG and HTML can't run script.

**Webhooks and cron**
- The webhook is HMAC-verified with a constant-time compare.
- Cron requires `CRON_SECRET`.

**Database writes**
- Browsers cannot write the `xero` collection.
- Collection and id names are validated.
- Documents are capped at 1 MB.

**Response headers**
- `X-Frame-Options: DENY`, `nosniff` and `Referrer-Policy` are set on all responses.

---

## 6. Testing

`test/e2e.mjs` runs the real route handlers, middleware and rewrites on a plain Node server (`test/harness.mjs`, built with esbuild) against a **real Postgres**. It uses a mock OIDC sign-in provider and a mock Xero server (`test/mocks.mjs`) and drives the UI in Chromium:

```bash
# needs a local Postgres you can create databases on, plus: npm i && npx playwright install chromium
TEST_PG=postgres://postgres@127.0.0.1:5432 npm run test:e2e
```

What it checks (76/76 passing on 2 Nov 2026):
- **Sign-in:** placeholder OIDC sign-in and domain rules, plus refusals without a session.
- **Stock:** a stock receive.
- **Sales:** a full sale with two dockets and two invoices, with the signed docket upload served back.
- **Live updates:** a second user's screen updating live.
- **Xero setup:** OAuth with granular scopes, encrypted tokens, and setup creating a missing account.
- **Xero posting:** posting rules, invoices pushed with the docket attached, no duplicates, spend-money and bill expenses, and a PO → bill.
- **Payments:** webhook signature rejection and acceptance, then a cron sync that closes the sale, with token refresh and rotation.
- **Documents and email:** the docket and invoice emailed as real PDFs (Reply-To = sender, copy to self), logged on the sale and in the email log.
- **Approvals and alerts:** titles are set (Director, Manager); a quote over $20k is blocked; the request is emailed to the Director; an editor can't self-approve (server 403); the approver opens it from the link and approves; the requester is told and sends it, with the Director automatically copied (enforced on the server). Also: editors can't change limits; a stuck lead goes into the owner's summary email and escalates once to managers; snoozing removes the item from the list.
- **RFQ:** RFQ emailed to the supplier; the supplier's quote PDF dropped in, with prices and quote no. read; the cost roll-up checked; buy prices updated and logged with the roll-up; the PO raised with the quoted prices, then emailed and marked sent.
- **Backup:** the admin is warned when there is no backup yet. The weekly run writes the data zip to S3 (SigV4), copies the files once, and emails a copy; the next run is incremental. Restoring from the off-site copy into an empty database rebuilds every record and file. A failed run emails the admins, and Company → Backups lists the history and backs up on demand.
- **Admin:** viewer write refused, server-only collection protected, the audit trail, Export all data → import into an empty database (every collection and file reproduced), and disconnect + revoke.

**Not exercised here** (verify on a Vercel preview):
- `next build` itself.
- The real sign-in provider and Xero endpoints.
- Large (>4 MB) direct-to-Blob uploads through `@vercel/blob/client`.
- The real email providers. Send a test from staging with `EMAIL_PROVIDER` set before go-live.

---

## 7. Known limits and suggested next steps

- **UI code:** the UI is one large vanilla-JS file. It works, but splitting it into modules (or porting it to React screen by screen behind the same adapter) would help maintenance.
- **CDN libraries:** SheetJS 0.18.5, JSZip 3.10.1, pdf-lib 1.17.1 and pdf.js 4.10.38 load from cdnjs. Consider self-hosting them, and moving SheetJS to its current release from the SheetJS CDN.
- **Live updates:** these use polling. Move to realtime if the team grows large.
- **Xero items:** products are not synced as Xero *Items* (InventoryItemCode is left blank). Stock is tracked in this app, not Xero.
- **Currency:** AUD only.
- **Reimbursements:** these go in as draft bills to the payee. Your accountant may prefer bills to the staff member instead.
- **Rate limits:** Xero allows 60 calls/min and 5,000/day per organisation. Pushes are batched in groups of 20 and retry on 429.
- **Before go-live:** fill in the company legal name, ABN and bank details (Company screen). Replace the temporary JWX and HDHP item codes.

## 8. Cutover checklist
1. Choose the staff sign-in provider (section 2.3). Staging deploy with the seed catalog. Sign-in works for two staff.
2. Connect the Xero **Demo Company**, run setup, and send one test invoice, bill and expense. Mark the invoice paid in Xero and check the sale closes.
3. Disconnect the demo and connect the real organisation. Run setup and set the posting rules, then set up webhooks (step 2.6).
4. Freeze edits in the claude.ai version, click **Export all data**, then run `npm run db:import -- <zip>` on production.
5. Spot-check stock, open sales and documents. Tell the team to use the new URL.
