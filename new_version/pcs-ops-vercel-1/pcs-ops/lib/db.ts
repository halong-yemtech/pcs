import pg from 'pg';

/** Shared Postgres pool (reused across invocations of a warm serverless function). */
type Q = { rows: any[]; rowCount: number };
const g = globalThis as any;

export function pool(): any {
  if (!g.__pcsPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    const ssl = /sslmode=require|neon\.tech|supabase|amazonaws/.test(url) ? { rejectUnauthorized: false } : undefined;
    g.__pcsPool = new (pg as any).Pool({ connectionString: url, max: 5, ssl, idleTimeoutMillis: 10_000 });
  }
  return g.__pcsPool;
}

export async function q(text: string, params: any[] = []): Promise<Q> {
  return pool().query(text, params);
}

/** Run fn inside a transaction on one connection. */
export async function tx<T>(fn: (c: { q: (t: string, p?: any[]) => Promise<Q> }) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('begin');
    const out = await fn({ q: (t, p = []) => client.query(t, p) });
    await client.query('commit');
    return out;
  } catch (e) {
    try { await client.query('rollback'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
