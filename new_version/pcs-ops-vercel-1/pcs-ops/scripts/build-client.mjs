// Browser bundles built at deploy time:
//   public/app/rules.js        ← lib/rules.mjs  (attention rules + approvals, shared with the server)
//   public/app/blob-client.js  ← @vercel/blob/client (large direct uploads)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let esbuild;
try { esbuild = await import('esbuild'); } catch { console.warn('esbuild not installed: using the committed public/app/rules.js'); process.exit(0); }
await esbuild.build({
  entryPoints: [path.join(root, 'lib/rules.mjs')], bundle: true, format: 'iife', globalName: 'PCSRules',
  platform: 'browser', target: 'es2020', outfile: path.join(root, 'public/app/rules.js'),
  banner: { js: '/* generated from lib/rules.mjs by scripts/build-client.mjs: edit that file, not this one */' },
});
console.log('built public/app/rules.js');
try {
  await esbuild.build({
    entryPoints: [path.join(root, 'client/blob-upload.js')], bundle: true, minify: true, format: 'iife',
    platform: 'browser', target: 'es2020', outfile: path.join(root, 'public/app/blob-client.js'),
  });
  console.log('built public/app/blob-client.js');
} catch (e) {
  console.warn('blob client not built (large uploads will fall back to server upload, max ~4 MB):', e.message);
}
