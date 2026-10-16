import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
async function load(entry, plugins = []) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const domain = await load('shared/tarot.ts');
const { thirdBusinessDay } = await load('api/tarot.ts');
const iso = value => new Date(`${value}+09:00`).toISOString();

test('availability: disabled by default, correct weekday, buffers and exclusions', () => {
  const settings = domain.defaultTarotSettings();
  const now = new Date('2026-10-15T00:00:00+09:00');
  settings.horizon_days = 3; settings.lead_hours = 0;
  settings.weekly_rules[5] = { enabled: true, start: '17:00', end: '21:00' };
  assert.equal(domain.tarotSlots(settings, [], [], 'online', now).length, 0);
  settings.enabled = true;
  const slots = domain.tarotSlots(settings, [], [], 'online', now);
  assert.equal(slots.length, 7);
  assert.ok(slots.every(s => domain.jstDate(s.start) === '2026-10-16'));
  assert.equal(domain.tarotSlots(settings, [], [], 'email', now).length, 0);
  const busy = [{ starts_at: iso('2026-10-16T16:00:00'), ends_at: iso('2026-10-16T17:00:00') }];
  const inPerson = domain.tarotSlots(settings, busy, [], 'in_person', now);
  assert.equal(inPerson[0].bufferBlocked, true);
  assert.equal(inPerson.find(s => s.start === iso('2026-10-16T18:00:00')).bufferBlocked, false);
  settings.date_overrides = [{ date: '2026-10-16', enabled: false, start: '17:00', end: '21:00' }];
  assert.equal(domain.tarotSlots(settings, [], [], 'online', now).length, 0);
  settings.date_overrides[0].enabled = true;
  settings.date_overrides[0].excluded_times = ['17:00'];
  assert.equal(domain.tarotSlots(settings, [], [], 'online', now).length, 6);
  assert.equal(domain.tarotSlots(settings, [], Array(3).fill(iso('2026-10-16T17:00:00')), 'online', now).length, 0);
  assert.throws(() => domain.validateSettings({ ...settings, daily_limit: 0 }));
});

test('date overrides outside the publication horizon remain saved but need a longer window', () => {
  const settings = domain.defaultTarotSettings();
  const now = new Date('2026-10-16T00:00:00+09:00');
  settings.enabled = true;
  settings.horizon_days = 31;
  settings.date_overrides = ['2026-11-20', '2026-11-21'].map(date => ({ date, enabled: true, start: '17:00', end: '21:00' }));
  assert.equal(domain.tarotSlots(settings, [], [], 'online', now).length, 0);
  const window = domain.tarotPublicationWindow(settings, now);
  assert.equal(window.lastDate, '2026-11-15');
  assert.equal(window.requiredDays, 37);
  assert.deepEqual(window.outsideDates, ['2026-11-20', '2026-11-21']);
  settings.horizon_days = window.requiredDays;
  assert.equal(domain.tarotSlots(settings, [], [], 'online', now).length, 14);
  assert.deepEqual(domain.tarotPublicationWindow(settings, now).outsideDates, []);
});

test('business-day due date excludes Japanese holidays and weekends in any machine timezone', () => {
  assert.equal(domain.jstDate(thirdBusinessDay(iso('2026-10-09T12:00:00'))), '2026-10-15');
  assert.equal(domain.jstDate(thirdBusinessDay(iso('2026-10-16T12:00:00'))), '2026-10-21');
});

test('SQL: atomic reservations, exclusion, idempotency, RLS, mail deadlines and cancellation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table counseling_clients(id uuid primary key default gen_random_uuid(),client_id text unique not null,email text unique not null,display_name text not null,zoom_link text,created_at timestamptz default now(),updated_at timestamptz default now());`);
    await db.exec(await readFile('supabase/migrations/20260911_calendar_reservations.sql', 'utf8'));
    const sql = await readFile('supabase/migrations/20261016_tarot.sql', 'utf8');
    await db.exec(sql);
    await db.exec(sql); // Rerunning the migration must preserve data and work.
    const settings = { ...domain.defaultTarotSettings(), enabled: true, lead_hours: 0 };
    await db.query('insert into tarot_settings(id,settings) values(true,$1)', [settings]);
    const date = new Date(Date.now() + 5 * 86400000).toISOString();
    const first = '11111111-1111-4111-8111-111111111111';
    const second = '22222222-2222-4222-8222-222222222222';
    const create = (id, mode, start, mails = []) => db.query('select tarot_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, `${id}@example.com`, 'Test client', mode, start, {}, '', false, settings, mails]);
    await create(first, 'online', date);
    await create(first, 'online', date);
    assert.equal((await db.query('select * from tarot_requests')).rows.length, 1);
    await assert.rejects(create(second, 'in_person', domain.addMinutes(date, 60)));
    assert.equal((await db.query('select * from tarot_requests')).rows.length, 1, 'conflict must not leave an orphan request');
    await db.query("select tarot_update($1,1,$2,'[]')", [first, { status: 'cancelled', cancellation_reason: 'test' }]);
    assert.equal((await db.query("select status from calendar_reservations where source_id=$1", [first])).rows[0].status, 'cancelled');
    await create(second, 'in_person', date);
    const reserved = (await db.query('select * from calendar_reservations where source_id=$1', [second])).rows[0];
    assert.equal(Date.parse(reserved.ends_at) - Date.parse(reserved.starts_at), 170 * 60000);
    await assert.rejects(db.query("select tarot_update($1,99,'{}','[]')", [second]));
    const emailId = '33333333-3333-4333-8333-333333333333';
    await create(emailId, 'email', null);
    const mails = [{ kind: 'intake', recipient: 'test@example.com', subject: 'test', body: 'test' }];
    await db.query('select tarot_update($1,1,$2,$3)', [emailId, { status: 'intake_pending', paid_at: new Date().toISOString() }, mails]);
    const mailId = (await db.query('select id from tarot_mail where request_id=$1', [emailId])).rows[0].id;
    assert.equal((await db.query('select * from tarot_claim_mail($1)', [mailId])).rows.length, 1);
    assert.equal((await db.query('select * from tarot_claim_mail($1)', [mailId])).rows.length, 0, 'concurrent delivery is denied');
    await db.query('select tarot_finish_mail($1,$2)', [mailId, 'provider unavailable']);
    assert.equal((await db.query('select reply_deadline from tarot_requests where id=$1', [emailId])).rows[0].reply_deadline, null);
    await db.query('select * from tarot_claim_mail($1)', [mailId]);
    await db.query('select tarot_finish_mail($1,null)', [mailId]);
    const result = (await db.query('select * from tarot_requests where id=$1', [emailId])).rows[0];
    assert.equal(result.status, 'awaiting_theme');
    assert.ok(Date.parse(result.reply_deadline) > Date.now() + 6.9 * 86400000);
    assert.equal((await db.query('select * from tarot_claim_mail($1)', [mailId])).rows.length, 0);
    assert.equal((await db.query("select * from calendar_reservations where source_id=$1", [emailId])).rows.length, 0);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from tarot_requests'));
    await assert.rejects(db.query('select * from tarot_claim_mail($1)', [mailId]));
    await db.exec('reset role');
  } finally { await db.close(); }
});

test('public components render radio modes and an accessible seven-column calendar', async () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { TarotBookingPage } = await load('src/pages/TarotBookingPage.tsx');
  const html = renderToStaticMarkup(React.createElement(TarotBookingPage));
  assert.equal((html.match(/type="radio"/g) || []).length, 3);
  assert.ok(html.includes('16,000'));
  assert.ok(html.includes('この画面では決済されません'));
  const { TarotCalendar } = await load('src/components/TarotCalendar.tsx');
  const calendar = renderToStaticMarkup(React.createElement(TarotCalendar, { slots: [], busy: [], onSelect() {} }));
  assert.ok(calendar.includes('tarot-month-grid'));
  assert.equal((calendar.match(/class="tarot-weekday"/g) || []).length, 7);
  assert.ok(calendar.includes('予約済'));
});

test('API requires admin auth and public availability strips private fields', async () => {
  const fake = { name: 'counseling-test-double', setup(build) {
    build.onResolve({ filter: /_lib\/counseling\.js$/ }, () => ({ path: 'test-counseling', namespace: 'test-double' }));
    build.onLoad({ filter: /.*/, namespace: 'test-double' }, () => ({ contents: `
      export async function assertCounselor(token) { if(token !== 'test-token') throw Error('Unauthorized'); }
      export const cleanText = value => typeof value === 'string' ? value.trim() : '';
      export const counselorEmail = 'test-owner@example.com';
      export const createServiceClient = async () => globalThis.tarotTestDB;
      export const formatJstDateTime = value => value;
      export const getBearerToken = headers => (headers?.Authorization || '').replace('Bearer ', '');
      export const normalizeBody = value => value && typeof value === 'object' ? value : {};
      export async function sendCounselingEmail() { throw Error('Tests must not send real email'); }
    `, loader: 'js' }));
  } };
  const { default: handler } = await load('api/tarot.ts', [fake]);
  const response = () => ({ code: 0, data: null, setHeader() {}, status(code) { this.code = code; return { json: data => { this.data = data; } }; } });
  const denied = response();
  await handler({ method: 'GET', query: { mode: 'admin' } }, denied);
  assert.equal(denied.code, 401);
  const deniedWrite = response();
  await handler({ method: 'POST', body: { action: 'paid', id: '11111111-1111-4111-8111-111111111111' } }, deniedWrite);
  assert.equal(deniedWrite.code, 401);
  const settings = domain.defaultTarotSettings();
  globalThis.tarotTestDB = { from(table) {
    const q = { select() { return q; }, eq() { return q; }, not() { return q; }, gte() { return q; }, order() { return q; },
      async maybeSingle() { return { data: { settings } }; },
      async range() { return { data: [{ starts_at: iso('2026-11-01T10:00:00'), ends_at: iso('2026-11-01T11:00:00'), source_type: 'learning', source_id: 'PRIVATE-ID', email: 'private@example.com' }] }; },
      async limit() { return { data: [] }; } };
    assert.ok(['tarot_settings', 'calendar_reservations', 'tarot_requests'].includes(table));
    return q;
  } };
  try {
    const publicResponse = response();
    await handler({ method: 'GET', query: { mode: 'online' } }, publicResponse);
    assert.equal(publicResponse.code, 200);
    assert.equal(publicResponse.data.enabled, false);
    assert.deepEqual(Object.keys(publicResponse.data.busySlots[0]).sort(), ['ends_at', 'starts_at']);
    assert.ok(!JSON.stringify(publicResponse.data).includes('PRIVATE-ID'));
    const invalid = response();
    await handler({ method: 'POST', body: { action: 'request', name: '', email: 'invalid', id: 'bad' } }, invalid);
    assert.equal(invalid.code, 400);

    const record = { settings, updated_at: '2026-10-16T00:00:00.000Z' };
    globalThis.tarotTestDB = { from(table) {
      const filters = {};
      let update = null;
      const q = {
        upsert: async () => ({ error: null }),
        select() { return q; }, update(value) { update = value; return q; },
        eq(key, value) { filters[key] = value; return q; },
        not() { return q; }, gte() { return q; }, order() { return q; },
        async maybeSingle() {
          if (table !== 'tarot_settings') throw Error('Unexpected maybeSingle');
          if (!update) return { data: record, error: null };
          if (filters.updated_at !== record.updated_at) return { data: null, error: null };
          Object.assign(record, update);
          return { data: { updated_at: record.updated_at }, error: null };
        },
        async range() { return { data: [] }; }, async limit() { return { data: [] }; }
      };
      return q;
    } };
    const auth = { Authorization: 'Bearer test-token' };
    const admin = response();
    await handler({ method: 'GET', query: { mode: 'admin' }, headers: auth }, admin);
    assert.equal(admin.code, 200);
    assert.equal(admin.data.settingsUpdatedAt, record.updated_at);
    const edited = { ...settings, horizon_days: 60 };
    const stale = response();
    await handler({ method: 'POST', headers: auth, body: { action: 'save-settings', settings: edited, settingsUpdatedAt: '2026-10-15T00:00:00.000Z' } }, stale);
    assert.equal(stale.code, 409);
    assert.equal(record.settings.horizon_days, settings.horizon_days);
    const saved = response();
    await handler({ method: 'POST', headers: auth, body: { action: 'save-settings', settings: edited, settingsUpdatedAt: admin.data.settingsUpdatedAt } }, saved);
    assert.equal(saved.code, 200);
    assert.equal(record.settings.horizon_days, 60);
  } finally { delete globalThis.tarotTestDB; }
});
