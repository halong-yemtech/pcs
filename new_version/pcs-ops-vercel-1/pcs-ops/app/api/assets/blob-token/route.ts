import { requireUser } from '@/lib/auth';
import { ApiError, fail, json } from '@/lib/http';
import { ALLOWED_TYPES, maxBytes, storageDriver } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Issues a short-lived client token so the browser can upload large files straight to Vercel Blob
 * (Vercel functions accept at most 4.5 MB request bodies). See @vercel/blob/client handleUpload.
 */
export async function POST(req: Request) {
  try {
    if (storageDriver() !== 'vercel-blob') throw new ApiError(400, 'invalid_argument', 'Blob storage is not enabled');
    const { handleUpload } = await import('@vercel/blob/client');
    const body = await req.json();
    // The upload-completed callback from Vercel carries no session; it is verified by handleUpload itself.
    if (body?.type === 'blob.generate-client-token') await requireUser(req, 'editor');
    const out = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...ALLOWED_TYPES], maximumSizeInBytes: maxBytes(), addRandomSuffix: true,
      }),
      onUploadCompleted: async () => { /* the browser registers the file via /api/assets/register */ },
    });
    return json(out);
  } catch (e) {
    return fail(e);
  }
}
