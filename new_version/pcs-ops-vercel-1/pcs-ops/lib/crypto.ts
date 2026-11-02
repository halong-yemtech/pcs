import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

function key(): Buffer {
  const k = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (k.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)');
  return k;
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function decrypt(blob: string): string {
  const b = Buffer.from(blob, 'base64');
  const d = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

export function hmacBase64(secret: string, data: string | Buffer): string {
  return createHmac('sha256', secret).update(data).digest('base64');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a || ''), y = Buffer.from(b || '');
  return x.length === y.length && timingSafeEqual(x, y);
}
