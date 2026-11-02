import { q } from './db';
import { ApiError } from './http';
import { newId } from './docs';

/** File types the UI accepts (drawings, IOMs, signed dockets, receipts). */
export const ALLOWED_TYPES = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/tiff',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.ms-excel', 'text/csv', 'text/plain',
  'application/zip', 'application/octet-stream', 'application/acad', 'image/vnd.dwg', 'application/dxf', 'model/step',
]);

export const maxBytes = () => Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024;

export function storageDriver(): 'vercel-blob' | 'database' {
  const d = process.env.STORAGE_DRIVER || (process.env.BLOB_READ_WRITE_TOKEN ? 'vercel-blob' : 'database');
  return d === 'vercel-blob' ? 'vercel-blob' : 'database';
}

export function checkFile(contentType: string, size: number) {
  if (!ALLOWED_TYPES.has(contentType)) throw new ApiError(415, 'unsupported_type', 'That file type can’t be stored');
  if (size > maxBytes()) throw new ApiError(413, 'too_large', `File is over ${process.env.MAX_UPLOAD_MB || 20} MB`);
  if (size <= 0) throw new ApiError(400, 'invalid_argument', 'Empty file');
}

async function sha256(buf: ArrayBuffer) {
  return Buffer.from(await crypto.subtle.digest('SHA-256', buf)).toString('hex');
}

/** Store bytes received by the server (files up to ~4 MB on Vercel; larger go direct to Blob). */
export async function storeBytes(buf: ArrayBuffer, contentType: string, name: string, by: string) {
  checkFile(contentType, buf.byteLength);
  const id = newId();
  const hash = await sha256(buf);
  if (storageDriver() === 'vercel-blob') {
    const { put } = await import('@vercel/blob');
    const key = `assets/${id}/${safeName(name)}`;
    const b = await put(key, Buffer.from(buf), { access: 'public', contentType, addRandomSuffix: true });
    await q(`insert into assets (id, storage, key, url, content_type, size_bytes, original_name, sha256, uploaded_by)
             values ($1,'vercel-blob',$2,$3,$4,$5,$6,$7,$8)`, [id, b.pathname, b.url, contentType, buf.byteLength, name, hash, by]);
  } else {
    await q(`insert into assets (id, storage, content_type, size_bytes, original_name, data, sha256, uploaded_by)
             values ($1,'database',$2,$3,$4,$5,$6,$7)`, [id, contentType, buf.byteLength, name, Buffer.from(buf), hash, by]);
  }
  return { id, contentType, sizeBytes: buf.byteLength };
}

/** Record a file the browser uploaded straight to Vercel Blob. */
export async function registerBlob(url: string, pathname: string, contentType: string, size: number, name: string, by: string) {
  checkFile(contentType, size);
  const host = new URL(url).hostname;
  if (!host.endsWith('.blob.vercel-storage.com')) throw new ApiError(400, 'invalid_argument', 'Not a Vercel Blob URL');
  const id = newId();
  await q(`insert into assets (id, storage, key, url, content_type, size_bytes, original_name, uploaded_by)
           values ($1,'vercel-blob',$2,$3,$4,$5,$6,$7)`, [id, pathname, url, contentType, size, name, by]);
  return { id, contentType, sizeBytes: size };
}

/** Import-time: keep the asset id from the old system so existing records still point at it. */
export async function storeWithId(id: string, buf: ArrayBuffer, contentType: string, name: string, by: string) {
  const exists = await q('select 1 from assets where id = $1', [id]);
  if (exists.rows[0]) return;
  if (storageDriver() === 'vercel-blob') {
    const { put } = await import('@vercel/blob');
    const b = await put(`assets/${id}/${safeName(name)}`, Buffer.from(buf), { access: 'public', contentType, addRandomSuffix: true });
    await q(`insert into assets (id, storage, key, url, content_type, size_bytes, original_name, uploaded_by)
             values ($1,'vercel-blob',$2,$3,$4,$5,$6,$7)`, [id, b.pathname, b.url, contentType, buf.byteLength, name, by]);
  } else {
    await q(`insert into assets (id, storage, content_type, size_bytes, original_name, data, uploaded_by)
             values ($1,'database',$2,$3,$4,$5,$6)`, [id, contentType, buf.byteLength, name, Buffer.from(buf), by]);
  }
}

export async function readAsset(id: string): Promise<{ body: ArrayBuffer | ReadableStream; contentType: string; size: number; name: string } | null> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  const r = await q('select storage, url, content_type, size_bytes, original_name, data from assets where id = $1', [id]);
  const a = r.rows[0];
  if (!a) return null;
  if (a.storage === 'database') {
    const b: Buffer = a.data;
    return { body: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, contentType: a.content_type, size: Number(a.size_bytes), name: a.original_name || id };
  }
  const res = await fetch(a.url);
  if (!res.ok || !res.body) return null;
  return { body: res.body, contentType: a.content_type, size: Number(a.size_bytes), name: a.original_name || id };
}

export async function readAssetBytes(id: string): Promise<{ buf: ArrayBuffer; contentType: string; name: string } | null> {
  const a = await readAsset(id);
  if (!a) return null;
  const buf = a.body instanceof ArrayBuffer ? a.body : await new Response(a.body).arrayBuffer();
  return { buf, contentType: a.contentType, name: a.name };
}

export const safeName = (n: string) => (n || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);
