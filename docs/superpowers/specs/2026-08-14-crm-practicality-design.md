# Making the CRM worth opening — design

**Date:** 2026-08-14
**Status:** approved, implementing

## The problem, from the data

The CRM is being filled in but not worked in. Live figures on the day of writing:

| Feature | Rows | State |
| --- | --- | --- |
| Tasks | 87 | **every one still PENDING**, 36 already overdue |
| Content calendar | 26 | **every one still DRAFT** |
| Services | 29 | 21 have zero monthly value |
| Clients | 8 | 6 have no renewal date |
| Invoices | 0 | none ever raised, against ~₹96,000 MRR |
| Campaign results | 0 | unused |
| Reports | 0 | unused |
| Activity log | 0 | unused |

The owner confirmed all four failure modes at once: the real work happens in WhatsApp,
entering data is slow, the CRM tells him nothing he does not already know, and money is
handled outside it. A tool you type into and get nothing back from loses to WhatsApp.

The 87 tasks are self-inflicted: adding a service silently generates a default checklist
(29 services × ~3 tasks). Nobody asked for them, so nobody works them.

## Goal

Flip the CRM from *a place you enter data* into *something that hands you work and gets
money in*. Success is behavioural, not featural: the owner opens it each morning because
it tells him something he did not already know.

## Scope

Three changes in dependency order. Each is useless without the one before it.

### 1. Stop generating noise

Remove automatic task creation from `syncClientServices` and `POST /api/services`. Tasks
become only what the user typed. A list you did not write is a list you will not work.

Existing phantom tasks are **not** deleted automatically — the user is given a one-tap
cleanup action and decides.

### 2. "Today" becomes the home screen

New landing route. Dashboard keeps its charts and moves under More. Three blocks, ordered
hardest-money-first:

- **Money** — retainer invoices to raise this month, and overdue payments. Each row: one
  tap to generate, one tap to WhatsApp.
- **Content due** — posts scheduled today or this week that are not yet posted. One tap
  advances the stage.
- **Slipping** — clients with no content planned this month, renewals approaching, leads
  past their follow-up date.

When nothing needs doing it says so. An empty Today screen is the goal, not a failure.

### 3. Content becomes a pipeline you tap

`Draft → Designing → Approved → Posted`

One tap advances a post, from Today or from the client's page, with no modal. Approval is
verbal in this agency, so "Approved" is simply the owner tapping it after the call. The
month view shows "9 of 26 posted" per client rather than 26 identical grey boxes.

Adding a post requires platform, date and one line of caption. Everything else optional.

**No schema change:** the four stages map onto four values the enum already has —
`DRAFT → IN_DESIGN → APPROVED → PUBLISHED`. The unused `REVIEW` and `REJECTED` values are
simply dropped from the UI.

### 4. Monthly billing run

Billing is fixed monthly retainers, same amount, around the same date. So:

- Today shows "N retainer invoices to raise · ₹X" whenever a client with `mrr > 0` has no
  invoice dated in the current month.
- One tap generates the whole batch from each client's MRR, due 7 days out.
- Each generated invoice keeps the existing WhatsApp share and PDF link.

**No schema change:** "to raise" is derived by checking for an existing invoice this
month. No billing-run table, no `billingDay` column.

## Explicitly not building

- Client portal or client logins
- Client-facing approval links (approval is verbal)
- Configurable workflow stages
- Time tracking
- Ad-platform integrations
- Campaign results and monthly reports — unused today; revisit only if the content
  pipeline habit sticks

## Architecture

One new read-only endpoint and one new page, plus small edits to existing modules.

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `GET /api/today` | Assemble the three blocks for the signed-in user, permission-scoped | Prisma |
| `POST /api/invoices/run` | Generate this month's missing retainer invoices | invoice numbering |
| `GET /api/invoices/run` | List which clients are due an invoice this month | Prisma |
| `pages/Today.jsx` | Render the three blocks, one-tap actions | `/api/today` |
| `pages/ContentCalendar.jsx` | Stage strip replaces status dropdown | `PUT /api/calendar/:id` |
| `utils/syncClientServices.js` | No longer creates tasks | — |

`GET /api/today` follows the pattern already established in `notifications.routes.js`:
filter in SQL, select only returned columns, gate each block on permission.

## Error handling

Reuses what exists: `asyncRoute` for rejections, the central error handler for
sanitised messages, `QueryState` for loading/error/retry on the client, and toasts for
action feedback. A failed stage advance rolls the UI back and shows the reason.

## Testing

- Verify each Today block against the live database contents before and after.
- Confirm advancing a stage persists and the count updates.
- Confirm the billing run generates exactly the missing invoices, is safe to press twice
  (an invoice already existing this month excludes that client), and produces gapless
  invoice numbers.
- Confirm adding a service no longer creates tasks.
- Re-check the mobile viewport: no horizontal overflow, 16px inputs, 44px tap targets.
