# Outlook AT busy-time sync

Target: leodenoir.com, Learning and counseling calendars. Import ONLY calendar
category `AT` (orange is a visual hint, not a filter) with `show_as === "busy"`
and `is_cancelled === false` from `yu.leobiz003@outlook.com`.
Never infer membership from a subject, name, description, color alone, or a duration.
Do not copy subjects, bodies, locations, attendees, Zoom links, or Outlook IDs.

## Setup

1. Apply `supabase/migrations/20260927_outlook_at_sync.sql` in Supabase SQL Editor.
2. Run `node scripts/outlook-sync.mjs --init-secret` once. The generated credential
   is in `.vercel/outlook-sync-secret` (gitignored).
3. Set that value as the server-only Vercel Production variable `OUTLOOK_SYNC_SECRET`.
   Never print it or use a VITE-prefixed variable. Deploy the updated source.
4. Perform a complete first import and verify both public calendars before enabling
   the weekly schedule.

## Weekly run (Saturday 00:00 Asia/Tokyo)

This is a Codex desktop heartbeat, not Vercel Cron. The host must be running and
connected. A separate Microsoft OAuth integration is required for unattended
server-only execution. Never claim a skipped or failed run succeeded.

Read this runbook before every run. Use the Outlook Calendar connector's
`list_calendars` to verify mailbox ownership and its default calendar. Retrieve
the next 90 days from today's midnight JST, in windows of no more than 7 days,
using `list_events` with `filter: "categories/any(c:c eq 'AT')"`, explicit ISO
start/end offsets and `top: 200`. This expands recurring occurrences/exceptions.
Keep only busy, non-cancelled results. Preserve the original Outlook start/end,
including any buffers the owner entered; do not subtract 5/10 minutes.

Verify category filtering with a non-existent category (it must return zero).
If a response errors, is truncated, has a next_link, or hits the result limit,
split that window into smaller windows and retrieve every result. If a complete
snapshot cannot be verified, STOP without submitting anything. Do not substitute
an empty result. Re-authentication requires the owner when credentials expire.

Create `.vercel/outlook-at-snapshot.json` with only:

```json
{
  "version": 1,
  "category": "AT",
  "showAs": "busy",
  "complete": true,
  "windowStart": "<today midnight JST, ISO-8601 with offset>",
  "windowEnd": "<90 days later, same timezone>",
  "fetchedAt": "<actual completion time, ISO-8601 with offset>",
  "blocks": [{ "start": "<ISO with offset>", "end": "<ISO with offset>" }]
}
```

Outlook timestamps marked UTC but lacking a suffix must have `Z` appended;
other timezones must be converted explicitly, never treated as local machine time.
Run `node scripts/outlook-sync.mjs .vercel/outlook-at-snapshot.json` to validate,
then repeat with `--apply`. Only report success when HTTP 200 and `verified:true`
match the normalized block count. Verify the anonymous occupancy API covers the
same intervals and that they are absent from available counseling slots.
No weekly git commit or redeploy is needed for database-only updates.

## Safety

The RPC atomically cancels/replaces only `OUTLOOK-AT:` rows in the supplied window.
Rows are associated with the operations student email `yusamiyoyo003@gmail.com`
(created as `OPS-AT` if absent). No auth user, credits, packages or actual lesson
bookings are created or changed; no booking notification emails are sent.
The existing exclusion constraint prevents clashes with live site reservations.
On overlap, the entire transaction rolls back and existing blocks remain.
Report the conflict for human review; never cancel real reservations to resolve it.
A reduction greater than 50% (when at least four old blocks exist) also stops for
review. Do not bypass this guard in an unattended run.

Successful syncs store a count, window and timestamp in `calendar_sync_state`.
Missing credentials, old snapshots, partial results, schema mismatch, conflicts,
and failed read-back verification must produce an alert in the Codex thread.
Stay quiet on unchanged/non-actionable runs. Public displays show only busy times.
