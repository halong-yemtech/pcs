// Applies db/schema.sql (idempotent). Run: npm run db:migrate   (needs DATABASE_URL)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (!process.env.DATABASE_URL) { console.warn('DATABASE_URL not set; skipping migration'); process.exit(0); }
const url = process.env.DATABASE_URL;
const ssl = /sslmode=require|neon\.tech|supabase|amazonaws/.test(url) ? { rejectUnauthorized: false } : undefined;
const client = new pg.Client({ connectionString: url, ssl });
await client.connect();
await client.query(fs.readFileSync(path.join(root, 'db/schema.sql'), 'utf8'));
await client.end();
console.log('database schema up to date');
