// Bundled at build time (scripts/build-client.mjs) into public/app/blob-client.js.
// Lets the browser upload large files straight to Vercel Blob.
import { upload } from '@vercel/blob/client';
window.PCSBlob = { upload };
