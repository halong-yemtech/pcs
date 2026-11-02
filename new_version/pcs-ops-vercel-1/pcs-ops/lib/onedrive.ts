/**
 * Microsoft 365 OneDrive / SharePoint upload via Microsoft Graph (app-only).
 * Env: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET (app permission Files.ReadWrite.All or Sites.Selected)
 * and BACKUP_ONEDRIVE_USER (a mailbox/OneDrive owner, e.g. backups@pcs.com.au) or BACKUP_DRIVE_ID (a SharePoint library).
 */
export function oneDriveConfigured() {
  return !!(process.env.GRAPH_TENANT_ID && process.env.GRAPH_CLIENT_ID && process.env.GRAPH_CLIENT_SECRET && (process.env.BACKUP_ONEDRIVE_USER || process.env.BACKUP_DRIVE_ID));
}
async function token() {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GRAPH_CLIENT_ID!, client_secret: process.env.GRAPH_CLIENT_SECRET!, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }),
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Microsoft sign-in failed: ${d.error_description || d.error || r.status}`);
  return d.access_token as string;
}
const drive = () => (process.env.BACKUP_DRIVE_ID ? `https://graph.microsoft.com/v1.0/drives/${process.env.BACKUP_DRIVE_ID}` : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.BACKUP_ONEDRIVE_USER!)}/drive`);

export async function oneDrivePut(path: string, body: Buffer) {
  const t = await token();
  const p = path.split('/').map(encodeURIComponent).join('/');
  if (body.length <= 4 * 1024 * 1024) {
    const r = await fetch(`${drive()}/root:/${p}:/content`, { method: 'PUT', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/octet-stream' }, body: new Uint8Array(body) });
    if (!r.ok) throw new Error(`OneDrive upload failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
    return `onedrive:/${path}`;
  }
  // large file: upload session in 5 MB chunks (multiple of 320 KiB)
  const s = await fetch(`${drive()}/root:/${p}:/createUploadSession`, { method: 'POST', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) });
  const sd: any = await s.json(); if (!s.ok) throw new Error(`OneDrive session failed: ${sd.error?.message || s.status}`);
  const CH = 320 * 1024 * 16;
  for (let i = 0; i < body.length; i += CH) {
    const part = body.subarray(i, Math.min(i + CH, body.length));
    const r = await fetch(sd.uploadUrl, { method: 'PUT', headers: { 'content-length': String(part.length), 'content-range': `bytes ${i}-${i + part.length - 1}/${body.length}` }, body: new Uint8Array(part) });
    if (![200, 201, 202].includes(r.status)) throw new Error(`OneDrive chunk failed (${r.status})`);
  }
  return `onedrive:/${path}`;
}
