import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import pg from 'pg';

// Use the existing, ignored deployment environment file. Never log connection strings.
const env = parseEnv(await readFile('.vercel/.env.sync.local', 'utf8'));
const connectionString = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL;
if (!connectionString || !connectionString.startsWith('postgres')) {
  console.error('Database URL is not available locally. Use the Supabase SQL Editor.');
  process.exit(1);
}
let url;
try { url = new URL(connectionString); } catch { console.error('Database URL is invalid.'); process.exit(1); }
if (!url.hostname.endsWith('.supabase.com') && !url.hostname.endsWith('.supabase.co')) throw new Error('Unexpected database host');
if (!`${url.hostname} ${url.username}`.includes('tvsusalvplzwhikklfrp')) throw new Error('Unexpected project');
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await client.connect();
  const totals = async () => (await client.query('select (select count(*) from students)::int as students,(select count(*) from lesson_packages)::int as packages,(select count(*) from bookings)::int as bookings')).rows[0];
  const before = await totals();
  if (process.argv.includes('--apply')) {
    await client.query(await readFile('supabase/migrations/20261016_tarot.sql', 'utf8'));
  }
  const schema = (await client.query("select to_regclass('public.tarot_requests') is not null as requests,to_regclass('public.tarot_mail') is not null as mail")).rows[0];
  const after = await totals();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Student totals changed during migration; investigate');
  console.log(JSON.stringify({ connected: true, applied: process.argv.includes('--apply'), schema, studentCountsUnchanged: true }));
} catch (error) {
  console.error(JSON.stringify({ connected: false, code: error.code || 'database_error' }));
  process.exitCode = 1;
} finally { await client.end(); }
