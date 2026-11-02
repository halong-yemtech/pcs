import { createHash, createHmac } from 'node:crypto';

/**
 * S3-compatible upload with AWS Signature V4 (AWS S3, Cloudflare R2, Backblaze B2, Wasabi…). No SDK.
 * Env: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, optional S3_ENDPOINT (path-style).
 */
const sha256 = (d: string | Buffer) => createHash('sha256').update(d).digest('hex');
const hmac = (k: string | Buffer, d: string) => createHmac('sha256', k).update(d).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function s3Configured() {
  return !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

/** Signs a request; exported for the AWS test-vector check. */
export function signV4(o: { method: string; url: URL; headers: Record<string, string>; payloadHash: string; region: string; service: string; accessKey: string; secret: string; amzDate: string }) {
  const date = o.amzDate.slice(0, 8);
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.headers)) h[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  const names = Object.keys(h).sort();
  const query = [...o.url.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  const path = o.url.pathname.split('/').map(seg => enc(decodeURIComponent(seg))).join('/') || '/';
  const canonical = [o.method, path, query, names.map(n => `${n}:${h[n]}\n`).join(''), names.join(';'), o.payloadHash].join('\n');
  const scope = `${date}/${o.region}/${o.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', o.amzDate, scope, sha256(canonical)].join('\n');
  const kSign = hmac(hmac(hmac(hmac('AWS4' + o.secret, date), o.region), o.service), 'aws4_request');
  const signature = createHmac('sha256', kSign).update(toSign).digest('hex');
  return { signature, authorization: `AWS4-HMAC-SHA256 Credential=${o.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

export async function s3Put(key: string, body: Buffer, contentType = 'application/octet-stream') {
  const region = process.env.S3_REGION || 'us-east-1';
  const endpoint = (process.env.S3_ENDPOINT || `https://s3.${region}.amazonaws.com`).replace(/\/$/, '');
  const url = new URL(`${endpoint}/${process.env.S3_BUCKET}/${key.split('/').map(enc).join('/')}`);
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const payloadHash = sha256(body);
  const headers: Record<string, string> = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, 'content-type': contentType };
  const { authorization } = signV4({ method: 'PUT', url, headers, payloadHash, region, service: 's3', accessKey: process.env.S3_ACCESS_KEY_ID!, secret: process.env.S3_SECRET_ACCESS_KEY!, amzDate });
  const res = await fetch(url, { method: 'PUT', headers: { ...headers, authorization }, body: new Uint8Array(body) });
  if (!res.ok) throw new Error(`S3 upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return `s3://${process.env.S3_BUCKET}/${key}`;
}
