/**
 * PLACEHOLDER STAFF SIGN-IN: generic OpenID Connect (authorization code + PKCE).
 *
 * The dev team chooses the final login method. This default works with any OIDC provider:
 * Microsoft Entra ID, Google Workspace, Okta, Auth0, Keycloak, and others. Configure it with
 * OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET.
 * To use something else (Auth.js, Clerk, …), see "Staff sign-in" in the README. Only
 * lib/auth.ts getUser() and the /api/auth/* routes need to change.
 *
 * The ID token is received directly from the provider's token endpoint over TLS using the client
 * secret, so per OIDC Core 3.1.3.7 (6) its signature check may be skipped. Issuer, audience,
 * nonce and expiry are still validated.
 */
const enc = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array) =>
  Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('base64url');

type Endpoints = { issuer: string; authorization_endpoint: string; token_endpoint: string };
const g = globalThis as any;

export function oidcEnv() {
  const issuer = (process.env.OIDC_ISSUER || '').replace(/\/$/, '');
  const clientId = process.env.OIDC_CLIENT_ID;
  const secret = process.env.OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !secret) throw new Error('Staff sign-in is not configured: set OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET (or plug in another provider, see README)');
  return { issuer, clientId, secret, scope: process.env.OIDC_SCOPES || 'openid profile email' };
}

/** Provider endpoints from the issuer's discovery document (cached per warm instance). */
export async function discover(): Promise<Endpoints> {
  const { issuer } = oidcEnv();
  if (g.__pcsOidc?.key === issuer) return g.__pcsOidc.value;
  const res = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed for ${issuer} (${res.status})`);
  const value = await res.json();
  g.__pcsOidc = { key: issuer, value };
  return value;
}

export function randomString(bytes = 32): string {
  return b64u(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return b64u(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
}

export function decodeJwt(token: string): any {
  const part = token.split('.')[1];
  if (!part) throw new Error('Malformed ID token');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

export async function authorizeUrl(redirectUri: string, state: string, nonce: string, challenge: string) {
  const c = oidcEnv();
  const d = await discover();
  const url = new URL(d.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: c.clientId, response_type: 'code', redirect_uri: redirectUri, scope: c.scope,
    state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  }).toString();
  return url.toString();
}

export async function exchangeCode(code: string, redirectUri: string, verifier: string) {
  const c = oidcEnv();
  const d = await discover();
  const res = await fetch(d.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.clientId, client_secret: c.secret, grant_type: 'authorization_code',
      code, redirect_uri: redirectUri, code_verifier: verifier,
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.id_token) throw new Error(data.error_description || data.error || `Token exchange failed (${res.status})`);
  return data;
}

export async function validateIdToken(claims: any, nonce: string) {
  const c = oidcEnv();
  const d = await discover();
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(c.clientId)) throw new Error('ID token audience mismatch');
  if (claims.nonce !== nonce) throw new Error('ID token nonce mismatch');
  if (!claims.exp || claims.exp < now - 60) throw new Error('ID token expired');
  // Multi-tenant issuers (e.g. Microsoft /common) put a placeholder in discovery; skip the exact match there.
  if (!/\{tenantid\}/i.test(d.issuer) && claims.iss !== d.issuer) throw new Error('ID token issuer mismatch');
  if (claims.email_verified === false) throw new Error('Email address not verified with the sign-in provider');
  const email = String(claims.email || claims.preferred_username || claims.upn || '').toLowerCase();
  if (!email.includes('@')) throw new Error('The sign-in provider did not return an email address');
  return { email, name: String(claims.name || email) };
}
