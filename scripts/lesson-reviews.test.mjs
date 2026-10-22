import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

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
