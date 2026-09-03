const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");
const { onlyProvided } = require("../utils/onlyProvided");

const router = express.Router();

/**
 * Somebody's own notes.
 *
 * Every other section of this CRM decides what you may see from your role and permissions.
 * This one decides it from a single column: `ownerId`. Nothing here reads a note by id
 * alone — every route is scoped to the person asking, and a note belonging to somebody
 * else misses that scope and comes back 404, exactly as an id that never existed would.
 * That is deliberate: a 403 would confirm the note is real, and the whole promise of the
 * feature is that a note nobody shared with you does not exist as far as you can tell.
 *
 * See the mount in index.js for why this is not behind requirePermission.
 */

const noteSchema = z.object({
  title: z.string().trim().min(1, "Give the note a title.").max(200),
  // A note is written, not filled in, so an empty body is normal — you title it now and
  // write it later. The ceiling exists so one pasted document cannot make every other
  // note slow to load, since the list carries bodies.
  body: z.string().max(20000, "That note is too long to save. Split it in two.").default("")
});

const shareSchema = z.object({
  userIds: z.array(z.string().min(1)).max(50).default([])
});

// Only what a card renders. A note must never ship a whole user row.
const PERSON = { select: { id: true, name: true, avatar: true, role: true } };

// A month of notes for one person is a handful of rows; the ceiling is here so that a
// runaway account cannot return the whole table, not because anyone will reach it.
const LIMIT = 200;

/** The note, or 404 — never a note somebody else owns. */
async function ownedOr404(id, userId, res) {
  const note = await prisma.note.findFirst({ where: { id, ownerId: userId } });
  if (!note) {
    res.status(404).json({ message: "Note not found" });
    return null;
  }
  return note;
}

/**
 * A note may only go to somebody the owner actually added to the team.
 *
 * There is no free-text field anywhere in the UI, so a bad id here means a stale picker or
 * a hand-made request. Checking turns both into an honest 422 rather than a foreign-key
 * error surfacing on the phone as a 500. Clients are excluded because a client is not a
 * colleague, and yourself because a note you own is already yours to read.
 */
async function assertShareable(userIds, ownerId) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return [];

  if (unique.includes(ownerId)) {
    const error = new Error("This note is already yours — pick a colleague to share it with.");
    error.status = 422;
    throw error;
  }

  const allowed = await prisma.user.findMany({
    where: { id: { in: unique }, isActive: true, role: { not: "CLIENT" } },
    select: { id: true }
  });
  if (allowed.length !== unique.length) {
    const error = new Error("Choose a colleague from the list to share this with.");
    error.status = 422;
    throw error;
  }
  return unique;
}

// Newest first in both lists: a note you touched this morning is the one you want, and a
// note shared with you today matters more than one from last month.
const WITH_READERS = { shares: { include: { user: PERSON }, orderBy: { sharedAt: "asc" } } };

router.get("/", asyncRoute(async (req, res) => {
  const [mine, received] = await Promise.all([
    prisma.note.findMany({
      where: { ownerId: req.user.id },
      include: WITH_READERS,
      orderBy: { updatedAt: "desc" },
      take: LIMIT
    }),
    prisma.noteShare.findMany({
      where: { userId: req.user.id },
      include: { note: { include: { owner: PERSON } } },
      orderBy: { sharedAt: "desc" },
      take: LIMIT
    })
  ]);

  res.json({
    data: {
      mine,
      // Flattened to look like a note with an owner and a date, because that is what the
      // card renders — the join row itself is of no interest to the page.
      shared: received.map((share) => ({ ...share.note, sharedAt: share.sharedAt }))
    }
  });
}));

router.post("/", asyncRoute(async (req, res) => {
  const body = noteSchema.parse(req.body);
  const note = await prisma.note.create({
    // ownerId comes from the token and never from the request. A body claiming to be
    // somebody else's note is simply ignored rather than refused, because there is no
    // legitimate caller that would send one.
    data: { ...body, ownerId: req.user.id },
    include: WITH_READERS
  });
  res.status(201).json({ data: note });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const current = await ownedOr404(req.params.id, req.user.id, res);
  if (!current) return;

  const body = onlyProvided(req.body, noteSchema.partial().parse(req.body));
  const note = await prisma.note.update({
    where: { id: current.id },
    data: body,
    include: WITH_READERS
  });
  res.json({ data: note });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const current = await ownedOr404(req.params.id, req.user.id, res);
  if (!current) return;
  // The shares go with it through the cascade — a reader keeps nothing.
  await prisma.note.delete({ where: { id: current.id } });
  res.json({ data: current });
}));

/**
 * Sets who may read this note, in one call.
 *
 * The whole list rather than add-one/remove-one: the UI is a modal you tick names in and
 * press Save, so "these are the people who may read it" is what the person meant, and
 * last-write-wins is the honest reading of that. Only the additions ring a bell, so
 * pressing Save twice does not notify anyone twice.
 */
router.put("/:id/shares", asyncRoute(async (req, res) => {
  const note = await ownedOr404(req.params.id, req.user.id, res);
  if (!note) return;

  const { userIds } = shareSchema.parse(req.body);
  const wanted = await assertShareable(userIds, req.user.id);

  const existing = await prisma.noteShare.findMany({
    where: { noteId: note.id },
    select: { userId: true }
  });
  const before = new Set(existing.map((row) => row.userId));
  const added = wanted.filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !wanted.includes(id));

  await prisma.$transaction([
    ...(removed.length
      ? [prisma.noteShare.deleteMany({ where: { noteId: note.id, userId: { in: removed } } })]
      : []),
    ...(added.length
      ? [prisma.noteShare.createMany({
        data: added.map((userId) => ({ noteId: note.id, userId })),
        skipDuplicates: true
      })]
      : []),
    // Taking a note back is silent. Being told something was withdrawn is worse than not
    // noticing it went, and the owner did not ask to announce it.
    ...(added.length
      ? [prisma.notification.createMany({
        data: added.map((userId) => ({
          userId,
          type: "NOTE_SHARED",
          message: `${req.user.name} shared a note with you: ${note.title}`,
          link: `/notes?open=${note.id}`
        }))
      })]
      : [])
  ]);

  const updated = await prisma.note.findUnique({ where: { id: note.id }, include: WITH_READERS });
  res.json({ data: updated });
}));

module.exports = router;
