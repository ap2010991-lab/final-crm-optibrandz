# OptiBrandz CRM — defect remediation

**Date:** 2026-08-25
**Scope:** Fix the 17 defects found in the 2026-08-25 audit. No new product surface.

## How these were found

Every item below was reproduced against a real database and API, not inferred from
reading. Where a claim could not be exercised it is marked *read-only* and says so.

One finding was withdrawn during the audit: an apparent timezone fault in the login
lockout turned out to be an artefact of the local Postgres running `Asia/Kolkata`.
Production Supabase runs UTC and is self-consistent. The lockout defect below is real
but has a different cause.

## Principles

1. **One source of truth per concept.** Invoice status, "is this client billed",
   and "what needs attention" are each computed in one place and imported, not
   reimplemented per route.
2. **Invalid input is a 4xx.** A bad enum must never reach Prisma and surface as a 500.
3. **Derived beats stored.** Prefer computing from records over a second table that can
   disagree, except where the record genuinely cannot answer the question.
4. **No fix without a test that fails first.**

---

## 1. Security

### 1.1 Stored XSS via SVG upload (critical)
`POST /api/calendar/:id/media` accepts any `image/*`, including `image/svg+xml`, stores
the bytes and serves them from `/api/public/media/:id` with `Content-Type:
image/svg+xml` and `Content-Disposition: inline`. That URL is same-origin with the CRM,
so script inside the SVG runs in the CRM's origin and can read the JWT from
`localStorage`. Any login with the `content` permission can plant one.

**Fix:** allowlist raster types (`jpeg`, `png`, `webp`, `gif`) at upload and again at
read. Serve media with `Content-Security-Policy: default-src 'none'; sandbox` so a
future hole cannot execute. Reject anything else with 422.

### 1.2 Cron secret accepted in the URL (*read-only*)
`authorizeCron` falls back to `req.query.key`, putting the secret in access logs and
referrers. **Fix:** require the `Authorization` header only.

---

## 2. Money

### 2.1 A one-off invoice suppresses the whole monthly retainer
`retainerClientsDue()` treats *any* invoice created this month as "already billed".
Reproduced: a ₹500 one-off invoice removed a ₹54,000 retainer from the run.

**Fix:** add `isRetainer Boolean @default(false)` to `Invoice`. The monthly run sets it;
the run only counts prior `isRetainer` invoices. Backfill existing rows whose first line
item description starts with `Monthly retainer`. The identical logic duplicated in
`today.routes.js` moves into one shared `utils/retainerRun.js`.

### 2.2 Revenue chart merges the same month across years
`/api/invoices/revenue` groups by month short-name only. Reproduced: Aug 2025 and
Aug 2026 merged into one row. **Fix:** key by year+month, label with the year, and bound
the query to a rolling window.

### 2.3 Part-paid invoices stop being chased
Recording a partial payment on an overdue invoice flips it OVERDUE → PARTIAL. Three
notions of status exist (write path, nightly job, dashboard). **Fix:** one exported
`invoiceStatus({ totalAmount, paidAmount, dueDate, status })` used by all three.
Anything not paid in full past its due date is OVERDUE; `paidAmount > 0` still records
the part payment, so nothing is lost.

### 2.4 Invoice numbering breaks after #999 (*read-only, latent*)
`orderBy: { invoiceNumber: "desc" }` is lexicographic, so `OB-2026-999` outranks
`OB-2026-1000`; the next create retries a taken number 25× then 500s. **Fix:** select the
year's numbers and take the max numerically.

---

## 3. Auth

### 3.1 Permanent lockout loop
When a lock expires the counter stays at its threshold, so one wrong password re-locks
for another 15 minutes — and the correct password is then refused too. Reproduced end to
end. **Fix:** treat an expired lock as a clean slate and reset the counter before
evaluating the attempt.

---

## 4. Robustness

### 4.1 Invalid enum values return 500
Reproduced on `/services`, `/leads`, `/calendar`, `/clients`. **Fix:** replace
`z.string()` with `z.enum()` for every enum-backed field, sourced from one
`utils/enums.js` so the schema and validation cannot drift. Add a Prisma error mapper
so any remaining constraint violation becomes a 4xx rather than a 500.

### 4.2 Empty search returns everything
`?q=` becomes `contains: ""`, matching every row. **Fix:** return empty for fewer than
two characters.

### 4.3 Campaign POST is unvalidated where PUT is
POST accepts `month=99`. **Fix:** share one schema.

---

## 5. Workflow

### 5.1 Today's "content to move" is flooded
No lower date bound, so every unpublished post ever competes for 40 slots. Reproduced:
22 of 37 were stale. **Fix:** bound the lookback to the start of the current month and
return an explicit `overdueCount` so nothing is hidden silently.

### 5.2 Every alert is double-reported
The nightly job persists notifications for leads/tasks/invoices while the action centre
derives the same items live. Reproduced: all five overdue invoices listed twice, worded
differently. `renewal-alerts` has no dedup at all and re-inserts monthly.

**Fix:** the action centre is the single source, derived live. Both jobs stop writing
notification rows. The daily job keeps its real side effect — marking invoices overdue.
The `Notification` table and its read path stay for genuine future push.

### 5.3 The bell can never be cleared
The badge counts live items, which regenerate; "Mark all read" took it 33 → 21, never 0.
**Fix:** with 5.2 the count becomes a true outstanding-actions counter, which reaches
zero when the work is done. The "Mark all read" button only appears when persisted rows
exist, so the UI stops promising something it cannot do.

### 5.4 Dead pipeline references
- `contentInReview` counts `REVIEW`, abandoned by the pipeline → always 0. Replace with
  posts awaiting approval (`IN_DESIGN`).
- The action centre watches `DRAFT`/`REVIEW`, missing `IN_DESIGN`/`APPROVED`. Watch
  everything not `PUBLISHED`.
- `publishedAt` / `approvedAt` are never written, so reports use `scheduledDate` as a
  proxy for when a post actually went out. Stamp both on transition.
- `PUT /calendar/:id/approve` is dead code. Remove it.

### 5.5 Unbounded reads (*read-only*)
`GET /clients/:id` loads every calendar item and activity for the client (312+/yr), and
`GET /team` joins every task for every user to compute three counts. **Fix:** paginate
the first, aggregate the second.

---

## Testing

A `server/tests/` suite runs against a real Postgres. Each defect gets a test written to
fail against current code first. Run with `npm test --prefix server`.

## Migration

One additive column (`Invoice.isRetainer`) plus a backfill. No column is dropped and no
existing value is rewritten except the backfill, which only sets the new flag.
