import test from "node:test";
import assert from "node:assert/strict";
import { validateSnapshot } from "./outlookSync.mjs";

const now = Date.parse("2026-09-27T00:00:00+09:00");
const snapshot = (blocks = []) => ({ version: 1, complete: true, category: "AT", showAs: "busy", windowStart: "2026-09-27T00:00:00+09:00", windowEnd: "2026-12-26T00:00:00+09:00", fetchedAt: "2026-09-27T00:00:00+09:00", blocks });
test("normalized snapshots remain valid including multi-day merged ranges", () => {
  const input = snapshot([
    { start: "2026-09-28T00:00:00+09:00", end: "2026-09-29T00:00:00+09:00" },
    { start: "2026-09-29T00:00:00+09:00", end: "2026-09-30T00:00:00+09:00" }
  ]);
  const normalized = validateSnapshot(input, now);
  assert.deepEqual(validateSnapshot({ ...input, ...normalized }, now), normalized);
});
test("merge duplicates and overlapping or adjacent ranges without personal data", () => {
  const blocks = [
    { start: "2026-09-28T12:00:00+09:00", end: "2026-09-28T12:50:00+09:00" },
    { start: "2026-09-28T12:30:00+09:00", end: "2026-09-28T13:00:00+09:00" },
    { start: "2026-09-28T13:00:00+09:00", end: "2026-09-28T13:25:00+09:00" }
  ];
  assert.deepEqual(validateSnapshot(snapshot(blocks), now).blocks, [{ start: "2026-09-28T03:00:00.000Z", end: "2026-09-28T04:25:00.000Z" }]);
});
test("reject incomplete, wrong-category, wrong-status and stale snapshots", () => {
  for (const patch of [{ complete: false }, { category: "Other" }, { showAs: "free" }, { fetchedAt: "2026-09-20T00:00:00Z" }]) {
    assert.throws(() => validateSnapshot({ ...snapshot(), ...patch }, now));
  }
});
test("reject invalid, timezone-less and personal-data-bearing blocks", () => {
  for (const block of [
    { start: "2026-09-28T12:00:00", end: "2026-09-28T13:00:00+09:00" },
    { start: "2026-09-28T12:00:00+09:00", end: "2026-09-28T11:00:00+09:00" },
    { start: "2026-09-28T12:00:00+09:00", end: "2026-09-28T13:00:00+09:00", subject: "Private" }
  ]) assert.throws(() => validateSnapshot(snapshot([block]), now));
});
test("clip a busy range crossing the start of the complete window", () => {
  assert.deepEqual(validateSnapshot(snapshot([{ start: "2026-09-26T23:30:00+09:00", end: "2026-09-27T00:30:00+09:00" }]), now).blocks,
    [{ start: "2026-09-26T15:00:00.000Z", end: "2026-09-26T15:30:00.000Z" }]);
});
