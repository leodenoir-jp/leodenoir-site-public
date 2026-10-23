import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('booking writes keep package credits in Supabase and restore them on cancellation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table public.lesson_packages (
        id uuid primary key, student_id uuid not null, lesson_kind text not null,
        purchased_lessons integer not null, remaining_lessons integer not null,
        purchased_at timestamptz not null default now()
      );
      create table public.bookings (
        id uuid primary key, student_id uuid not null, lesson_kind text not null,
        status text not null, note text
      );
    `);
    const migration = await readFile('supabase/migrations/20261023_learning_booking_sync.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const student = '11111111-1111-4111-8111-111111111111';
    await db.query('insert into public.lesson_packages(id,student_id,lesson_kind,purchased_lessons,remaining_lessons) values($1,$2,$3,$4,$5)',
      ['22222222-2222-4222-8222-222222222222', student, 'japanese', 3, 3]);
    const remaining = async () => (await db.query('select sum(remaining_lessons)::int as value from public.lesson_packages where student_id=$1', [student])).rows[0].value;
    assert.equal(await remaining(), 3);
    const first = '33333333-3333-4333-8333-333333333333';
    const second = '44444444-4444-4444-8444-444444444444';
    await db.query('insert into public.bookings(id,student_id,lesson_kind,status) values($1,$2,$3,$4),($5,$2,$3,$4)',
      [first, student, 'japanese', 'requested', second]);
    assert.equal(await remaining(), 1);
    await db.query("update public.bookings set status='approved' where id=$1", [first]);
    assert.equal(await remaining(), 1);
    await db.query("update public.bookings set status='cancelled' where id=$1", [first]);
    assert.equal(await remaining(), 2);
    await db.query('insert into public.lesson_packages(id,student_id,lesson_kind,purchased_lessons,remaining_lessons) values($1,$2,$3,$4,$5)',
      ['55555555-5555-4555-8555-555555555555', student, 'japanese', 2, 2]);
    assert.equal(await remaining(), 4);
    await db.query('delete from public.bookings where id=$1', [second]);
    assert.equal(await remaining(), 5);
    const { rows } = await db.query("select column_name from information_schema.columns where table_name='bookings' and column_name like 'lesson_note%'");
    assert.equal(rows.length, 2);
  } finally {
    await db.close();
  }
});

test('student booking API authenticates and saves a booking with its calendar reservation', async () => {
  const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
  const bundled = await build({ entryPoints: ['api/learning.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(require, module, module.exports);
  const handler = module.exports.default;
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  const studentId = '11111111-1111-4111-8111-111111111111';
  const bookingId = '22222222-2222-4222-8222-222222222222';
  const start = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const end = new Date(new Date(start).getTime() + 50 * 60_000).toISOString();
  const writes = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const call = async (token) => {
    const result = { statusCode: 0, body: null };
    await handler({ method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: {
      action: 'request-bookings', lessonKind: 'japanese', lessonMenuId: 'jp-custom-50',
      bookings: [{ start, end, note: 'Test booking' }]
    } }, { setHeader() {}, status(code) { result.statusCode = code; return { json(body) { result.body = body; } }; } });
    return result;
  };
  try {
    process.env.VITE_SUPABASE_URL = 'https://learning.example.invalid';
    process.env.VITE_SUPABASE_ANON_KEY = 'test-anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') return json({ id: studentId, email: 'student@example.com' });
      if (url.pathname === '/rest/v1/students') return json([{ id: studentId, email: 'student@example.com', name: 'Student' }]);
      if (url.pathname === '/rest/v1/lesson_packages') return json([{ lesson_kind: 'japanese', lesson_menu_id: 'jp-custom-50', purchased_lessons: 3, remaining_lessons: 3 }]);
      if (url.pathname === '/rest/v1/availability_slots') return json([{ starts_at: start, ends_at: end }]);
      if (url.pathname === '/rest/v1/bookings' && options.method === 'POST') {
        writes.push('booking');
        return json([{ id: bookingId, requested_at: new Date().toISOString(), requested_slot: start }], 201);
      }
      if (url.pathname === '/rest/v1/bookings') return json([]);
      if (url.pathname === '/rest/v1/calendar_reservations' && options.method === 'POST') {
        writes.push('reservation');
        return json({}, 201);
      }
      throw new Error(`Unexpected test request: ${url.pathname}`);
    };
    assert.equal((await call('')).statusCode, 401);
    const result = await call('test-token');
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.bookings[0].id, bookingId);
    assert.deepEqual(writes, ['reservation', 'booking']);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
