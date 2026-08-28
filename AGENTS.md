# Leo de Noir Site Delivery Rules

## Student data integrity

- Treat Supabase `students`, `lesson_packages`, and `bookings` as the source of truth. Do not silently replace authenticated data with localStorage or demo data.
- For any change touching authentication, Student Page, packages, bookings, or tutor administration, verify the complete path: Supabase record -> Vercel Function response -> frontend mapping -> displayed totals.
- Purchased, remaining, reserved, and completed counts must be checked as numeric invariants. A missing or malformed server value is an error, not zero.
- Keep the runtime integrity summary returned by `api/student-profile.ts` and the corresponding client validation in `LearningPlatformPage.tsx` aligned.
- Preserve the visible synchronization error and structured runtime error. Never hide a data mismatch by rendering empty package data.

## Verification and deployment

- Run `pnpm run build` after every code change and resolve TypeScript or build errors.
- Check `git diff --check`, review changed files, and confirm secrets, `.env*`, `node_modules`, and `dist` are not staged.
- When a requested change is complete and verified, commit to `main`, push to `origin main`, wait for the GitHub/Vercel deployment check to succeed, and verify the changed production behavior or production asset.
- Do not redeploy solely because a runtime data mismatch was detected. A redeploy does not repair Supabase records, authentication linkage, or network failures. Alert, diagnose, repair the data or code cause, then deploy only when code changed.
- Never force-push and never expose Supabase service-role keys, Resend keys, Vercel tokens, passwords, or session tokens in logs or reports.
