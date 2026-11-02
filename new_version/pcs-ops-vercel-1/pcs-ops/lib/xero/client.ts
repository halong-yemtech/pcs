import { q, tx } from '../db';
import { decrypt, encrypt } from '../crypto';
import { ApiError } from '../http';

/**
 * Xero OAuth 2.0 + Accounting API client (no SDK; plain fetch).
 * Docs: https://developer.xero.com/documentation/guides/oauth2/auth-flow
 */
export const XERO = {
  authorize: process.env.XERO_AUTHORIZE_URL || 'https://login.xero.com/identity/connect/authorize',
  token: process.env.XERO_TOKEN_URL || 'https://identity.xero.com/connect/token',
  revoke: process.env.XERO_REVOKE_URL || 'https://identity.xero.com/connect/revocation',
  connections: process.env.XERO_CONNECTIONS_URL || 'https://api.xero.com/connections',
  api: process.env.XERO_API_URL || 'https://api.xero.com/api.xro/2.0',
};
export const DEFAULT_SCOPES =
  'openid profile email offline_access accounting.invoices accounting.payments accounting.banktransactions accounting.contacts accounting.settings accounting.attachments';

export const xeroConfigured = () => !!(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);

function creds() {
  if (!xeroConfigured()) throw new ApiError(400, 'xero_not_configured', 'XERO_CLIENT_ID / XERO_CLIENT_SECRET are not set');
  return { id: process.env.XERO_CLIENT_ID!, secret: process.env.XERO_CLIENT_SECRET! };
}
const basic = () => { const c = creds(); return 'Basic ' + Buffer.from(`${c.id}:${c.secret}`).toString('base64'); };

export function authorizeUrl(redirectUri: string, state: string): string {
  const u = new URL(XERO.authorize);
  u.search = new URLSearchParams({
    response_type: 'code', client_id: creds().id, redirect_uri: redirectUri,
    scope: process.env.XERO_SCOPES || DEFAULT_SCOPES, state,
  }).toString();
  return u.toString();
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(XERO.token, {
    method: 'POST',
    headers: { authorization: basic(), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(502, 'xero_auth', `Xero token request failed: ${data.error || res.status}`);
  return data as { access_token: string; refresh_token: string; expires_in: number; scope?: string };
}

export type Tenant = { id: string; tenantId: string; tenantName: string; tenantType: string };

export async function listConnections(accessToken: string): Promise<Tenant[]> {
  const res = await fetch(XERO.connections, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' } });
  if (!res.ok) throw new ApiError(502, 'xero_auth', `Could not list Xero organisations (${res.status})`);
  return (await res.json()).filter((t: Tenant) => t.tenantType === 'ORGANISATION');
}

/** Finish the OAuth flow: swap the code for tokens and store them (encrypted). */
export async function completeConnect(code: string, redirectUri: string, by: string) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  const tenants = await listConnections(t.access_token);
  if (!tenants.length) throw new ApiError(400, 'xero_no_org', 'No Xero organisation was authorised');
  const pick = tenants[0];
  await q(`insert into xero_connection (id, tenant_id, tenant_name, connection_id, tenants, access_token, refresh_token, expires_at, scopes, connected_by, connected_at, updated_at)
           values ('default',$1,$2,$3,$4,$5,$6, now() + ($7 || ' seconds')::interval, $8, $9, now(), now())
           on conflict (id) do update set tenant_id=excluded.tenant_id, tenant_name=excluded.tenant_name, connection_id=excluded.connection_id,
             tenants=excluded.tenants, access_token=excluded.access_token, refresh_token=excluded.refresh_token, expires_at=excluded.expires_at,
             scopes=excluded.scopes, connected_by=excluded.connected_by, connected_at=now(), updated_at=now()`,
    [pick.tenantId, pick.tenantName, pick.id, JSON.stringify(tenants), encrypt(t.access_token), encrypt(t.refresh_token),
     String(t.expires_in || 1800), t.scope || process.env.XERO_SCOPES || DEFAULT_SCOPES, by]);
  return { tenant: pick, tenants };
}

export async function chooseTenant(tenantId: string) {
  const r = await q(`select tenants from xero_connection where id='default'`);
  const t = (r.rows[0]?.tenants || []).find((x: Tenant) => x.tenantId === tenantId);
  if (!t) throw new ApiError(400, 'invalid_argument', 'That organisation was not authorised');
  await q(`update xero_connection set tenant_id=$1, tenant_name=$2, connection_id=$3, updated_at=now() where id='default'`, [t.tenantId, t.tenantName, t.id]);
  return t;
}

export async function connection() {
  const r = await q(`select tenant_id, tenant_name, connection_id, tenants, expires_at, scopes, connected_by, connected_at from xero_connection where id='default'`);
  return r.rows[0] && r.rows[0].tenant_id ? r.rows[0] : null;
}

/**
 * A valid access token. Refresh tokens rotate on every use, so refreshing happens under a row
 * lock and the new refresh token is saved before anything else can use the old one.
 */
export async function accessToken(): Promise<{ token: string; tenantId: string }> {
  return tx(async t => {
    const r = await t.q(`select tenant_id, access_token, refresh_token, expires_at from xero_connection where id='default' for update`);
    const c = r.rows[0];
    if (!c?.refresh_token) throw new ApiError(400, 'xero_not_connected', 'Xero is not connected');
    if (new Date(c.expires_at).getTime() - Date.now() > 120_000) return { token: decrypt(c.access_token), tenantId: c.tenant_id };
    const n = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(c.refresh_token) });
    await t.q(`update xero_connection set access_token=$1, refresh_token=$2, expires_at=now() + ($3 || ' seconds')::interval, updated_at=now() where id='default'`,
      [encrypt(n.access_token), encrypt(n.refresh_token), String(n.expires_in || 1800)]);
    return { token: n.access_token, tenantId: c.tenant_id };
  });
}

export async function disconnect() {
  const r = await q(`select connection_id, refresh_token from xero_connection where id='default'`);
  const c = r.rows[0];
  if (c?.connection_id) {
    try {
      const { token } = await accessToken();
      await fetch(`${XERO.connections}/${c.connection_id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
    } catch (e) { console.warn('Xero connection delete failed', e); }
  }
  if (c?.refresh_token) {
    try {
      await fetch(XERO.revoke, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: decrypt(c.refresh_token) }) });
    } catch (e) { console.warn('Xero token revoke failed', e); }
  }
  await q(`delete from xero_connection where id='default'`);
}

export async function log(action: string, ref: string | null, ok: boolean, detail: any = null) {
  try { await q('insert into xero_log (action, ref, ok, detail) values ($1,$2,$3,$4)', [action, ref, ok, detail == null ? null : JSON.stringify(detail)]); }
  catch (e) { console.warn('xero_log insert failed', e); }
}

/** Call the Accounting API. Retries on 429 (rate limit) and 5xx with backoff. */
export async function xero(method: string, path: string, opts: { body?: any; raw?: ArrayBuffer; contentType?: string; idempotencyKey?: string; query?: Record<string, string> } = {}) {
  const { token, tenantId } = await accessToken();
  const url = new URL(XERO.api + path);
  for (const [k, v] of Object.entries(opts.query || {})) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'xero-tenant-id': tenantId, accept: 'application/json' };
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey.slice(0, 128);
    let body: any;
    if (opts.raw) { body = opts.raw; headers['content-type'] = opts.contentType || 'application/octet-stream'; }
    else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers['content-type'] = 'application/json'; }
    const res = await fetch(url, { method, headers, body });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const wait = Math.min(Number(res.headers.get('retry-after') || 0) * 1000 || 1000 * 2 ** attempt, 20_000);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok && !(res.status === 400 && data?.Elements)) {
      const msg = data?.Detail || data?.Message || data?.Title || text.slice(0, 300) || `HTTP ${res.status}`;
      throw new ApiError(res.status === 401 || res.status === 403 ? 502 : res.status, 'xero_error', `Xero: ${msg}`);
    }
    return { status: res.status, data };
  }
}

/** Xero dates come back as "/Date(1730332800000+0000)/" or ISO strings. Returns YYYY-MM-DD. */
export function xeroDate(v: any): string {
  if (!v) return '';
  const m = /\/Date\((-?\d+)/.exec(String(v));
  const d = m ? new Date(Number(m[1])) : new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Validation errors from a batch (summarizeErrors=false) response element. */
export function elementErrors(el: any): string[] {
  const errs = [...(el?.ValidationErrors || [])];
  for (const li of el?.LineItems || []) errs.push(...(li.ValidationErrors || []));
  return errs.map((e: any) => e.Message).filter(Boolean);
}
