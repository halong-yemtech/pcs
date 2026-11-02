import { q } from './db';
import { emailConfig, send } from './email';
import { makeZip } from './zip';
import { s3Configured, s3Put } from './s3';
import { oneDriveConfigured, oneDrivePut } from './onedrive';
import { readAssetBytes, safeName } from './storage';
import { adminEmails } from './alerts';

/**
 * Weekly off-site backup (Vercel Cron) or on demand (Company → Backups).
 * Each run writes  <prefix>/YYYY-MM-DD/pcs-data_<stamp>.zip  (every record, as data.json in the importer's format)
 * and copies any NEW uploaded files once to  <prefix>/files/<assetId>-<name>  (incremental).
 * Targets (any or all): S3-compatible storage, Microsoft 365 OneDrive/SharePoint, and an emailed copy of the data zip.
 */
export function backupTargets() {
  const t: string[] = [];
  if (s3Configured()) t.push('s3');
  if (oneDriveConfigured()) t.push('onedrive');
  if (process.env.BACKUP_EMAIL_TO && emailConfig().configured) t.push('email');
  return t;
}
const prefix = () => (process.env.BACKUP_PREFIX || 'pcs-backups').replace(/^\/+|\/+$/g, '');

async function putAll(targets: string[], path: string, body: Buffer, type: string) {
  const out: string[] = [];
  if (targets.includes('s3')) out.push(await s3Put(path, body, type));
  if (targets.includes('onedrive')) out.push(await oneDrivePut(path, body));
  return out;
}

export async function runBackup(trigger: 'weekly' | 'manual', by: string | null) {
  const targets = backupTargets();
  const started = new Date();
  const day = started.toISOString().slice(0, 10), stamp = started.toISOString().replace(/[-:]/g, '').slice(0, 15);
  try {
    if (!targets.length) throw new Error('No backup destination is set up (S3_*, BACKUP_ONEDRIVE_USER / BACKUP_DRIVE_ID, or BACKUP_EMAIL_TO)');
    const r = await q(`select collection, id, data from docs where not deleted and collection not in ('alertsent') order by collection, id`);
    const collections: Record<string, any[]> = {};
    for (const x of r.rows) (collections[x.collection] ||= []).push({ id: x.id, data: x.data });
    const a = await q('select id, original_name as name, content_type as "contentType", size_bytes as size from assets order by created_at');
    const assets = a.rows.map((x: any) => ({ ...x, file: `files/${x.id}-${safeName(x.name || x.id)}` }));
    const data = { format: 'pcs-export', version: 1, exportedAt: started.toISOString(), source: 'vercel-backup', collections, assets };
    const zip = makeZip([
      { name: 'data.json', data: Buffer.from(JSON.stringify(data)) },
      { name: 'README.txt', data: Buffer.from(`PCS operations backup ${started.toISOString()}\nRecords: ${r.rows.length}. Files: ${assets.length} (stored once in ${prefix()}/files/).\nRestore: npm run db:import -- pcs-data_${stamp}.zip --files <folder with the files>\n`) },
    ]);
    const name = `${prefix()}/${day}/pcs-data_${stamp}.zip`;
    const locations = await putAll(targets, name, zip, 'application/zip');

    // files: copy each uploaded file off-site once per target
    let filesNew = 0;
    for (const t of targets.filter(x => x !== 'email')) {
      const done = new Set((await q('select asset_id from backup_files where target = $1', [t])).rows.map((x: any) => x.asset_id));
      for (const f of assets) {
        if (done.has(f.id)) continue;
        if (Date.now() - started.getTime() > 45_000) break; // stay inside the function time limit; the rest go next run
        const b = await readAssetBytes(f.id); if (!b) continue;
        await putAll([t], `${prefix()}/${f.file}`, Buffer.from(b.buf), f.contentType);
        await q('insert into backup_files (asset_id, target) values ($1, $2) on conflict do nothing', [f.id, t]);
        filesNew++;
      }
    }

    if (targets.includes('email')) {
      const cfg = emailConfig();
      const to = String(process.env.BACKUP_EMAIL_TO).split(',').map(s => s.trim()).filter(Boolean);
      if (zip.length < 10 * 1024 * 1024) {
        await send({ from: cfg.from, to, cc: [], subject: `PCS backup ${day}`, text: `Weekly backup of the PCS operations system: ${r.rows.length} records.\nKeep this email; the attachment restores every record (files are stored separately${locations.length ? ' in ' + locations.join(', ') : ''}).`, attachments: [{ filename: `pcs-data_${stamp}.zip`, contentType: 'application/zip', content: zip }] });
        locations.push(`email:${to.join(',')}`);
      } else locations.push('email skipped (over 10 MB)');
    }
    await q(`insert into backups (trigger, ok, targets, location, documents, files_new, bytes, by) values ($1, true, $2, $3, $4, $5, $6, $7)`,
      [trigger, targets.join(','), locations.join(' | '), r.rows.length, filesNew, zip.length, by]);
    return { ok: true, targets, locations, documents: r.rows.length, filesNew, bytes: zip.length };
  } catch (e: any) {
    await q(`insert into backups (trigger, ok, targets, error, by) values ($1, false, $2, $3, $4)`, [trigger, targets.join(','), e?.message || 'failed', by]);
    // tell the admins straight away
    try {
      const cfg = emailConfig(); const to = await adminEmails();
      if (cfg.configured && to.length) await send({ from: cfg.from, to, cc: [], subject: 'PCS backup FAILED', text: `The ${trigger} backup of the PCS operations system failed at ${started.toISOString()}:\n\n${e?.message}\n\nOpen Company → Backups to retry.`, attachments: [] });
    } catch { /* ignore */ }
    return { ok: false, error: e?.message || 'failed', targets };
  }
}

export async function backupStatus() {
  const r = await q('select id, at, trigger, ok, targets, location, documents, files_new, bytes, error, by from backups order by at desc limit 20');
  const last = r.rows.find((x: any) => x.ok);
  return { targets: backupTargets(), runs: r.rows, lastOk: last?.at || null, overdue: !last || Date.now() - new Date(last.at).getTime() > 8 * 864e5 };
}
