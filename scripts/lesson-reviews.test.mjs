import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);

test('reviews remain pending across reads and become public only after approval', async () => {
  const db = new PGlite();
  try {
    const migration = await readFile('supabase/migrations/20261023_lesson_reviews.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const inserted = await db.query(
      'insert into public.lesson_reviews(student_name,student_email,rating,comment) values($1,$2,$3,$4) returning id,status',
      ['Emma', 'emma@example.com', 5, 'A thoughtful lesson.']
    );
    const id = inserted.rows[0].id;
    assert.equal(inserted.rows[0].status, 'pending');
    assert.equal((await db.query("select count(*)::int as count from public.lesson_reviews where status='approved'")).rows[0].count, 0);
    assert.equal((await db.query("select count(*)::int as count from public.lesson_reviews where status='pending'")).rows[0].count, 1);
    await db.query("update public.lesson_reviews set status='approved',approved_at=now() where id=$1 and status='pending'", [id]);
    assert.equal((await db.query("select count(*)::int as count from public.lesson_reviews where status='approved'")).rows[0].count, 1);
    const { rows } = await db.query("select relrowsecurity from pg_class where oid='public.lesson_reviews'::regclass");
    assert.equal(rows[0].relrowsecurity, true);
  } finally {
    await db.close();
  }
});

test('review API persists submissions, hides pending posts, and requires tutor approval', async () => {
  const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
  const bundle = await build({ entryPoints: ['api/learning.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
  const handler = module.exports.default;
  const previousFetch = globalThis.fetch;
  const previousEnv = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    LEARNING_TUTOR_LOGIN_PASSWORD: process.env.LEARNING_TUTOR_LOGIN_PASSWORD
  };
  const record = {
    id: '11111111-1111-4111-8111-111111111111',
    student_name: 'Test reviewer',
    student_email: 'reviewer@example.com',
    rating: 5,
    comment: 'A test review.',
    status: 'pending',
    posted_at: '2026-10-23T00:00:00Z'
  };
  const requests = [];
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const call = async (method, query, body, token = '') => {
    const result = { statusCode: 0, body: null };
    await handler(
      { method, query, body, headers: token ? { authorization: `Bearer ${token}` } : {} },
      { setHeader() {}, status(code) { result.statusCode = code; return { json(value) { result.body = value; } }; } }
    );
    return result;
  };
  try {
    process.env.VITE_SUPABASE_URL = 'https://reviews.example.invalid';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
    process.env.LEARNING_TUTOR_LOGIN_PASSWORD = 'test-password';
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(String(input));
      requests.push({ method: options.method || 'GET', pathname: url.pathname });
      assert.equal(url.pathname, '/rest/v1/lesson_reviews');
      if (options.method === 'POST') return response(record, 201);
      if (options.method === 'PATCH') { record.status = 'approved'; return response(record); }
      return response(record.status === 'approved' ? [record] : []);
    };
    const created = await call('POST', {}, { action: 'submit-review', studentName: record.student_name, studentEmail: record.student_email, rating: 5, comment: record.comment });
    assert.equal(created.statusCode, 201);
    assert.equal(created.body.review.status, 'pending');
    assert.equal(created.body.review.studentEmail, undefined);
    assert.equal((await call('GET', { mode: 'reviews' })).body.reviews.length, 0);
    assert.equal((await call('POST', {}, { action: 'approve-review', reviewId: record.id })).statusCode, 401);
    const login = await call('POST', {}, { action: 'admin-login', email: 'yu.biz003@outlook.com', password: 'test-password' });
    assert.equal(login.statusCode, 200);
    assert.equal((await call('POST', {}, { action: 'approve-review', reviewId: record.id }, login.body.token)).statusCode, 200);
    const approved = await call('GET', { mode: 'reviews' });
    assert.equal(approved.body.reviews.length, 1);
    assert.equal(approved.body.reviews[0].studentEmail, undefined);
    assert.deepEqual(requests.map(item => item.method), ['POST', 'GET', 'PATCH', 'GET']);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
