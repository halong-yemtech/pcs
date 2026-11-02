// Local test harness: runs the Next.js route handlers, middleware, rewrites and /public on a plain
// Node HTTP server (the sandbox has no npm registry, so `next` itself can't be installed here).
// Route handlers only use Web-standard Request/Response, so they run unchanged.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const esbuild = await import('esbuild').catch(() => import('/opt/npm-tools/node_modules/esbuild/lib/main.js'));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test/.build');

function walk(dir, acc = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, acc); else if (f.name === 'route.ts') acc.push(p);
  }
  return acc;
}

export async function start(port = 3100) {
  const files = walk(path.join(root, 'app/api'));
  fs.rmSync(out, { recursive: true, force: true });
  await esbuild.build({
    entryPoints: [...files, path.join(root, 'middleware.ts')], outdir: out, outbase: root, bundle: true, platform: 'node', format: 'esm',
    target: 'node20', external: ['pg', '@vercel/blob', '@vercel/blob/client'], outExtension: { '.js': '.mjs' }, logLevel: 'error',
    tsconfig: path.join(root, 'tsconfig.json'),
  });
  const routes = [];
  for (const f of files) {
    const rel = path.relative(path.join(root, 'app'), path.dirname(f)).split(path.sep);
    const keys = [];
    const re = new RegExp('^/' + rel.map(s => { const m = /^\[(.+)\]$/.exec(s); if (m) { keys.push(m[1]); return '([^/]+)'; } return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('/') + '$');
    const mod = await import(pathToFileURL(path.join(out, path.relative(root, f)).replace(/\.ts$/, '.mjs')).href);
    routes.push({ re, keys, mod });
  }
  routes.sort((x, y) => x.keys.length - y.keys.length); // static segments win over [dynamic], as in Next
  const mw = await import(pathToFileURL(path.join(out, 'middleware.mjs')).href);
  const inner = mw.config.matcher[0].replace(/^\/\(/, '').replace(/\)$/, '');
  const mwRe = new RegExp('^/' + inner + '$');

  const server = http.createServer(async (req, res) => {
    try {
      const chunks = []; for await (const c of req) chunks.push(c);
      const bodyBuf = Buffer.concat(chunks);
      const base = `http://localhost:${port}`;
      const url = new URL(req.url, base);
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
      const mk = u => new Request(u, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuf, duplex: 'half' });
      let request = mk(url.toString());
      // middleware (same matcher as Next)
      if (mwRe.test(url.pathname)) { const r = await mw.middleware(request); if (r) return send(res, r); }
      // rewrites
      let p = url.pathname;
      if (p === '/') p = '/index.html';
      const blob = /^\/_blob\/([^/]+)$/.exec(p); if (blob) p = `/api/assets/${blob[1]}`;
      if (p !== url.pathname) { const u2 = new URL(url); u2.pathname = p; request = mk(u2.toString()); }
      if (p.startsWith('/api/')) {
        for (const r of routes) {
          const m = r.re.exec(p); if (!m) continue;
          const fn = r.mod[req.method]; if (!fn) return send(res, new Response('Method not allowed', { status: 405 }));
          const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
          return send(res, await fn(request, { params: Promise.resolve(params) }));
        }
        return send(res, new Response('Not found', { status: 404 }));
      }
      const file = path.join(root, 'public', path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
      if (file.startsWith(path.join(root, 'public')) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
        res.writeHead(200, { 'content-type': type }); return res.end(fs.readFileSync(file));
      }
      res.writeHead(404); res.end('not found');
    } catch (e) { console.error('harness error', e); res.writeHead(500); res.end(String(e)); }
  });
  await new Promise(r => server.listen(port, r));
  return server;
}

async function send(res, r) {
  const h = {};
  r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) h['set-cookie'] = sc;
  res.writeHead(r.status, h);
  res.end(Buffer.from(await r.arrayBuffer()));
}
