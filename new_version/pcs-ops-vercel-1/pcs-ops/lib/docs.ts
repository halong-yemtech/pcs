import { q, tx } from './db';
import { ApiError } from './http';

/**
 * JSON document store on Postgres. Same model the UI was built on:
 * collections of documents, set (replace) / update (deep merge) / delete, plus a change feed.
 */
export const COLL_RE = /^[a-z][a-zA-Z0-9_-]{0,40}$/;
export const ID_RE = /^[A-Za-z0-9_.:@-]{1,160}$/;
export const MAX_DOC_BYTES = 1_000_000;

export type Doc = { c: string; id: string; data: any; rev: number; deleted?: boolean; updatedAt?: string };

export function checkRef(c: string, id?: string) {
  if (!COLL_RE.test(c || '')) throw new ApiError(400, 'invalid_argument', `Bad collection name: ${c}`);
  if (id !== undefined && !ID_RE.test(id || '')) throw new ApiError(400, 'invalid_argument', `Bad document id: ${id}`);
}
function checkData(data: any) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError(400, 'invalid_argument', 'Document data must be an object');
  if (JSON.stringify(data).length > MAX_DOC_BYTES) throw new ApiError(413, 'too_large', 'Document is over 1 MB');
}
const row = (r: any): Doc => ({ c: r.collection, id: r.id, data: r.data, rev: Number(r.rev), deleted: r.deleted, updatedAt: r.updated_at });

export function newId(): string {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const b = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(b, x => a[x % a.length]).join('');
}

export async function currentRev(): Promise<number> {
  const r = await q('select coalesce(max(rev), 0) as rev from docs');
  return Number(r.rows[0].rev);
}

export async function snapshot(collections: string[]): Promise<{ rev: number; docs: Doc[] }> {
  collections.forEach(c => checkRef(c));
  const rev = await currentRev();
  const r = await q('select collection, id, data, rev, deleted, updated_at from docs where collection = any($1) and not deleted', [collections]);
  return { rev, docs: r.rows.map(row) };
}

/**
 * Changes after `since`. Also re-sends anything touched in the last few seconds so a write that
 * committed out of sequence order is never missed; clients apply changes idempotently by rev.
 */
export async function changes(since: number, collections: string[]): Promise<{ rev: number; docs: Doc[] }> {
  collections.forEach(c => checkRef(c));
  const rev = await currentRev();
  const r = await q(
    `select collection, id, data, rev, deleted, updated_at from docs
      where collection = any($2) and (rev > $1 or updated_at > now() - interval '5 seconds')
      order by rev limit 2000`, [since, collections]);
  return { rev, docs: r.rows.map(row) };
}

export async function getDoc(c: string, id: string): Promise<Doc | null> {
  checkRef(c, id);
  const r = await q('select collection, id, data, rev, deleted, updated_at from docs where collection = $1 and id = $2 and not deleted', [c, id]);
  return r.rows[0] ? row(r.rows[0]) : null;
}

async function history(c: string, id: string, op: string, data: any, by: string | null, run = q) {
  await run('insert into doc_history (collection, id, op, data, by) values ($1, $2, $3, $4, $5)', [c, id, op, data == null ? null : JSON.stringify(data), by]);
}

export async function setDoc(c: string, id: string, data: any, by: string | null): Promise<Doc> {
  checkRef(c, id); checkData(data);
  const r = await q(
    `insert into docs (collection, id, data, updated_by) values ($1, $2, $3, $4)
     on conflict (collection, id) do update
       set data = excluded.data, deleted = false, rev = nextval('doc_rev'), updated_at = now(), updated_by = excluded.updated_by
     returning collection, id, data, rev, deleted, updated_at`, [c, id, JSON.stringify(data), by]);
  await history(c, id, 'set', data, by);
  return row(r.rows[0]);
}

/** Deep-merge patch into an existing document. Missing document → invalid_argument (the UI relies on this). */
export async function updateDoc(c: string, id: string, patch: any, by: string | null): Promise<Doc> {
  checkRef(c, id); checkData(patch);
  const r = await q(
    `update docs set data = jsonb_deep_merge(data, $3::jsonb), rev = nextval('doc_rev'), updated_at = now(), updated_by = $4
      where collection = $1 and id = $2 and not deleted
      returning collection, id, data, rev, deleted, updated_at`, [c, id, JSON.stringify(patch), by]);
  if (!r.rows[0]) throw new ApiError(404, 'invalid_argument', 'Document does not exist');
  if (JSON.stringify(r.rows[0].data).length > MAX_DOC_BYTES) throw new ApiError(413, 'too_large', 'Document is over 1 MB');
  await history(c, id, 'update', patch, by);
  return row(r.rows[0]);
}

export async function deleteDoc(c: string, id: string, by: string | null): Promise<Doc | null> {
  checkRef(c, id);
  const r = await q(
    `update docs set deleted = true, data = '{}'::jsonb, rev = nextval('doc_rev'), updated_at = now(), updated_by = $3
      where collection = $1 and id = $2 and not deleted
      returning collection, id, data, rev, deleted, updated_at`, [c, id, by]);
  await history(c, id, 'delete', null, by);
  return r.rows[0] ? row(r.rows[0]) : null;
}

/**
 * Server-side read-modify-write with a row lock, for integrations (Xero) that change
 * documents people may be editing at the same time.
 */
export async function mutateDoc(c: string, id: string, fn: (data: any) => any, by: string | null): Promise<Doc | null> {
  checkRef(c, id);
  return tx(async t => {
    const cur = await t.q('select data from docs where collection = $1 and id = $2 and not deleted for update', [c, id]);
    if (!cur.rows[0]) return null;
    const next = await fn(structuredClone(cur.rows[0].data));
    if (next === undefined || next === null) return null;
    checkData(next);
    const r = await t.q(
      `update docs set data = $3, rev = nextval('doc_rev'), updated_at = now(), updated_by = $4
        where collection = $1 and id = $2 returning collection, id, data, rev, deleted, updated_at`,
      [c, id, JSON.stringify(next), by]);
    await history(c, id, 'set', next, by, t.q);
    return row(r.rows[0]);
  });
}

export async function listDocs(c: string): Promise<Doc[]> {
  checkRef(c);
  const r = await q('select collection, id, data, rev, deleted, updated_at from docs where collection = $1 and not deleted', [c]);
  return r.rows.map(row);
}
