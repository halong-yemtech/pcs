/*
 * PCS backend adapter for the browser.
 *
 * The operations UI (app.js) was first built on claude.ai's artifact runtime, which exposes
 * window.claude.use('db' | 'assets' | 'downloads' | 'user'). This file provides the same API on
 * top of this deployment's REST endpoints, so app.js runs unchanged:
 *
 *   db         → /api/db/*        (Postgres documents; live updates by polling the change feed)
 *   assets     → /api/assets/*    (Vercel Blob or Postgres; files served at /_blob/<id>)
 *   downloads  → browser download
 *   user       → /api/me, /api/users/profiles  (staff sign-in; provider chosen by the dev team)
 *
 * window.PCS exposes the deployment (Xero endpoints etc.) to the parts of app.js that only
 * exist on the hosted version.
 */
(function () {
  'use strict';
  const POLL_MS = 3000, POLL_HIDDEN_MS = 20000;

  class ApiErr extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } }

  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: 'same-origin', ...opts, headers: { accept: 'application/json', ...(opts.headers || {}) } });
    if (res.status === 401) { signIn(); throw new ApiErr('unauthenticated', 'Sign in required', 401); }
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) { const e = (data && data.error) || {}; throw new ApiErr(e.code || 'http_' + res.status, e.message || ('Request failed (' + res.status + ')'), res.status); }
    return data;
  }
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let signingIn = false;
  function signIn() { if (signingIn) return; signingIn = true; location.href = '/api/auth/login?next=' + encodeURIComponent(location.pathname); }

  // ── documents ────────────────────────────────────────────────────────
  const cache = new Map();          // collection → Map(id → {data, rev})
  const loaded = new Set();         // collections fully loaded
  const loading = new Map();        // collection → Promise
  const listeners = new Set();      // {kind:'coll'|'doc', c, id?, filters, cb, err}
  let rev = 0, polling = false, failures = 0, pending = new Set(), batchTimer = null, batchWaiters = [];

  const coll = c => { if (!cache.has(c)) cache.set(c, new Map()); return cache.get(c); };
  const randomId = () => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; const b = crypto.getRandomValues(new Uint8Array(20)); return Array.from(b, x => a[x % a.length]).join(''); };

  function apply(d) {
    const m = coll(d.c), cur = m.get(d.id);
    if (cur && cur.rev >= d.rev) return false;
    if (d.deleted) { if (!cur) { m.set(d.id, { rev: d.rev, deleted: true }); return false; } m.set(d.id, { rev: d.rev, deleted: true }); return true; }
    m.set(d.id, { data: d.data, rev: d.rev });
    return true;
  }

  // Load several collections in one request when subscriptions arrive in the same tick.
  function ensure(c) {
    if (loaded.has(c)) return Promise.resolve();
    if (loading.has(c)) return loading.get(c);
    pending.add(c);
    const p = new Promise((resolve, reject) => batchWaiters.push({ c, resolve, reject }));
    loading.set(c, p);
    if (!batchTimer) batchTimer = setTimeout(flushLoads, 0);
    return p;
  }
  async function flushLoads() {
    const cs = [...pending], waiters = batchWaiters;
    pending = new Set(); batchWaiters = []; batchTimer = null;
    try {
      const snap = await api('/api/db/snapshot?c=' + encodeURIComponent(cs.join(',')));
      snap.docs.forEach(apply);
      cs.forEach(c => { coll(c); loaded.add(c); loading.delete(c); });
      if (!rev || snap.rev < rev) rev = rev ? Math.min(rev, snap.rev) : snap.rev;
      waiters.forEach(w => w.resolve());
      startPolling();
    } catch (e) {
      cs.forEach(c => loading.delete(c));
      waiters.forEach(w => w.reject(e));
    }
  }

  const docSnap = (id, entry) => ({ id, exists: !!(entry && !entry.deleted), data: () => (entry && !entry.deleted ? entry.data : undefined) });
  const OPS = {
    '==': (a, b) => a === b, '!=': (a, b) => a !== b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b,
    'in': (a, b) => Array.isArray(b) && b.includes(a), 'array-contains': (a, b) => Array.isArray(a) && a.includes(b),
  };
  const get = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  function collSnap(c, filters) {
    const docs = [];
    for (const [id, e] of coll(c)) {
      if (e.deleted) continue;
      if (filters.every(f => OPS[f.op] && OPS[f.op](get(e.data, f.field), f.value))) docs.push(docSnap(id, e));
    }
    return { docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn) };
  }
  function notify(changedColls) {
    for (const l of listeners) {
      if (!changedColls.has(l.c)) continue;
      try { l.kind === 'coll' ? l.cb(collSnap(l.c, l.filters)) : l.cb(docSnap(l.id, coll(l.c).get(l.id))); }
      catch (e) { console.error(e); }
    }
  }

  function startPolling() {
    if (polling) return; polling = true;
    const tick = async () => {
      const cs = [...loaded];
      if (cs.length) {
        try {
          const r = await api('/api/db/changes?since=' + rev + '&c=' + encodeURIComponent(cs.join(',')));
          const changed = new Set();
          r.docs.forEach(d => { if (apply(d)) changed.add(d.c); });
          rev = Math.max(rev, r.rev);
          failures = 0;
          if (changed.size) notify(changed);
        } catch (e) {
          if (e.status === 401) return;
          if (++failures === 5) for (const l of listeners) if (l.err) try { l.err(e); } catch (x) {}
        }
      }
      setTimeout(tick, document.hidden ? POLL_HIDDEN_MS : POLL_MS);
    };
    setTimeout(tick, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSoon(); });
  }
  let soon = null;
  function refreshSoon() {
    if (soon) return;
    soon = setTimeout(async () => {
      soon = null;
      try {
        const r = await api('/api/db/changes?since=' + rev + '&c=' + encodeURIComponent([...loaded].join(',')));
        const changed = new Set(); r.docs.forEach(d => { if (apply(d)) changed.add(d.c); }); rev = Math.max(rev, r.rev);
        if (changed.size) notify(changed);
      } catch (e) {}
    }, 50);
  }

  async function write(op, c, id, data) {
    const r = await post('/api/db/write', { op, c, id, data });
    if (r && r.doc) { if (apply(r.doc)) notify(new Set([r.doc.c])); }
    return r && r.doc;
  }

  function docRef(c, id) {
    return {
      id, path: c + '/' + id,
      async get() {
        if (loaded.has(c)) return docSnap(id, coll(c).get(id));
        const r = await api('/api/db/doc?c=' + encodeURIComponent(c) + '&id=' + encodeURIComponent(id));
        return { id, exists: r.exists, data: () => (r.doc ? r.doc.data : undefined) };
      },
      set: data => write('set', c, id, data).then(() => undefined),
      update: patch => write('update', c, id, patch).then(() => undefined),
      delete: () => write('delete', c, id).then(() => undefined),
      onSnapshot(cb, err) {
        const l = { kind: 'doc', c, id, cb, err };
        listeners.add(l);
        ensure(c).then(() => { if (listeners.has(l)) cb(docSnap(id, coll(c).get(id))); }, e => err && err(e));
        return () => listeners.delete(l);
      },
    };
  }
  function query(c, filters) {
    return {
      where: (field, op, value) => query(c, [...filters, { field, op, value }]),
      doc: id => docRef(c, id || randomId()),
      async add(data) { const id = randomId(); await write('set', c, id, data); return docRef(c, id); },
      async get() { await ensure(c); return collSnap(c, filters); },
      onSnapshot(cb, err) {
        const l = { kind: 'coll', c, filters, cb, err };
        listeners.add(l);
        ensure(c).then(() => { if (listeners.has(l)) cb(collSnap(c, filters)); }, e => err && err(e));
        return () => listeners.delete(l);
      },
    };
  }
  const db = {
    collection: c => query(c, []),
    doc(path) { const i = path.lastIndexOf('/'); return docRef(path.slice(0, i), path.slice(i + 1)); },
  };

  // ── files ────────────────────────────────────────────────────────────
  let assetCfg = null;
  const assets = {
    async upload(file, opts = {}) {
      const type = opts.type || file.type || 'application/octet-stream';
      assetCfg = assetCfg || await api('/api/assets/config');
      if (file.size > assetCfg.maxBytes) throw new ApiErr('too_large', 'File is too large');
      if (assetCfg.driver === 'vercel-blob' && file.size > assetCfg.serverUploadMax) {
        await loadBlobClient();
        if (!window.PCSBlob) throw new ApiErr('too_large', 'Large uploads are not available on this deployment (max 4 MB)');
        const name = 'assets/' + randomId() + '/' + (file.name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_');
        const b = await window.PCSBlob.upload(name, file, { access: 'public', handleUploadUrl: '/api/assets/blob-token', contentType: type });
        return post('/api/assets/register', { url: b.url, pathname: b.pathname, contentType: type, size: file.size, name: file.name });
      }
      return api('/api/assets/upload', { method: 'POST', headers: { 'content-type': type, 'x-filename': encodeURIComponent(file.name || 'file') }, body: file });
    },
  };
  let blobLoad = null;
  function loadBlobClient() {
    if (window.PCSBlob) return Promise.resolve();
    return blobLoad || (blobLoad = new Promise(res => { const s = document.createElement('script'); s.src = '/app/blob-client.js'; s.onload = res; s.onerror = res; document.head.appendChild(s); }));
  }

  // ── downloads ────────────────────────────────────────────────────────
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.csv$/i.test(filename) ? 'text/csv' : 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename || 'download';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },
  };

  // ── user ─────────────────────────────────────────────────────────────
  let mePromise = null;
  const me = () => mePromise || (mePromise = api('/api/me'));
  const user = {
    id: async () => (await me()).id,
    can: async perm => { const m = await me(); return perm === 'data.write' ? !!m.canWrite : m.role === 'admin'; },
    profiles: ids => post('/api/users/profiles', { ids }),
  };

  window.claude = { use: async name => ({ db, assets, downloads, user })[name] || null };
  window.PCS = { hosted: true, api, post, me };
})();
