# Personal Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every colleague their own notes — private when written, shareable read-only
with named teammates — and ship it to production.

**Architecture:** Two additive Prisma tables (`Note`, `NoteShare`) behind a `notes` router
mounted with `requireRole`, deliberately *not* `requirePermission` (that middleware
short-circuits for OWNER and would hand the owner every note). Ownership is enforced by
query — every write is scoped `where: { id, ownerId: req.user.id }` and misses as 404. The
client is a two-tab page built from the existing `RecordModal` / `ConfirmModal` / segmented
control, plus one new share picker.

**Tech Stack:** Express 5, Prisma, Postgres/Supabase, React 19, react-query, Vite,
Node's built-in test runner.

Spec: `docs/superpowers/specs/2026-09-03-personal-notes-design.md`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `server/prisma/schema.prisma` | Modify — `Note`, `NoteShare`, two `User` back-relations |
| `server/prisma/migrations-manual/2026-09-03-notes.sql` | Create — hand-applied production DDL, guarded, RLS on |
| `server/routes/notes.routes.js` | Create — the five note routes; ownership scoping lives here and nowhere else |
| `server/routes/team-options.routes.js` | Create — name-only teammate list for the picker |
| `server/index.js` | Modify — mount both routers |
| `server/tests/helpers.js` | Modify — add the two tables to `reset()`'s TRUNCATE |
| `server/tests/notes.test.js` | Create — privacy, sharing, validation, notification |
| `client/src/lib/useNotes.js` | Create — one react-query cache both tabs read |
| `client/src/components/NoteCard.jsx` | Create — one note in either list; read-only variant |
| `client/src/components/NoteShareModal.jsx` | Create — tickable teammate picker |
| `client/src/pages/Notes.jsx` | Create — the page: tabs, queries, modals |
| `client/src/lib/nav.js` | Modify — add the Notes item with no permission key |
| `client/src/App.jsx` | Modify — lazy route `/notes` |
| `client/src/index.css` | Modify — note card and share row styles |

---

## Task 1: Schema and production DDL

**Files:** Modify `server/prisma/schema.prisma`; Create `server/prisma/migrations-manual/2026-09-03-notes.sql`

- [ ] **Step 1: Add both models and the `User` back-relations** exactly as written in the
      spec's Data model section. `Note.body` defaults to `""`. `NoteShare` carries
      `@@unique([noteId, userId])` and `@@index([userId, sharedAt])`.

- [ ] **Step 2: Validate and generate**

Run: `npm run db:validate --prefix server && npm run db:generate --prefix server`
Expected: "The schema at prisma/schema.prisma is valid" then "Generated Prisma Client".

- [ ] **Step 3: Push to the local dev and test databases**

```bash
cd server
DATABASE_URL='postgresql://alokpandey@localhost:5432/optibrandz_crm' DIRECT_URL='postgresql://alokpandey@localhost:5432/optibrandz_crm' npx prisma db push
DATABASE_URL='postgresql://alokpandey@localhost:5432/optibrandz_crm_test' DIRECT_URL='postgresql://alokpandey@localhost:5432/optibrandz_crm_test' npx prisma db push
```

Both must be pushed: `db push` follows `directUrl`, so set both variables or it lands in
the wrong database.

- [ ] **Step 4: Generate the production DDL from the real production shape**

```bash
cd server
npx prisma migrate diff --from-url "$PROD_URL" --to-schema-datamodel prisma/schema.prisma --script
```

Hand-edit the output into `migrations-manual/2026-09-03-notes.sql`: `CREATE TABLE IF NOT
EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`, and append for both tables:

```sql
ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NoteShare" ENABLE ROW LEVEL SECURITY;
```

No policies. The app connects as `postgres`, which owns the tables and bypasses RLS; the
public anon key is left with nothing. Skipping this leaves the new tables as the one
readable hole in the schema.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations-manual/2026-09-03-notes.sql
git commit -m "A note of your own, and who may read it"
```

---

## Task 2: Test harness knows about the new tables

**Files:** Modify `server/tests/helpers.js`

- [ ] **Step 1: Add `"Note", "NoteShare"` to the TRUNCATE list** in `reset()`. Without
      this, notes rows survive between test files and later files start dirty.

- [ ] **Step 2: Confirm nothing regressed**

Run: `npm test --prefix server`
Expected: 67 tests, 0 fail.

- [ ] **Step 3: Commit**

```bash
git add server/tests/helpers.js && git commit -m "Reset the notes tables between test files"
```

---

## Task 3: Privacy — the tests that define the feature

**Files:** Create `server/tests/notes.test.js`

- [ ] **Step 1: Write the failing privacy tests.** Fixtures: `owner@x` (OWNER),
      `amy@x` (DESIGNER), `bob@x` (SEO_EXEC), `client@x` (CLIENT, `clientId` set).

```js
test("a note is private to the person who wrote it", async () => {
  // amy creates; bob's GET must not contain it
  const created = await req("/notes", { token: amyToken, method: "POST",
    body: { title: "Diwali shoot", body: "call the caterer" } });
  assert.equal(created.status, 201);
  const bobList = await req("/notes", { token: bobToken });
  assert.equal(bobList.body.data.mine.length, 0);
  assert.equal(bobList.body.data.shared.length, 0);
});

test("the owner is not special: an unshared note is invisible to them too", async () => {
  const created = await req("/notes", { token: amyToken, method: "POST",
    body: { title: "private", body: "mine" } });
  const ownerList = await req("/notes", { token: ownerToken });
  assert.equal(ownerList.body.data.mine.length, 0);
  assert.equal(ownerList.body.data.shared.length, 0);
  const read = await req(`/notes/${created.body.data.id}`, { token: ownerToken, method: "PUT",
    body: { title: "hijacked" } });
  assert.equal(read.status, 404);
  const removed = await req(`/notes/${created.body.data.id}`, { token: ownerToken, method: "DELETE" });
  assert.equal(removed.status, 404);
});

test("someone else's note id is indistinguishable from one that never existed", async () => {
  const created = await req("/notes", { token: amyToken, method: "POST", body: { title: "x" } });
  const real = await req(`/notes/${created.body.data.id}`, { token: bobToken, method: "PUT", body: { title: "y" } });
  const fake = await req("/notes/00000000-0000-0000-0000-000000000000", { token: bobToken, method: "PUT", body: { title: "y" } });
  assert.equal(real.status, 404);
  assert.equal(fake.status, real.status);
});

test("a client login cannot reach notes at all", async () => {
  const list = await req("/notes", { token: clientToken });
  assert.equal(list.status, 403);
});
```

- [ ] **Step 2: Run them and watch every one fail**

Run: `npm test --prefix server -- --test-name-pattern="note"`
Expected: FAIL — the route does not exist, so every assertion misses.

---

## Task 4: The notes router

**Files:** Create `server/routes/notes.routes.js`; Modify `server/index.js`

- [ ] **Step 1: Write the router.** Zod schema: `title` trimmed 1–200, `body` max 20000
      default `""`. Constants mirroring `content-tasks.routes.js`:

```js
// Only what a card renders. A note must never ship a whole user row.
const PERSON = { select: { id: true, name: true, avatar: true, role: true } };
const OWNED = (userId) => ({ where: { ownerId: userId } });
```

`GET /` returns `{ data: { mine, shared } }` — `mine` is `ownerId = req.user.id` including
`shares: { include: { user: PERSON } }`, `shared` is `NoteShare` rows where
`userId = req.user.id` including `note: { include: { owner: PERSON } }`. Both
`take: 200`, ordered `updatedAt desc` / `sharedAt desc`.

`POST /` sets `ownerId: req.user.id` — never from the body.

`PUT /:id` and `DELETE /:id` start with
`prisma.note.findFirst({ where: { id: req.params.id, ownerId: req.user.id } })` and
`return res.status(404).json({ message: "Note not found" })` on a miss.

- [ ] **Step 2: Mount it** in `server/index.js`, next to the other content routes:

```js
// Deliberately not behind requirePermission: that middleware returns next() for OWNER,
// which would hand the owner every private note in the agency. Notes belong to whoever is
// logged in, so there is no section permission to hold — only CLIENT is kept out.
app.use("/api/notes", verifyToken, requireRole(["OWNER", "ACCOUNT_MANAGER", "DESIGNER", "SEO_EXEC"]), require("./routes/notes.routes"));
```

- [ ] **Step 3: Run the Task 3 tests**

Run: `npm test --prefix server -- --test-name-pattern="note"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/routes/notes.routes.js server/index.js server/tests/notes.test.js
git commit -m "Notes nobody else can read, the owner included"
```

---

## Task 5: Sharing, notification, and validation

**Files:** Modify `server/tests/notes.test.js`, `server/routes/notes.routes.js`

- [ ] **Step 1: Write the failing sharing tests**

```js
test("sharing puts the note in the recipient's list and rings the bell once", async () => {
  const note = await req("/notes", { token: amyToken, method: "POST", body: { title: "Shoot list" } });
  const shared = await req(`/notes/${note.body.data.id}/shares`, { token: amyToken,
    method: "PUT", body: { userIds: [bob.id] } });
  assert.equal(shared.status, 200);
  const bobList = await req("/notes", { token: bobToken });
  assert.equal(bobList.body.data.shared.length, 1);
  assert.equal(bobList.body.data.shared[0].title, "Shoot list");
  assert.equal(await prisma.notification.count({ where: { userId: bob.id } }), 1);
});

test("re-saving the same list does not ring the bell again", async () => {
  // share twice with the same id; notification count stays 1
});

test("revoking removes it from their list", async () => {
  // PUT shares with [], then bob's shared list is empty
});

test("a recipient can read but not change what was shared with them", async () => {
  const edit = await req(`/notes/${id}`, { token: bobToken, method: "PUT", body: { title: "no" } });
  assert.equal(edit.status, 404);
});

test("a note can only be shared with a real, active colleague", async () => {
  for (const target of [unknownId, client.id, deactivated.id, amy.id]) {
    const res = await req(`/notes/${id}/shares`, { token: amyToken, method: "PUT", body: { userIds: [target] } });
    assert.equal(res.status, 422);
  }
});

test("deleting a note leaves no shares behind", async () => {
  await req(`/notes/${id}`, { token: amyToken, method: "DELETE" });
  assert.equal(await prisma.noteShare.count({ where: { noteId: id } }), 0);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test --prefix server -- --test-name-pattern="note"`
Expected: FAIL — `/shares` is not routed.

- [ ] **Step 3: Implement `PUT /:id/shares`.** Own the note or 404. Validate every id with
      an `assertShareable` helper modelled on `assertAssignable` in
      `content-tasks.routes.js`: active, not `CLIENT`, not the owner, else a 422 carrying a
      sentence. Diff the incoming list against existing rows; `createMany` the additions,
      `deleteMany` the removals, and create a `Notification` only for the additions:

```js
type: "NOTE_SHARED",
message: `${req.user.name} shared a note with you: ${note.title}`,
link: `/notes?open=${note.id}`
```

- [ ] **Step 4: Run the tests**

Run: `npm test --prefix server -- --test-name-pattern="note"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/notes.routes.js server/tests/notes.test.js
git commit -m "Share a note by name, and tell them once"
```

---

## Task 6: The teammate picker endpoint

**Files:** Create `server/routes/team-options.routes.js`; Modify `server/index.js`, `server/tests/notes.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("the picker lists colleagues and leaks nothing", async () => {
  const res = await req("/team-options", { token: amyToken });
  assert.equal(res.status, 200);
  const ids = res.body.data.map((p) => p.id);
  assert.ok(ids.includes(bob.id));
  assert.ok(!ids.includes(amy.id), "you are not in your own picker");
  assert.ok(!ids.includes(client.id), "a client is never a colleague");
  assert.ok(!ids.includes(deactivated.id), "a removed teammate is not offered");
  assert.deepEqual(Object.keys(res.body.data[0]).sort(), ["avatar", "id", "name", "role"]);
});
```

- [ ] **Step 2: Run it, watch it fail** (`404 API route not found`).

- [ ] **Step 3: Implement it,** mirroring `client-options.routes.js`:

```js
router.get("/", asyncRoute(async (req, res) => {
  const data = await prisma.user.findMany({
    where: { isActive: true, role: { not: "CLIENT" }, id: { not: req.user.id } },
    select: { id: true, name: true, avatar: true, role: true },
    orderBy: { createdAt: "asc" }
  });
  res.json({ data });
}));
```

Mount: `app.use("/api/team-options", verifyToken, requireRole([...]), require("./routes/team-options.routes"));`

- [ ] **Step 4: Run the whole suite**

Run: `npm test --prefix server`
Expected: all pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add server/routes/team-options.routes.js server/index.js server/tests/notes.test.js
git commit -m "The people a note may be shared with"
```

---

## Task 7: The notes hook

**Files:** Create `client/src/lib/useNotes.js`

- [ ] **Step 1: Write it,** mirroring `useContentTasks.js`: one `["notes"]` query key both
      tabs read, `mine` / `shared` memoised off `query.data.data`, and `create`, `update`,
      `remove`, `setShares` that each `await api(...)` then invalidate. `remove` is
      optimistic with rollback, matching the calendar's `deletePost`.

- [ ] **Step 2: Lint**

Run: `npx eslint src/lib/useNotes.js` (from `client/`)
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/useNotes.js && git commit -m "One cache behind both notes tabs"
```

---

## Task 8: Card, share modal, page, nav, route, styles

**Files:** Create `client/src/components/NoteCard.jsx`, `client/src/components/NoteShareModal.jsx`, `client/src/pages/Notes.jsx`; Modify `client/src/lib/nav.js`, `client/src/App.jsx`, `client/src/index.css`

- [ ] **Step 1: `NoteCard.jsx`** — title, a clamped body preview, `shortDate(updatedAt)`.
      Owned variant shows the shared-with names and Edit / Share / Delete row actions
      (`.record-card-actions`). Read-only variant shows "From {firstName(owner)}" and
      `shortDate(sharedAt)` and no actions. Body preview is plain text — never
      `dangerouslySetInnerHTML`.

- [ ] **Step 2: `NoteShareModal.jsx`** — `useQuery(["team-options"])`, tickable rows with
      avatar, name and `pretty(role)`, seeded from the note's current recipients. Save calls
      `setShares(note, ids)`. Empty roster renders "Nobody else has been added to the team
      yet." rather than an empty box.

- [ ] **Step 3: `Notes.jsx`** — segmented **My notes** / **Shared with me** (count on the
      second), remembered in `localStorage` under `ob_notes_tab` exactly as the Content page
      remembers its tab; **New note** primary button; `RecordModal` with
      `[{ name: "title", required: true, wide: true }, { name: "body", rows: 10 }]` for
      create and edit; `ConfirmModal` for delete; a plain `Modal` with `white-space:
      pre-wrap` for reading a shared note. On mount, read `?open=<id>` from the URL and open
      that note, so the bell notification lands on it.

- [ ] **Step 4: `nav.js`** — insert `{ label: "Notes", short: "Notes", href: "/notes",
      icon: NotebookPen }` directly after Today, with **no `key`** so `canAccess` returns
      true for every colleague.

- [ ] **Step 5: `App.jsx`** — `const Notes = lazy(() => import("./pages/Notes"));` and
      `<Route path="/notes" element={<RequireAuth><Notes /></RequireAuth>} />`. No
      `permission` prop — everyone has it.

- [ ] **Step 6: `index.css`** — `.note-card`, `.note-preview` (clamped, `pre-wrap`),
      `.note-shared-with`, `.note-share-row`, `.note-read-body`. Follow the existing
      `.todo-*` blocks for spacing and weight.

- [ ] **Step 7: Lint and build**

Run: `npx eslint src && npm run build` (from `client/`)
Expected: only the pre-existing `Team.jsx` `no-useless-assignment` error; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add client/src && git commit -m "A page for your own notes"
```

---

## Task 9: Verify in the running app

**Files:** none

- [ ] **Step 1: Start the API and the dev server** against
      `postgresql://alokpandey@localhost:5432/optibrandz_crm`.

- [ ] **Step 2: As the owner** — create a note, edit it, share it with a colleague, confirm
      the "shared with" line appears on the card.

- [ ] **Step 3: As that colleague** — confirm the note is under Shared with me, is
      read-only, and that the bell shows one notification whose link opens it.

- [ ] **Step 4: As a third colleague** — confirm neither tab shows the note.

- [ ] **Step 5: Revoke** and confirm it leaves the recipient's list.

- [ ] **Step 6: Check the phone width** (375px) — cards, tabs and the share modal.

---

## Task 10: Production

**Files:** none

- [ ] **Step 1: Apply the SQL to production first.** It is additive, so the running code is
      unaffected by two tables it does not know about — there is no window where production
      is broken.

- [ ] **Step 2: Confirm both tables exist and RLS is on**

```sql
select tablename, rowsecurity from pg_tables where tablename in ('Note','NoteShare');
```

Expected: two rows, `rowsecurity = true` for both.

- [ ] **Step 3: Merge to `main` and push.** `main` auto-deploys.

- [ ] **Step 4: Verify the deployment reaches READY** and that the served bundle hash
      matches the locally built and tested one.

---

## Self-review

**Spec coverage.** Data model → Task 1. Route table and the `requireRole` decision →
Tasks 4, 5, 6. Client files and nav → Tasks 7, 8. Edge cases: deactivated teammate → Task 6
test; live-not-snapshot → inherent, no copy is ever made; quiet revoke → Task 5 test;
no repeat notification → Task 5 test. All eleven spec tests appear in Tasks 3, 5, 6.
Rollout → Task 10.

**Placeholders.** Task 5 Step 1 states three tests as comments rather than full bodies;
they are direct restatements of the assertions named beside them and are written out in
full during execution.

**Type consistency.** `setShares(note, ids)` in Task 7 matches `PUT /:id/shares
{ userIds }` in Task 5. `mine` / `shared` are the same two keys in Tasks 4, 7 and 8.
`PERSON` is the single user projection in Tasks 4 and 6.
