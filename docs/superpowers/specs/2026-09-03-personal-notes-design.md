# Personal notes, shared by name

**Date:** 2026-09-03
**Status:** approved, ready to plan

## What this is

Every colleague gets their own notes: short written things they have to do, ideas, a
script, whatever they would otherwise keep in a WhatsApp message to themselves. A note is
private when written. Its owner can share it, read-only, with named teammates.

## Why it is not the content to-do list

The CRM already has a to-do list, and adding a second place to write "what I have to do"
is only defensible if the two answer different questions.

- **Content to-dos** are what the agency owes a client. They carry a client, a kind, a due
  date, and the whole team sees them.
- **Notes** are what you owe yourself. No client, no due date, and nobody sees them unless
  you say so.

The empty state says exactly that, so nobody has to guess which one to use.

## Decisions

| Question | Decision |
| --- | --- |
| Unit | Many separate notes, each with a title and a body — not one long page |
| Sharing | Read-only. Only the owner edits or deletes |
| Owner privilege | None. The owner cannot read a note that was not shared with them |
| Who can be shared with | Active non-`CLIENT` users — the people the owner added through the Team page |
| How the recipient hears | The notification bell already in the header |

## Data model

Two additive tables.

```prisma
model Note {
  id        String      @id @default(uuid())
  ownerId   String
  owner     User        @relation("NoteOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  title     String
  body      String      @default("")
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  shares    NoteShare[]

  @@index([ownerId, updatedAt])
}

model NoteShare {
  id       String   @id @default(uuid())
  noteId   String
  note     Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
  userId   String
  user     User     @relation("NoteReader", fields: [userId], references: [id], onDelete: Cascade)
  sharedAt DateTime @default(now())

  @@unique([noteId, userId])
  @@index([userId, sharedAt])
}
```

`User` gains two back-relations: `notes Note[] @relation("NoteOwner")` and
`noteShares NoteShare[] @relation("NoteReader")`.

**Why a join table rather than a `sharedWithIds String[]` on `Note`.** An array column is
one fewer table and matches the existing `permissions String[]`, but every share rewrites
the whole array, so two shares issued from two devices race and one disappears with no
error. That is silent data loss in a feature whose whole value is trust. Rows also give
`@@unique([noteId, userId])` — double-sharing becomes impossible in the database rather
than in a code check — an indexed reverse lookup for "shared with me", and a `sharedAt`
the recipient's list wants.

Extending `ContentTask` was rejected outright: it would put private text in a table the
whole agency reads, where one loose `where` clause leaks it.

## Server

`server/routes/notes.routes.js`, mounted as:

```js
app.use("/api/notes", verifyToken, requireRole(["OWNER", "ACCOUNT_MANAGER", "DESIGNER", "SEO_EXEC"]), require("./routes/notes.routes"));
```

**Deliberately not behind `requirePermission`.** That middleware begins
`if (req.user.role === "OWNER") return next();`. Mounting notes behind it would hand the
owner every note in the agency. Notes are also not a CRM section anybody can be granted or
denied — they belong to whoever is logged in. `requireRole` keeps `CLIENT` portal logins
out and gives the owner no more than anyone else.

| Route | Behaviour |
| --- | --- |
| `GET /api/notes` | `{ data: { mine, shared } }` in one request. `mine` includes each note's recipients (name, avatar); `shared` includes the owner and `sharedAt`. Bodies included — notes are small and it makes opening one instant. `take: 200` per list |
| `POST /api/notes` | Creates. `ownerId` is always `req.user.id`, never read from the body |
| `PUT /api/notes/:id` | Title and body. Owner only |
| `DELETE /api/notes/:id` | Owner only. Cascades the shares |
| `PUT /api/notes/:id/shares` | Takes the full list of user ids. Ticking and unticking in one modal is one call, and last-write-wins is the right meaning for "here is who can see this". Notifies only ids that are newly added |
| `GET /api/team-options` | Active non-`CLIENT` users except you: `{ id, name, avatar, role }`. Mirrors the existing `/client-options` |

**Ownership is enforced by query, not by a branch.** Every write starts with
`findFirst({ where: { id, ownerId: req.user.id } })` and returns 404 when it misses, so a
teammate's note id is indistinguishable from one that never existed and the API cannot be
used to probe what exists. No route accepts a note id and returns it without either
`ownerId = me` or a `NoteShare` row for me.

Share targets are validated the way `assertAssignable` validates an assignee: an unknown
id, a `CLIENT`, a deactivated user, or yourself is a 422 with a sentence, not a 500.

Limits: title 200 characters, body 20,000.

## Client

**Nav.** `{ label: "Notes", href: "/notes", icon: NotebookPen }` with no `key`.
`canAccess` returns true when there is no permission, so every colleague sees it without
anyone's permissions changing. Placed second, after Today — a notes page nobody passes
daily is a notes page nobody uses. The phone's bottom bar is left alone; Notes lives
under More.

**Page.** `pages/Notes.jsx`, laid out like the Content page so there is nothing new to
learn: a segmented **My notes** / **Shared with me** control with the same per-device
memory of which tab you were on, and **New note** as the primary button.

- A note is a card: title, the first lines of the body, when it changed, and the names it
  was shared with. Row actions mirror the to-do list's: Edit, Share, Delete.
- **Shared with me** cards are read-only — title, "From Alok", when it arrived. Tapping
  opens a plain reading view. No edit or delete anywhere on them.
- Editing reuses `RecordModal`, deleting reuses `ConfirmModal`. Save is explicit rather
  than autosave: it matches every other screen, and `RecordModal` already keeps what was
  typed and shows the error rather than closing, so a failed save cannot lose a note.
- The share modal lists `/api/team-options` as tickable rows with avatar and role. There
  is no free-text field, so a note cannot be shared with someone who is not on the team.
- Bodies render as text with `white-space: pre-wrap`, never `dangerouslySetInnerHTML`.

**Files.** `pages/Notes.jsx`, `components/NoteCard.jsx`, `components/NoteShareModal.jsx`,
`lib/useNotes.js`. Splitting the card and the picker out keeps the page from growing into
the 300-line file `ContentCalendar.jsx` became.

**The bell** renders `<Link to={item.link}>` already, so the share notification links to
`/notes?open=<id>` and opens that note directly.

## Edge cases

- A removed teammate is deactivated, not deleted, so the share row survives. They cannot
  log in, and they disappear from the picker and from the note's "shared with" line —
  but re-activating them restores access rather than having silently lost it.
- A share is a live view, not a snapshot: editing the note changes what the recipient
  sees. Stated in the UI because people assume the opposite.
- Revoking is quiet. No "un-shared with you" notification.
- Re-saving an unchanged share list sends no second notification.

## Tests

`server/tests/notes.test.js`, on the existing Node runner against real Postgres, run
serially with the rest. Each written failing first.

1. B's `GET /api/notes` does not contain A's unshared note.
2. **An OWNER cannot read, edit, or delete another user's unshared note.** This is the
   one that proves the `requireRole` mounting decision above.
3. `PUT` and `DELETE` on someone else's note return 404, not 403.
4. Sharing puts the note in the recipient's `shared` list and creates exactly one
   notification.
5. Re-saving the same share list creates no second notification.
6. Revoking removes it from the recipient's list.
7. A recipient cannot edit or delete a note shared with them.
8. Unknown id, `CLIENT`, deactivated user, and yourself are each rejected 422.
9. Deleting a note leaves no `NoteShare` rows behind.
10. `/api/team-options` never returns a password hash, a `CLIENT`, an inactive user, or you.
11. A `CLIENT` login gets 403 on every notes route.

## Rollout

Branch from `main` — not from `feat/work-board-phase-1`, whose unapplied schema change
would 500 every content read if it reached production.

The hand-applied SQL lives at `server/prisma/migrations-manual/2026-09-03-notes.sql`,
generated with `prisma migrate diff`, `IF NOT EXISTS`-guarded so re-running is harmless,
and enabling row level security with no policies on both tables to match every other
table in the schema.

**Apply the SQL before pushing.** It is purely additive, so the running code is unaffected
by two tables it does not know about. Neither order breaks production, but this one has no
bad case at all.
