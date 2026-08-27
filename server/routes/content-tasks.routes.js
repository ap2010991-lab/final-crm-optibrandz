const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");
const { onlyProvided } = require("../utils/onlyProvided");

const router = express.Router();

const TYPES = ["REEL", "POST", "STORY", "CAROUSEL", "VIDEO", "OTHER"];

const taskSchema = z.object({
  clientId: z.string().min(1),
  title: z.string().trim().min(1, "Give the task a title.").max(200),
  type: z.enum(TYPES).default("POST"),
  notes: z.string().max(2000).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  isDone: z.boolean().default(false)
});

// clientId is fixed at creation: moving a half-finished task to a different client is not
// something the team does, and allowing it here would silently re-file work.
const updateSchema = taskSchema.partial().omit({ clientId: true });

function parseDueDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("Enter a valid due date.");
    error.status = 422;
    throw error;
  }
  return date;
}

// Pending first, because that is the list you work from. Inside each group: anything with
// a due date leads, soonest first, and undated tasks follow in the order they were added.
// Postgres sorts NULLs last on ASC by default, which is exactly that.
const ORDER = [{ isDone: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }];

// The list is shared, so each row carries who added it and who finished it. Only the
// three fields the card actually renders — a task must never ship a whole user row.
const WITH_PEOPLE = {
  createdBy: { select: { id: true, name: true, avatar: true } },
  completedBy: { select: { id: true, name: true, avatar: true } }
};

router.get("/", asyncRoute(async (req, res) => {
  const { clientId, done } = req.query;
  if (!clientId) return res.status(422).json({ message: "Choose a client first." });

  const data = await prisma.contentTask.findMany({
    where: {
      clientId: String(clientId),
      ...(done === "true" ? { isDone: true } : done === "false" ? { isDone: false } : {})
    },
    orderBy: ORDER,
    include: WITH_PEOPLE
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

router.post("/", asyncRoute(async (req, res) => {
  const body = taskSchema.parse(req.body);
  const client = await prisma.client.findUnique({ where: { id: body.clientId } });
  if (!client) return res.status(422).json({ message: "Choose a client first." });

  const task = await prisma.contentTask.create({
    data: {
      ...body,
      notes: body.notes || null,
      dueDate: parseDueDate(body.dueDate),
      createdById: req.user.id,
      completedAt: body.isDone ? new Date() : null,
      completedById: body.isDone ? req.user.id : null
    },
    include: WITH_PEOPLE
  });
  res.status(201).json({ data: task });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const body = onlyProvided(req.body, updateSchema.parse(req.body));
  const current = await prisma.contentTask.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Task not found" });

  const task = await prisma.contentTask.update({
    where: { id: current.id },
    data: {
      ...body,
      ...("notes" in body ? { notes: body.notes || null } : {}),
      ...("dueDate" in body ? { dueDate: parseDueDate(body.dueDate) } : {}),
      // Un-ticking a task has to clear completedAt too, otherwise it still reads as
      // finished everywhere the date is what gets shown.
      // Re-opening a task clears both the date and the name, so a finished one always
      // says who finished it and an open one never claims someone did.
      ...("isDone" in body
        ? {
          completedAt: body.isDone ? current.completedAt || new Date() : null,
          completedById: body.isDone ? current.completedById || req.user.id : null
        }
        : {})
    },
    include: WITH_PEOPLE
  });
  res.json({ data: task });
}));

// Ticking a task is the one action that happens dozens of times a day, so it gets its own
// endpoint rather than making the phone send a whole record back over a weak connection.
router.put("/:id/toggle", asyncRoute(async (req, res) => {
  const current = await prisma.contentTask.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Task not found" });

  const isDone = !current.isDone;
  const task = await prisma.contentTask.update({
    where: { id: current.id },
    data: {
      isDone,
      completedAt: isDone ? new Date() : null,
      completedById: isDone ? req.user.id : null
    },
    include: WITH_PEOPLE
  });
  res.json({ data: task });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const current = await prisma.contentTask.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Task not found" });
  await prisma.contentTask.delete({ where: { id: current.id } });
  res.json({ data: current });
}));

// Clears the finished tasks for one client so a long-running list stays readable.
// Scoped to a single client on purpose: there is no "clear everything" here.
router.post("/clear-done", asyncRoute(async (req, res) => {
  const { clientId } = z.object({ clientId: z.string().min(1) }).parse(req.body);
  const { count } = await prisma.contentTask.deleteMany({ where: { clientId, isDone: true } });
  res.json({ data: { removed: count } });
}));

module.exports = router;
