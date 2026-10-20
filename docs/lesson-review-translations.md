# Lesson review translations

Original reviews remain in `src/data/lessonReviews.ts`. Translations are keyed by
the same review ID in `src/data/lessonReviewTranslations.ts`; they do not create
new reviews, authors, ratings, or dates.

Source: the owner's Japanese Lesson Reviews spreadsheet,
https://docs.google.com/spreadsheets/d/13q3qW7EUmstUpHuEIUjt05JAL2wfpwTXt3p4xQhKsiU/edit?gid=0

On 2026-10-20, spreadsheet rows 72-83 were imported as LR-070 through LR-081.
The existing 69 original entries were preserved. The spreadsheet contains an
earlier duplicate of LR-001 under another display name; it was not re-imported.

Traditional Chinese reviews have Japanese and English translations. Japanese
reviews have English translations. Existing English reviews remain unchanged.
Mixed-language reviews retain their original text; the translated version
conveys the review in the selected language, retaining quoted Japanese examples.
Translations are editorial translations, not independently submitted reviews.

The page language selects the initial version. A per-review selector allows
switching to any available translation or the original. Translations are labeled,
and the original can also be expanded beneath the translation.

Run `node scripts/verify-reviews.cjs` and `pnpm run build` after editing. Update
the coverage expectations in the verification script when importing new reviews.
No Supabase student, booking, or package records are modified by this feature.
