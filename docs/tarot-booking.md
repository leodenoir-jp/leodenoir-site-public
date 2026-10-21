# Tarot booking and shared administration

## Enable in production

1. Run `supabase/migrations/20261016_tarot.sql` in the existing project's Supabase SQL Editor. This is additive; it does not alter student credits or existing appointments. The shared calendar's source constraint gains `tarot`.
2. Deploy the code. Open `/counseling/admin` using the existing counselor login.
3. In **タロット公開枠・案内文**, configure tarot's own weekly rules/date exceptions and enable intake. All schedules and intake are **disabled initially**. No Learning, counseling or Outlook busy events become availability.
4. Verify the public `/tarot/booking` route and the shared calendars before opening intake to clients. A missing migration, incomplete busy query or API failure fails closed.

Credentials are the existing `VITE_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` and counselor authentication. Email uses `RESEND_API_KEY` and `COUNSELING_FROM_EMAIL` (or `CONTACT_FROM_EMAIL`). Leo notifications and reply-to use `yu.leobiz003@outlook.com`. Do not place private keys in browser-visible variables.

## Public modes

- Online: 50 minutes, JPY 4,000. A published slot is required. A 30-minute trailing buffer is held.
- In person: 50 minutes, JPY 16,000 plus agreed transport. Tokyo 23 wards, station and line are mandatory; venue optional. Each person pays their own drinks/seat fees; no home visits. Holds cover 60 minutes before and after the session. A conflicting buffer prevents booking. A separate location/time inquiry does **not** hold a slot. After agreement the admin can assign a published, conflict-free slot and send a provisional confirmation.
- Email: one theme, JPY 3,500. No calendar hold. Intake guidance and result are email text, not attachments.

Prices are final tarot service prices. There is no payment-method surcharge. No payment is charged by this site; the operator verifies payment manually.

## Admin workflow

The counselor admin adds **タロット予約・相談**, **メール鑑定**, **タロット公開枠・案内文** tabs. Existing counseling tabs are unchanged.

1. Save the PayPay link (and transportation where applicable). Save the online Zoom link against the shared client profile, not an individual purchase.
2. Send the payment instructions. Zoom is excluded at this stage.
3. Confirm actual payment. The paid timestamp is persisted even if email delivery fails. Online confirmation includes Zoom; in-person confirmation includes agreed location.
4. For email readings, payment confirmation queues intake guidance. Only a successful provider acceptance starts the seven-calendar-day reply window.
5. After reading the reply in Outlook, record the agreed theme. The result due date is the end of the third following business day in JST, excluding weekends and Japanese holidays using `@holiday-jp/holiday_jp` (https://github.com/holiday-jp/holiday_jp-js). Holiday data should be maintained with dependency updates.
6. Send the result. Successful sending opens the seven-calendar-day question window. Record at most one question and its actual email received time; send one answer to finish. New themes/re-readings are not included.
7. The admin highlights overdue intake and shows question deadlines. **Because Outlook replies are not automatically ingested, the operator must check the inbox before closing an expired/no-question request.** The system does not silently mark an unanswered received question complete. Intake with no reply is marked `expired`, never `complete` or fully consumed. Refunds remain a separate manual decision.

There is no new scheduled job, automatic payment verification, automatic receipt attachment, email-inbox ingestion, or tarot reminder job in this V1. Existing counseling reminders are unaffected. These must not be represented as enabled.

## Reliability and privacy

- Creation, shared-calendar hold and initial mail records use one Postgres transaction. The existing range exclusion constraint prevents cross-service overlaps, including simultaneous requests. Cancelling releases the hold in the same transaction.
- A UUID request key and request version prevent duplicate submission and concurrent admin transitions. Unknown network outcomes should be retried on the same page, not from another tab.
- `tarot_mail` persists the exact message. Resend receives a stable idempotency key, and concurrent deliveries use a DB lease. Failed or interrupted sending remains visible with a retry action. Retry is blocked after 23 hours from the first attempt to avoid exceeding Resend's idempotency window. Confirm delivery in Resend before any manual recovery; never blindly resend.
- `sent` means the sending service accepted the message, not that it reached the recipient's inbox. Existing Resend domain verification issues still need resolution independently.
- New tables have RLS and no anonymous/authenticated-user access. Admin routes require the existing counselor session. Public availability exposes only start/end times, not names, email, topics, Outlook identifiers or Zoom links.
- The shared calendar still blocks Learning and counseling even if a tarot email fails. Mail failures never silently undo a saved request.
- No real customer emails are sent by tests. The local SQL suite runs against isolated PGlite, not production.

## Verification

Run `pnpm run test:tarot`, `pnpm run build`, and `git diff --check`.
Use `node scripts/tarot-db.mjs` for a read-only schema check only when a real DB URL is available in the ignored `.vercel/.env.sync.local`; `--apply` applies the single migration. Vercel Secret values may not be readable locally, in which case use SQL Editor.

Before opening intake, verify all three modes, location validation, shared busy slots, one test inquiry and its emails, the paid/intake/result/question workflow, and cancellation. Do not use real student credits for tests. Production email tests need an agreed recipient.
