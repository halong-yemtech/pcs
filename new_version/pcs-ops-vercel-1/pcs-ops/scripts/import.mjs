// Import a PCS export into the database.
//   npm run db:import -- seed/pcs-catalog.json
//   npm run db:import -- ~/Downloads/pcs-export_2026-11-02.zip      (zip = data.json + files/<assetId>)
// Options: --dry-run   show what would be imported
//          --files <folder>   folder holding the backed-up files (pcs-backups/files) for a weekly backup zip
// Documents with the same id are replaced; nothing is deleted. Asset ids are kept, so records still point at their files.
import fs from 'node:fs';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const fi = args.indexOf('--files'); const filesDir = fi >= 0 ? args[fi + 1] : null;
const file = args.find((a, i) => !a.startsWith('--') && (fi < 0 || i !== fi + 1));
const dry = args.includes('--dry-run');
if (!file) { console.error('usage: npm run db:import -- <export.json|export.zip> [--dry-run]'); process.exit(1); }

/** Minimal zip reader (stored + deflated entries) — enough for exports made by the app. */
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Bad zip directory');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(local + 26), lxlen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lnlen + lxlen;
    const raw = buf.subarray(start, start + csize);
    if (!name.endsWith('/')) files.set(name, method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null);
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

const buf = fs.readFileSync(file);
let data, files = new Map();
if (buf.readUInt32LE(0) === 0x04034b50) { files = readZip(buf); data = JSON.parse(files.get('data.json').toString('utf8')); }
else data = JSON.parse(buf.toString('utf8'));
if (data.format !== 'pcs-export') { console.error('Not a PCS export file'); process.exit(1); }

const colls = Object.entries(data.collections || {}).filter(([c]) => c !== 'xero');
const total = colls.reduce((a, [, d]) => a + d.length, 0);
console.log(`Export from ${data.source || 'claude.ai'} at ${data.exportedAt}: ${total} documents in ${colls.length} collections, ${(data.assets || []).length} files`);
for (const [c, d] of colls) console.log(`  ${c.padEnd(12)} ${d.length}`);
if (dry) process.exit(0);

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
const url = process.env.DATABASE_URL;
const ssl = /sslmode=require|neon\.tech|supabase|amazonaws/.test(url) ? { rejectUnauthorized: false } : undefined;
const pg = (await import('pg')).default;
const db = new pg.Client({ connectionString: url, ssl });
await db.connect();
const by = 'import:' + (data.exportedAt || '').slice(0, 10);
let n = 0;
for (const [c, docs] of colls) {
  for (const d of docs) {
    await db.query(
      `insert into docs (collection, id, data, updated_by) values ($1,$2,$3,$4)
       on conflict (collection, id) do update set data = excluded.data, deleted = false, rev = nextval('doc_rev'), updated_at = now(), updated_by = excluded.updated_by`,
      [c, d.id, JSON.stringify(d.data), by]);
    await db.query(`insert into doc_history (collection, id, op, data, by) values ($1,$2,'import',$3,$4)`, [c, d.id, JSON.stringify(d.data), by]);
    if (++n % 100 === 0) process.stdout.write(`\r  ${n}/${total} documents`);
  }
}
console.log(`\r  ${n}/${total} documents imported`);

const driver = process.env.STORAGE_DRIVER || (process.env.BLOB_READ_WRITE_TOKEN ? 'vercel-blob' : 'database');
let fcount = 0, missing = 0;
for (const a of data.assets || []) {
  let bytes = files.get(a.file || `files/${a.id}`);
  if (!bytes && filesDir) {
    const hit = fs.readdirSync(filesDir).find(n => n === String(a.file || '').replace(/^files\//, '') || n.startsWith(a.id + '-') || n === a.id);
    if (hit) bytes = fs.readFileSync(filesDir + '/' + hit);
  }
  if (!bytes) { missing++; continue; }
  const exists = await db.query('select 1 from assets where id = $1', [a.id]);
  if (exists.rows[0]) continue;
  const name = a.name || a.id;
  if (driver === 'vercel-blob') {
    const { put } = await import('@vercel/blob');
    const b = await put(`assets/${a.id}/${name.replace(/[^A-Za-z0-9._-]+/g, '_')}`, bytes, { access: 'public', contentType: a.contentType, addRandomSuffix: true });
    await db.query(`insert into assets (id, storage, key, url, content_type, size_bytes, original_name, uploaded_by) values ($1,'vercel-blob',$2,$3,$4,$5,$6,$7)`,
      [a.id, b.pathname, b.url, a.contentType, bytes.length, name, by]);
  } else {
    await db.query(`insert into assets (id, storage, content_type, size_bytes, original_name, data, uploaded_by) values ($1,'database',$2,$3,$4,$5,$6)`,
      [a.id, a.contentType, bytes.length, name, bytes, by]);
  }
  fcount++;
}
if ((data.assets || []).length) console.log(`  ${fcount} files imported${missing ? `, ${missing} missing from the export` : ''}`);
await db.end();
console.log('done');
