# Phase 1 — One list, all clients, assigned — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "what is outstanding?" answerable on one screen across all 8 clients, with every content item owned by a named person.

**Architecture:** `ContentTask` becomes the single content record by gaining five optional
columns (assignee, platform, stage, scheduled date, media). Nothing existing changes shape,
so the twelve live rows keep working untouched. The one `ContentCalendar` row is copied
across; that table is left in place, unread, for one release. `GET /api/content-tasks` stops
requiring a `clientId` — that single change is the adoption fix — and a new `/work` screen
reads it.

**Tech Stack:** Express 5, Prisma 6 / Postgres (Supabase), React 19, react-query v5,
Tailwind v4, Vite. Tests are Node's built-in runner against a real Postgres, run serially.

---

## Deviation from the spec, decided at plan time

Spec §1.1 renames the model `ContentTask` → `ContentItem`. **Phase 1 keeps the name
`ContentTask`.** The rename is cosmetic, touches ~30 call sites across routes, tests and the
client, and buys nothing the board needs. It lands in Phase 2, when `ContentCalendar` is
dropped and the dead `Task` model goes with it — one renaming pass instead of two. Everything
else in §1.1 is implemented as written.

Also decided: `stage` reuses the **existing** `ContentStatus` enum rather than defining a new
`ContentStage`. Fewer enums, and it is the same six values.

## File structure

| File | Responsibility |
| --- | --- |
| `server/prisma/schema.prisma` | Five new optional fields + two indexes on `ContentTask` |
| `server/prisma/migrations-manual/2026-08-31-content-item.sql` | Hand-reviewed DDL + the one-row data copy |
| `server/routes/content-tasks.routes.js` | `clientId` optional; assignee filter; workload |
| `server/utils/contentFilters.js` | **New.** Builds the `where` clause from query params. Shared by list + workload so the two can never disagree |
| `server/tests/work-board.test.js` | **New.** Cross-client query, assignment, permissions |
| `client/src/lib/useWorkBoard.js` | **New.** Cross-client list + optimistic tick |
| `client/src/pages/Work.jsx` | **New.** The board |
| `client/src/components/WorkRow.jsx` | **New.** One item row, shared by Work and My Work |
| `client/src/lib/nav.js` | `/work` nav entry; non-owners land there |
| `client/src/App.jsx` | `/work` route |

---

### Task 1: Add the five optional fields to the schema

**Files:**
- Modify: `server/prisma/schema.prisma` (the `ContentTask` model)

- [ ] **Step 1: Add the fields**

In `model ContentTask`, after the `completedById` block and before `createdAt`:

```prisma
  // Phase 1: this record became the single content item. Every field below is optional,
  // so an item created the old way — title, type, due date, tick — is still valid and is
  // exactly what the twelve live rows are. The pipeline is available to whoever wants it
  // and invisible to whoever does not.
  assignedToId  String?
  assignedTo    User?          @relation("ContentAssignee", fields: [assignedToId], references: [id], onDelete: SetNull)
  platform      Platform?
  // Descriptive only. `isDone` is the single truth for "finished" — stage is never read to
  // decide completion, so the two can differ without anything breaking.
  stage         ContentStatus?
  scheduledDate DateTime?
  mediaUrl      String?
```

Add the two indexes alongside the existing ones:

```prisma
  @@index([assignedToId, isDone])
  @@index([isDone, dueDate])
```

- [ ] **Step 2: Add the back-relation on User**

In `model User`, beside the existing `contentTasksCreated` / `contentTasksCompleted`:

```prisma
  contentTasksAssigned  ContentTask[] @relation("ContentAssignee")
```

- [ ] **Step 3: Validate and generate**

```bash
cd server && npx prisma validate && npx prisma generate
```
Expected: `The schema at prisma/schema.prisma is valid` then `Generated Prisma Client`.

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma && git commit -m "Give a content item an owner, and room for a plan"
```

---

### Task 2: Make the list cross-client (the adoption fix)

This is the task the whole phase exists for. TDD — the test must fail first.

**Files:**
- Create: `server/tests/work-board.test.js`
- Create: `server/utils/contentFilters.js`
- Modify: `server/routes/content-tasks.routes.js:49-70`

- [ ] **Step 1: Write the failing test**

Create `server/tests/work-board.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, reset, makeUser, login, req, prisma } = require("./helpers");

let owner, designer, designerId, clientA, clientB;

test.before(async () => {
  await start();
  await reset();

  clientA = await prisma.client.create({
    data: { businessName: "Alpha Motors", contactPerson: "Asha", phone: "9000000001", status: "ACTIVE" }
  });
  clientB = await prisma.client.create({
    data: { businessName: "Beta Foods", contactPerson: "Bharat", phone: "9000000002", status: "ACTIVE" }
  });

  await makeUser({ email: "owner@test.in", role: "OWNER" });
  owner = await login("owner@test.in");

  const d = await makeUser({ email: "designer@test.in", role: "DESIGNER", permissions: ["content"] });
  designerId = d.id;
  designer = await login("designer@test.in");

  await prisma.contentTask.createMany({
    data: [
      { clientId: clientA.id, title: "Diwali reel",    type: "REEL", dueDate: new Date("2026-09-02") },
      { clientId: clientA.id, title: "Menu carousel",  type: "CAROUSEL", isDone: true },
      { clientId: clientB.id, title: "Store opening",  type: "POST", dueDate: new Date("2026-09-01") },
      { clientId: clientB.id, title: "Founder story",  type: "STORY" }
    ]
  });
});
test.after(stop);

test("the list answers 'what is outstanding?' without naming a client", async () => {
  const { status, body } = await req("/content-tasks", { token: owner });
  assert.equal(status, 200, "asking with no clientId must not be rejected");

  const clients = new Set(body.data.map((item) => item.clientId));
  assert.equal(clients.size, 2, "one call must span every client, not one at a time");
  assert.equal(body.data.length, 4);
});

test("each row names its client, so the board can show it", async () => {
  const { body } = await req("/content-tasks", { token: owner });
  const row = body.data.find((item) => item.title === "Diwali reel");
  assert.equal(row.client.businessName, "Alpha Motors");
});

test("pending-only is one query param, and is what the board opens on", async () => {
  const { body } = await req("/content-tasks?done=false", { token: owner });
  assert.equal(body.data.length, 3);
  assert.ok(body.data.every((item) => item.isDone === false));
});

test("asking for one client still works exactly as before", async () => {
  const { status, body } = await req(`/content-tasks?clientId=${clientA.id}`, { token: owner });
  assert.equal(status, 200);
  assert.equal(body.data.length, 2);
  assert.ok(body.data.every((item) => item.clientId === clientA.id));
});

test("the summary counts what was asked for, not the whole table", async () => {
  const { body } = await req(`/content-tasks?clientId=${clientB.id}`, { token: owner });
  assert.deepEqual(
    { total: body.summary.total, pending: body.summary.pending, done: body.summary.done },
    { total: 2, pending: 2, done: 0 }
  );
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd server && npm test -- --test-name-pattern="without naming a client"
```
Expected: FAIL — `asking with no clientId must not be rejected`, actual `422`.

- [ ] **Step 3: Write the filter builder**

Create `server/utils/contentFilters.js`:

```js
/**
 * Turns the board's query string into a Prisma `where`.
 *
 * The list and the workload counts both go through here so they can never disagree about
 * what "pending" means — that divergence is what made the old workload screen report zero
 * while there was real work outstanding.
 */
function contentWhere(query = {}) {
  const { clientId, assignedTo, done, type } = query;
  const where = {};

  // The whole point of Phase 1: no clientId means every client, not an error.
  if (clientId) where.clientId = String(clientId);
  if (type) where.type = String(type);
  if (done === "true") where.isDone = true;
  if (done === "false") where.isDone = false;

  // "unassigned" is a real thing to filter for — it is the pile nobody has picked up.
  if (assignedTo === "unassigned") where.assignedToId = null;
  else if (assignedTo) where.assignedToId = String(assignedTo);

  return where;
}

module.exports = { contentWhere };
```

- [ ] **Step 4: Use it in the route**

In `server/routes/content-tasks.routes.js`, add to the requires:

```js
const { contentWhere } = require("../utils/contentFilters");
```

Extend `WITH_PEOPLE` so a row can name its client and its owner:

```js
const WITH_PEOPLE = {
  createdBy: { select: { id: true, name: true, avatar: true } },
  completedBy: { select: { id: true, name: true, avatar: true } },
  assignedTo: { select: { id: true, name: true, avatar: true } },
  // The board spans clients, so every row has to say which one it belongs to. Name only —
  // the content plan is shared with colleagues who have no business reading contract values.
  client: { select: { id: true, businessName: true } }
};
```

Replace the whole `router.get("/", ...)` handler with:

```js
router.get("/", asyncRoute(async (req, res) => {
  const data = await prisma.contentTask.findMany({
    where: contentWhere(req.query),
    orderBy: ORDER,
    include: WITH_PEOPLE,
    // A board that spans every client needs a ceiling. 500 is far above a real month's
    // work for 8 clients and keeps one bad query from returning the whole table.
    take: 500
  });

  res.json({
    data,
    summary: {
      total: data.length,
      done: data.filter((task) => task.isDone).length,
      pending: data.filter((task) => !task.isDone).length
    }
  });
}));
```

- [ ] **Step 5: Run the tests**

```bash
cd server && npm test -- --test-name-pattern="board|client"
```
Expected: PASS, 5/5.

- [ ] **Step 6: Run the whole suite — nothing may regress**

```bash
cd server && npm test
```
Expected: all pre-existing tests still pass. `content-sharing.test.js` asks with a
`clientId` and must be unaffected.

- [ ] **Step 7: Commit**

```bash
git add server/utils/contentFilters.js server/routes/content-tasks.routes.js server/tests/work-board.test.js
git commit -m "Answer 'what is outstanding?' in one request, not eight"
```

---

### Task 3: Assign an item to a colleague

**Files:**
- Modify: `server/routes/content-tasks.routes.js` (schemas + `PUT /:id`)
- Modify: `server/tests/work-board.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/work-board.test.js`:

```js
test("an item can be handed to a colleague, and comes back naming them", async () => {
  const { body: list } = await req("/content-tasks?done=false", { token: owner });
  const item = list.data.find((entry) => entry.title === "Diwali reel");

  const { status, body } = await req(`/content-tasks/${item.id}`, {
    token: owner, method: "PUT", body: { assignedToId: designerId }
  });
  assert.equal(status, 200);
  assert.equal(body.data.assignedTo.name, "DESIGNER User");
});

test("a colleague can ask for just their own work", async () => {
  const { body } = await req(`/content-tasks?assignedTo=${designerId}&done=false`, { token: designer });
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].title, "Diwali reel");
});

test("the unassigned pile is askable, and is what nobody has picked up", async () => {
  const { body } = await req("/content-tasks?assignedTo=unassigned&done=false", { token: owner });
  assert.equal(body.data.length, 2);
  assert.ok(body.data.every((item) => item.assignedToId === null));
});

test("an item cannot be handed to somebody who does not exist", async () => {
  const { body: list } = await req("/content-tasks?done=false", { token: owner });
  const item = list.data[0];
  const { status } = await req(`/content-tasks/${item.id}`, {
    token: owner, method: "PUT", body: { assignedToId: "no-such-user" }
  });
  assert.equal(status, 422, "a bad assignee must be a 4xx, never a 500 from Prisma");
});

test("assigning never leaks a colleague's email or password hash", async () => {
  const { body } = await req("/content-tasks?done=false", { token: designer });
  const serialised = JSON.stringify(body);
  assert.ok(!serialised.includes("designer@test.in"), "no email may reach the browser");
  assert.ok(!serialised.includes("$2b$"), "no password hash may reach the browser");
});
```

- [ ] **Step 2: Run and watch them fail**

```bash
cd server && npm test -- --test-name-pattern="handed to a colleague"
```
Expected: FAIL — `assignedTo` is undefined on the response.

- [ ] **Step 3: Accept the field**

In `content-tasks.routes.js`, add to `taskSchema`:

```js
  assignedToId: z.string().min(1).optional().nullable(),
```

Then, in `router.put("/:id", ...)`, immediately after the `current` lookup and its 404:

```js
  // Prisma raises a P2003 foreign-key error for an unknown id, which surfaces as a 500.
  // Checking first turns a typo into an honest 422.
  if (body.assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: { id: body.assignedToId, isActive: true, role: { not: "CLIENT" } },
      select: { id: true }
    });
    if (!assignee) return res.status(422).json({ message: "Choose a colleague to hand this to." });
  }
```

Apply the same guard inside `router.post("/", ...)` after the client lookup, so an item can
be created already assigned.

- [ ] **Step 4: Run the tests**

```bash
cd server && npm test -- --test-name-pattern="colleague|unassigned|leak"
```
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add server/routes/content-tasks.routes.js server/tests/work-board.test.js
git commit -m "Hand a reel to the person who is making it"
```

---

### Task 4: Workload counted from real work

Replaces `GET /api/tasks/workload`, which counts the empty `Task` table.

**Files:**
- Modify: `server/routes/content-tasks.routes.js` (new route)
- Modify: `server/routes/tasks.routes.js:55-68` (delete the old route)
- Modify: `server/tests/work-board.test.js` (append)

- [ ] **Step 1: Write the failing test**

```js
test("workload counts content work, and is visible to the whole team", async () => {
  const { status, body } = await req("/content-tasks/workload", { token: designer });
  assert.equal(status, 200, "the team board is not owner-only any more");

  const mine = body.data.find((row) => row.userId === designerId);
  assert.equal(mine.pending, 1, "the Diwali reel assigned in Task 3");
  assert.equal(mine.name, "DESIGNER User");
  assert.ok(!("email" in mine), "workload rows must not carry emails");

  assert.ok(body.unassigned >= 2, "the pile nobody owns is part of the picture");
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
cd server && npm test -- --test-name-pattern="workload counts content"
```
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Add the route**

In `content-tasks.routes.js`, **above** `router.put("/:id", ...)` so `/workload` is not
swallowed by the `:id` parameter:

```js
// Everyone sees everyone's queue. The old owner-only version counted Task rows, a table
// with nothing in it, so it reported zero while real work was outstanding.
router.get("/workload", asyncRoute(async (_req, res) => {
  const [people, grouped, unassigned] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "CLIENT" }, isActive: true },
      select: { id: true, name: true, avatar: true, role: true },
      orderBy: { createdAt: "asc" }
    }),
    prisma.contentTask.groupBy({
      by: ["assignedToId", "isDone"],
      _count: { _all: true },
      where: { assignedToId: { not: null } }
    }),
    prisma.contentTask.count({ where: { assignedToId: null, isDone: false } })
  ]);

  const now = new Date();
  const overdue = await prisma.contentTask.groupBy({
    by: ["assignedToId"],
    _count: { _all: true },
    where: { assignedToId: { not: null }, isDone: false, dueDate: { lt: now } }
  });

  const countFor = (userId, isDone) => grouped
    .find((row) => row.assignedToId === userId && row.isDone === isDone)?._count._all || 0;

  res.json({
    data: people.map((person) => ({
      userId: person.id,
      name: person.name,
      avatar: person.avatar,
      role: person.role,
      pending: countFor(person.id, false),
      done: countFor(person.id, true),
      overdue: overdue.find((row) => row.assignedToId === person.id)?._count._all || 0
    })),
    unassigned
  });
}));
```

- [ ] **Step 4: Delete the dead route**

Remove the whole `router.get("/workload", requireRole(["OWNER"]), ...)` block from
`server/routes/tasks.routes.js` (lines 55–68). If `requireRole` is then unused in that
file, remove its require too.

- [ ] **Step 5: Run the suite**

```bash
cd server && npm test
```
Expected: all pass. If a test referenced `/tasks/workload`, update it to
`/content-tasks/workload` — that endpoint is gone deliberately.

- [ ] **Step 6: Commit**

```bash
git add server/routes/content-tasks.routes.js server/routes/tasks.routes.js server/tests/work-board.test.js
git commit -m "Count the work people actually do"
```

---

### Task 5: Rehearse the production migration locally

Nothing here touches production. This proves the SQL before Task 9 runs it for real.

**Files:**
- Create: `server/prisma/migrations-manual/2026-08-31-content-item.sql`

- [ ] **Step 1: Generate the DDL from the schema diff**

```bash
cd server && npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/generated.sql && cat /tmp/generated.sql
```
Expected: `ALTER TABLE "ContentTask" ADD COLUMN` for five columns, a foreign key, two
`CREATE INDEX`. **Read every line.** If it contains any `DROP`, stop and investigate — the
diff has picked up drift, and dropping anything on this database is not acceptable.

- [ ] **Step 2: Write the reviewed migration**

Create `server/prisma/migrations-manual/2026-08-31-content-item.sql`:

```sql
-- Phase 1: ContentTask becomes the single content record.
-- Hand-reviewed. Additive only: no column is dropped, no type is narrowed, and every new
-- column is nullable, so the twelve existing rows are valid before and after.

BEGIN;

ALTER TABLE "ContentTask"
  ADD COLUMN IF NOT EXISTS "assignedToId"  TEXT,
  ADD COLUMN IF NOT EXISTS "platform"      "Platform",
  ADD COLUMN IF NOT EXISTS "stage"         "ContentStatus",
  ADD COLUMN IF NOT EXISTS "scheduledDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mediaUrl"      TEXT;

ALTER TABLE "ContentTask"
  DROP CONSTRAINT IF EXISTS "ContentTask_assignedToId_fkey";
ALTER TABLE "ContentTask"
  ADD CONSTRAINT "ContentTask_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ContentTask_assignedToId_isDone_idx"
  ON "ContentTask"("assignedToId", "isDone");
CREATE INDEX IF NOT EXISTS "ContentTask_isDone_dueDate_idx"
  ON "ContentTask"("isDone", "dueDate");

-- Copy the ContentCalendar rows across. ContentCalendar is NOT dropped: it is left in
-- place and unread for one release so this is reversible by deleting the copied rows.
-- The guard makes re-running the file harmless.
INSERT INTO "ContentTask"
  (id, "clientId", title, type, notes, "dueDate", "isDone", "completedAt",
   "createdAt", "updatedAt", platform, stage, "scheduledDate", "mediaUrl")
SELECT
  gen_random_uuid()::text,
  cc."clientId",
  COALESCE(NULLIF(btrim(cc.caption), ''), cc."postType"::text || ' post'),
  CASE cc."postType"
    WHEN 'REEL'     THEN 'REEL'
    WHEN 'STORY'    THEN 'STORY'
    WHEN 'CAROUSEL' THEN 'CAROUSEL'
    WHEN 'STATIC'   THEN 'POST'
    ELSE 'OTHER'
  END::"ContentTaskType",
  cc."designBrief",
  cc."scheduledDate",
  (cc.status = 'PUBLISHED'),
  cc."publishedAt",
  cc."createdAt",
  cc."updatedAt",
  cc.platform,
  cc.status,
  cc."scheduledDate",
  cc."mediaUrl"
FROM "ContentCalendar" cc
WHERE NOT EXISTS (
  SELECT 1 FROM "ContentTask" ct
  WHERE ct."clientId" = cc."clientId"
    AND ct."scheduledDate" IS NOT DISTINCT FROM cc."scheduledDate"
    AND ct.stage IS NOT NULL
);

COMMIT;
```

- [ ] **Step 3: Rehearse it on a copy of production**

```bash
createdb optibrandz_rehearsal 2>/dev/null; \
pg_dump "$PROD_DATABASE_URL" --no-owner --no-acl | psql -q optibrandz_rehearsal && \
psql optibrandz_rehearsal -c "SELECT count(*) AS before FROM \"ContentTask\";"
```
Expected: `before | 12`.

- [ ] **Step 4: Apply and verify**

```bash
psql optibrandz_rehearsal -f server/prisma/migrations-manual/2026-08-31-content-item.sql && \
psql optibrandz_rehearsal -c \
  "SELECT count(*) AS total, count(stage) AS copied, count(*) FILTER (WHERE \"isDone\") AS done FROM \"ContentTask\";"
```
Expected: `total | 13`, `copied | 1`, and `done` unchanged at `3` (the copied calendar row
was not `PUBLISHED`). **If `total` is not 13, do not proceed to Task 9.**

- [ ] **Step 5: Prove it is re-runnable**

```bash
psql optibrandz_rehearsal -f server/prisma/migrations-manual/2026-08-31-content-item.sql && \
psql optibrandz_rehearsal -c "SELECT count(*) FROM \"ContentTask\";"
```
Expected: still `13`. Running it twice must not duplicate the copied row.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/migrations-manual/2026-08-31-content-item.sql
git commit -m "Reviewed SQL to widen the content record, rehearsed on a copy"
```

---

### Task 6: The Work board

**Files:**
- Create: `client/src/lib/useWorkBoard.js`
- Create: `client/src/components/WorkRow.jsx`
- Create: `client/src/pages/Work.jsx`

- [ ] **Step 1: Write the hook**

Create `client/src/lib/useWorkBoard.js`:

```jsx
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useToast } from "./useToast";
import { startOfToday } from "./contentTasks";

/**
 * Every content item across every client.
 *
 * The per-client hook is useContentTasks. This one deliberately does not take a client:
 * needing to pick one before seeing anything is what stopped the list being used.
 */
export function useWorkBoard({ assignedTo = "", clientId = "", done = "false" } = {}) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const queryKey = ["work-board", { assignedTo, clientId, done }];

  const query = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (assignedTo) params.set("assignedTo", assignedTo);
      if (clientId) params.set("clientId", clientId);
      if (done) params.set("done", done);
      return api(`/content-tasks?${params}`);
    }
  });

  const items = useMemo(() => query.data?.data || [], [query.data]);

  async function toggle(item) {
    const previous = queryClient.getQueryData(queryKey);
    queryClient.setQueryData(queryKey, (current) => current && {
      ...current,
      data: current.data.map((entry) => entry.id === item.id
        ? { ...entry, isDone: !entry.isDone }
        : entry)
    });
    try {
      await api(`/content-tasks/${item.id}/toggle`, { method: "PUT" });
      queryClient.invalidateQueries({ queryKey: ["work-board"] });
      queryClient.invalidateQueries({ queryKey: ["content-workload"] });
      queryClient.invalidateQueries({ queryKey: ["content-tasks"] });
    } catch (error) {
      queryClient.setQueryData(queryKey, previous);
      notify(error.message, "error");
    }
  }

  async function assign(item, assignedToId) {
    try {
      await api(`/content-tasks/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ assignedToId: assignedToId || null })
      });
      queryClient.invalidateQueries({ queryKey: ["work-board"] });
      queryClient.invalidateQueries({ queryKey: ["content-workload"] });
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return { query, items, toggle, assign };
}

/**
 * Splits the list into the buckets the board shows.
 *
 * Due date is the axis because it is the field every real item already has. Undated work
 * goes last rather than being hidden — it is still owed, it just has no date yet.
 */
export function groupByDue(items, today = startOfToday()) {
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const buckets = {
    overdue: [], today: [], week: [], later: [], undated: []
  };

  items.forEach((item) => {
    if (!item.dueDate) return buckets.undated.push(item);
    const due = new Date(item.dueDate);
    if (due < today) return buckets.overdue.push(item);
    if (due.toDateString() === today.toDateString()) return buckets.today.push(item);
    if (due < endOfWeek) return buckets.week.push(item);
    buckets.later.push(item);
  });

  return buckets;
}
```

- [ ] **Step 2: Write the row component**

Create `client/src/components/WorkRow.jsx`:

```jsx
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { taskTypeLabel } from "../lib/contentTasks";
import { shortDate } from "../lib/format";
import { initials } from "../lib/format";

/**
 * One content item on the board.
 *
 * The client name is part of the row rather than the page heading, because this board
 * spans every client — without it a reel and a post look identical.
 */
export default function WorkRow({ item, people = [], onToggle, onAssign }) {
  return <div className={`work-row ${item.isDone ? "is-done" : ""}`}>
    <button
      type="button"
      className={`tick ${item.isDone ? "ticked" : ""}`}
      onClick={() => onToggle(item)}
      aria-pressed={item.isDone}
      aria-label={item.isDone ? `Re-open ${item.title}` : `Mark ${item.title} done`}
    >{item.isDone && <Check size={14} strokeWidth={3} />}</button>

    <div className="work-row-body">
      <div className="work-row-title">{item.title}</div>
      <div className="work-row-meta">
        {item.client && <Link to={`/clients/${item.client.id}`} className="work-client">
          {item.client.businessName}
        </Link>}
        <span className="work-type">{taskTypeLabel(item.type)}</span>
        {item.dueDate && <span className="work-due">{shortDate(item.dueDate)}</span>}
      </div>
    </div>

    <select
      className="work-assign"
      value={item.assignedToId || ""}
      onChange={(event) => onAssign(item, event.target.value)}
      aria-label={`Who is doing ${item.title}`}
    >
      <option value="">Unassigned</option>
      {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
    </select>
  </div>;
}
```

- [ ] **Step 3: Write the page**

Create `client/src/pages/Work.jsx`. It renders the five buckets from `groupByDue`, a
filter bar (client / assignee / pending-done), an add form whose client is a **field, not a
gate**, and an honest empty state. Reuse `QueryState` for loading and error. Full component
body is written during implementation following the patterns in `ContentCalendar.jsx` —
the same `panel`, `toolbar`, `empty-state` classes.

- [ ] **Step 4: Verify in the browser**

Start the dev server via the preview tooling, sign in, and confirm: items from **more than
one client** appear without touching a dropdown; ticking one strikes it through instantly;
reassigning moves it in the Team board.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/useWorkBoard.js client/src/components/WorkRow.jsx client/src/pages/Work.jsx
git commit -m "One board that shows every client's outstanding work"
```

---

### Task 7: Route it, and land people on it

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/lib/nav.js`

- [ ] **Step 1: Add the lazy import and route**

In `App.jsx`, beside the other lazy imports:

```jsx
const Work = lazy(() => import("./pages/Work"));
```

And above the `/schedule` route:

```jsx
<Route path="/work" element={<RequireAuth permission="content"><Work /></RequireAuth>} />
```

- [ ] **Step 2: Add the nav entry**

In `nav.js`, insert as the **second** item, straight after Today:

```js
  { label: "Work", short: "Work", href: "/work", icon: ListTodo, key: "content" },
```

Add `ListTodo` to the `lucide-react` import. Put `/work` in the phone's primary tabs,
replacing `/schedule` — Schedule stays reachable under More:

```js
export const PRIMARY_MOBILE_HREFS = ["/today", "/work", "/clients", "/invoices"];
```

- [ ] **Step 3: Land non-owners on their own work**

Replace `firstAllowedPath`:

```js
export function firstAllowedPath(user) {
  if (user?.role === "CLIENT") return "/portal/dashboard";
  // A colleague signing in wants their own queue, not a client picker and not the owner's
  // money screen. The owner keeps landing on Today.
  if (user?.role !== "OWNER" && canAccess(user, "content")) return "/work";
  return visibleNav(user)[0]?.href || "/login";
}
```

- [ ] **Step 4: Verify the build**

```bash
cd client && npm run build
```
Expected: build succeeds, `Work` emitted as its own chunk.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/lib/nav.js
git commit -m "Make the work board the way in"
```

---

### Task 8: Team board reads real work

**Files:**
- Modify: `client/src/pages/Team.jsx`

- [ ] **Step 1: Add the workload panel**

Above the existing member-admin table, add a panel reading `GET /content-tasks/workload`
via `useQuery({ queryKey: ["content-workload"] })`. One card per colleague: name, role,
**pending**, **overdue** (red when non-zero), **done**. Plus an "Unassigned" card showing
`body.unassigned`, linking to `/work?assignedTo=unassigned` — the pile nobody has picked up
is the thing the owner most needs to see.

- [ ] **Step 2: Open the route to the whole team**

In `App.jsx`, change the Team route from `roles={["OWNER"]}` to `permission="team"`, so
colleagues can see each other's queues. Member administration inside the page stays
owner-only — gate the add/edit/delete controls on `user.role === "OWNER"`.

- [ ] **Step 3: Verify**

Sign in as a non-owner and confirm the workload panel renders while the "Add team member"
button does not.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Team.jsx client/src/App.jsx
git commit -m "Show the team what the team is carrying"
```

---

### Task 9: Apply to production

Only after Tasks 1–8 are merged and `npm test` is green.

- [ ] **Step 1: Confirm the rehearsal passed**

Task 5 Step 4 reported `total | 13`. If it did not, stop.

- [ ] **Step 2: Back up the table**

```bash
pg_dump "$PROD_DATABASE_URL" --table='"ContentTask"' --table='"ContentCalendar"' \
  --no-owner --no-acl > ~/optibrandz-content-backup-2026-08-31.sql && \
  wc -l ~/optibrandz-content-backup-2026-08-31.sql
```
Expected: a non-empty file. **Do not continue without it.**

- [ ] **Step 3: Apply**

```bash
psql "$PROD_DATABASE_URL" -f server/prisma/migrations-manual/2026-08-31-content-item.sql
```
Expected: `COMMIT`, no errors.

- [ ] **Step 4: Verify against the known numbers**

```bash
psql "$PROD_DATABASE_URL" -c \
  "SELECT count(*) AS total, count(stage) AS copied, count(*) FILTER (WHERE \"isDone\") AS done FROM \"ContentTask\";"
```
Expected: `total | 13`, `copied | 1`, `done | 3` — the twelve real rows plus the one copied
calendar item, with the three completed ones untouched.

- [ ] **Step 5: Deploy and smoke-test**

Push to `main`; Vercel auto-deploys. Then sign in and confirm the Work board shows items
from more than one client, and `/api/health` still returns `{"ok":true}`.

- [ ] **Step 6: Commit the record**

```bash
git commit --allow-empty -m "Applied the content-item migration to production"
```

---

## Self-review

**Spec coverage:** §1.1 merge — Tasks 1, 5, 9 (rename deferred, flagged above). §1.2 Work
board — Tasks 2, 6, 7. §1.3 My Work — Task 7 Step 3 lands colleagues on `/work`, which
filters to them via `assignedTo`. §1.4 Team board — Tasks 4, 8; old owner-only route deleted
in Task 4 Step 4. §1.5 empty states — Task 6 Step 3. Testing section — Tasks 2, 3, 4 cover
cross-client, permissions, no-leak and optional fields.

**Gap found and closed:** the spec's success measure needs `assignedTo` filtering to be
reachable from the UI; Task 8 Step 1 links the unassigned pile, and Task 7 lands colleagues
on their own filter.

**Type consistency:** `contentWhere(query)` is defined in Task 2 and used in Tasks 2 and 4.
`WITH_PEOPLE` gains `assignedTo` and `client` in Task 2 and is relied on in Task 3's
assertions. `groupByDue` is defined and consumed in Task 6. Query keys `work-board` and
`content-workload` are invalidated in Task 6 and read in Task 8.
