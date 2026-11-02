/**
 * Signed session cookies (HMAC-SHA256, Web Crypto). Runs in both Edge middleware and Node routes.
 * Format: base64url(JSON payload) + "." + base64url(signature)
 */
export const SESSION_COOKIE = 'pcs_session';
const enc = new TextEncoder();

function b64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(s: string) {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function key(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET must be set (32+ characters)');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function sign(payload: Record<string, any>): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(), enc.encode(body)));
  return body + '.' + b64u(sig);
}

/** Returns the payload if the signature is valid and it has not expired (payload.exp, seconds). */
export async function verify<T = any>(token: string | undefined | null): Promise<T | null> {
  if (!token || token.indexOf('.') < 1) return null;
  const [body, sig] = token.split('.');
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(), unb64u(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64u(body)));
    if (p.exp && p.exp < Math.floor(Date.now() / 1000)) return null;
    return p as T;
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function devBypass(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH_BYPASS === 'true';
}
