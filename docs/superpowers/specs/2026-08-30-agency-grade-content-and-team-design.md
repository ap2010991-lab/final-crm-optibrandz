# Agency-grade content tracking and team coordination — design

**Date:** 2026-08-30
**Status:** awaiting approval
**Implementation target:** Phase 1 only. Phases 2–4 are sketched here to show direction
and are deliberately *not* planned in detail until Phase 1 is in real use.

## The problem, from the data

Production figures on the day of writing:

| Feature | Rows | State |
| --- | --- | --- |
| Clients | 8 | all ACTIVE |
| Content calendar items | **1** | the six-stage pipeline is effectively unused |
| Content to-dos | **12** | **all created on 25 Aug**, none since; 3 done |
| Tasks | **0** | model entirely unused |
| Activities | **0** | unused |
| Clients with `monthlyContentTarget` | **0** | the Today shortfall block can never fire |
| Team logins | 2 | owner, plus `dhanjee` added 27 Aug who has touched nothing |

Two verdicts are already in, and both come from behaviour rather than opinion.

**The simple list beat the pipeline, 12 to 1.** `ContentTask` — a title, a type and a tick
— is what got used. `ContentCalendar`, with its platform, dated slot and six approval
stages, holds a single row. The 2026-08-14 spec predicted this and it has now happened.

**But the simple list still died after one day.** Twelve items on 25 August, nothing
since. That is the fact this design has to explain, because adding features to a tool
nobody opened twice is how the last two attempts were wasted.

## Why it died

`ContentTodo` is mounted per client. `useContentTasks(clientId)` fetches one client's
list, and the Content page picks a single client from a dropdown.

**With 8 clients, answering "what is outstanding?" costs eight dropdown changes.** No
screen in the CRM — not Today, not Schedule, not Content — shows every pending item
across every client in one place. Today comes closest but reports *calendar* items,
of which there is exactly one.

So the daily question the owner actually asks has no single answer inside the CRM, and
WhatsApp answers it in one scroll. That is the whole gap.

The second-order problem: `ContentCalendar` and `ContentTask` both lack an **assignee**.
`Task` has one but holds zero rows. So when `dhanjee` signs in he is shown a client
picker and lists that never claim to be his, and the owner-only workload screen counts
`Task` rows — a table that is empty. The team system measures none of the real work.

## Goal

One list, all clients, assigned to people.

Success is behavioural and measurable against the numbers above: content items are still
being added and ticked **fourteen days after release**, and `dhanjee` has completed at
least one. Feature count is not a success measure.

## Principles

1. **The simple list won — build toward it, not away from it.** The pipeline becomes
   optional decoration on a record that is fundamentally a line with a tick.
2. **Cross-client by default, per-client by choice.** Every work surface opens showing
   everything. Filtering to one client is a deliberate act, never a precondition.
3. **One source of truth for "pending".** After this there is exactly one query that
   answers what is outstanding.
4. **No fix without a test that fails first.** Carried from the 2026-08-25 spec.
5. **Nothing is auto-generated into a work list.** Carried from 2026-08-14: a list you
   did not write is a list you will not work. Templates in Phase 3 propose, never insert
   silently.

---

## Phase 1 — One list, all clients, assigned

The adoption fix. Nothing else ships until this is used.

### 1.1 Merge the two content models

`ContentTask` becomes the trunk, not the branch — it is the one with real rows and real
usage. It absorbs the optional planning fields `ContentCalendar` carries:

```
model ContentItem            // ContentTask, renamed and widened
  id, clientId, title, type  // unchanged; type stays REEL/POST/STORY/CAROUSEL/VIDEO/OTHER
  notes, dueDate, isDone, completedAt
  createdById, completedById // unchanged attribution

  assignedToId  String?      // NEW — the hinge for everything in this phase
  platform      Platform?    // NEW, optional — was mandatory on ContentCalendar
  stage         ContentStage?// NEW, optional — DRAFT/IN_DESIGN/REVIEW/APPROVED/PUBLISHED
  scheduledDate DateTime?    // NEW, optional
  mediaUrl      String?      // NEW, optional
```

Every new field is nullable. An item created the way all twelve existing ones were —
title, type, due date, tick — is still valid and untouched. The pipeline is available to
anyone who wants it and invisible to anyone who does not.

`isDone` stays the single truth for "finished". `stage` is descriptive only; setting
`stage = PUBLISHED` does not imply done, and `isDone` does not imply a stage. Two fields
that can disagree is the cost of not forcing the pipeline on people, and it is the
cheaper mistake — the alternative is what killed the calendar.

**Migration.** The single `ContentCalendar` row is copied into `ContentItem` with its
platform, stage and date carried across, and `isDone` derived as `status = PUBLISHED`.
`ContentCalendar` is then left in place, unread, for one release, so the change is
reversible without data loss. It is dropped in Phase 2 once Phase 1 is proven in use.

The production database is shared with JDS Hotel and has no migration history, so the SQL
is generated with `prisma migrate diff`, reviewed by hand, and rehearsed against the local
copy before it is applied. `ContentItem` gets `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
with no policies, matching every other table.

### 1.2 The Work board — the screen that fixes adoption

A new screen at `/work`, and the new content entry point in the nav. The existing
per-client Content page is **kept**, not deleted — planning one client's month is still a
real job — but it stops being the way in, and its to-do tab becomes a filtered view of the
same `ContentItem` data rather than a second store.

- **Every pending item across all 8 clients in one list.** No client selection required
  to see it, ever.
- Grouped by **due date** — Overdue, Today, This week, Later, No date. Due date is the
  axis because all twelve real items have one.
- Each row: client name, title, type badge, who it is assigned to, due date. One tap ticks
  it done. One tap reassigns.
- **Filters, none of them mandatory:** client, assignee, type, done/pending.
- **Add is always one tap from this screen**, and the add form defaults to no client
  selected — the client is a field in the form, not a gate in front of it.

### 1.3 My Work

The same data filtered to the signed-in user, as the landing screen for non-owners. This
is what `dhanjee` sees on login instead of a client picker: his items, by due date, and
nothing else. Owners land on the Work board.

### 1.4 Team board

Every colleague's queue side by side — pending, overdue, done this week — **visible to the
whole team**, not just the owner. Counts come from `ContentItem`, not the empty `Task`
table. `GET /tasks/workload` is superseded and removed; nothing reads it.

### 1.5 Honest empty states

With 0 targets set and 1 calendar row, several screens currently render confidently empty
panels that read as broken. Each gets a real empty state that says what is missing and
links to the one action that fixes it.

---

## Phase 2 — Coordination

Only after Phase 1 shows sustained use. Scoped down deliberately: a two-person team does
not need routing rules or approval chains, and building them would repeat the pipeline
mistake.

- **Comment threads on any content item**, with `@mentions`. This is where "client wants
  the logo bigger" lives instead of WhatsApp.
- **Event notifications**, persisted rather than computed: assigned to you, mentioned you,
  an item you own was ticked. The existing action-centre stays and keeps deriving overdue
  work from dates; these are added alongside as stored rows in the unused `Notification`
  model.
- **Per-client activity feed** covering internal work alongside client contact.
- `ContentCalendar` is dropped once Phase 1 is proven.

Explicitly **not** in scope: stage-change routing rules, approval chains, client-facing
approval in the portal. The portal stays read-only. Revisit when the team passes ~5 people.

---

## Phase 3 — Real data in

The owner's client and content information lives in WhatsApp, notes and memory. There is
no file to import, so this is capture, not migration.

- **Package templates.** Define "Silver = 12 posts + 4 reels + 8 stories". Applying one to
  a client **proposes** a month of items in a preview the owner edits and confirms. Nothing
  is written until confirmed — the 87 phantom tasks of 2026-08-14 are the precedent.
- **Guided client onboarding** in one pass: business → package → monthly target → first
  month planned. This is also what finally sets `monthlyContentTarget`, which no client has,
  and which the Today shortfall block needs to work at all.
- **Month planner:** fill a client's month in a few taps.

---

## Phase 4 — Premium retrofit

Everything built in Phases 1–3 is built to a high-end standard from the start. This phase
raises the *pre-existing* screens to match, so the app does not read as two products.

- **⌘K command palette** and keyboard shortcuts — jump to any client, add an item, mark
  done, without the mouse. The single biggest contributor to a tool feeling fast.
- Dashboard and metric cards rebuilt; real typographic hierarchy rather than uniform bold.
- Purposeful motion, considered density, skeleton loading.
- Consistency pass across all 13 screens.

---

## Testing

The suite is 46 tests on Node's built-in runner against a real Postgres, run serially
(`--test-concurrency=1`) because each file truncates a shared database. Extending it:

- **Migration:** a test that seeds a `ContentCalendar` row and the twelve-item
  `ContentTask` shape, runs the migration, and asserts nothing is lost and `isDone` is
  derived correctly.
- **Cross-client query:** the Work board endpoint returns items from more than one client
  in a single call — the regression that would recreate the original problem.
- **Permissions:** a non-owner sees only what they may see on the Team board, and no
  colleague's email or password hash is ever serialised. This was a real defect in the
  2026-08-27 team commit and must not return.
- **Optional fields:** an item created with only title, type and client is valid, and a
  null `stage` never renders as "undefined" or blocks a tick.

## Risks

1. **The migration is the one genuinely risky step** — live data, a database shared with
   another product, and no migration history. Mitigated by rehearsing on the local copy,
   hand-reviewing generated SQL, and leaving `ContentCalendar` in place for one release.
2. **Phase 1 might not fix adoption.** If items are still not being added fourteen days
   after release, the problem is not the CRM's shape and no amount of Phase 2–4 work will
   help. The response is to ask why, not to build more.
3. **Two fields for "finished"** (`isDone` and `stage`) can disagree. Accepted knowingly;
   `isDone` is authoritative everywhere and `stage` is never read to decide completion.
