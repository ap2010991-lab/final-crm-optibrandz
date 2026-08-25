const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const requireRole = require("../middleware/requireRole");
const asyncRoute = require("../utils/asyncRoute");
const { TaskStatus, Priority } = require("../utils/enums");

const router = express.Router();

const taskSchema = z.object({
  title: z.string(),
  serviceOrderId: z.string().optional().nullable(),
  assignedToId: z.string(),
  dueDate: z.string(),
  priority: Priority.default("MEDIUM"),
  status: TaskStatus.default("PENDING")
});

const taskPutSchema = z.object({
  title: z.string().optional(),
  status: TaskStatus.optional(),
  priority: Priority.optional(),
  dueDate: z.string().optional(),
  assignedToId: z.string().optional()
});

function parseDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`Enter a valid ${field}.`);
    error.status = 422;
    throw error;
  }
  return date;
}

router.post("/", asyncRoute(async (req, res) => {
  const body = taskSchema.parse(req.body);
  const assignee = await prisma.user.findFirst({ where: { id: body.assignedToId, isActive: true } });
  if (!assignee) return res.status(422).json({ message: "Choose an active team member for this task." });
  const task = await prisma.task.create({
    data: { ...body, serviceOrderId: body.serviceOrderId || null, dueDate: parseDate(body.dueDate, "due date") }
  });
  res.status(201).json({ data: task });
}));

router.get("/my", asyncRoute(async (req, res) => {
  const data = await prisma.task.findMany({
    where: { assignedToId: req.user.id, ...(req.query.status ? { status: String(req.query.status) } : {}) },
    orderBy: { dueDate: "asc" }
  });
  res.json({ data });
}));

router.get("/workload", requireRole(["OWNER"]), asyncRoute(async (_req, res) => {
  const users = await prisma.user.findMany({ where: { role: { not: "CLIENT" } }, orderBy: { createdAt: "asc" }, include: { tasks: true } });
  const now = new Date();
  const data = users.map((user) => ({
    userId: user.id,
    name: user.name,
    role: user.role,
    totalTasks: user.tasks.length,
    doneTasks: user.tasks.filter((task) => task.status === "DONE").length,
    overdueTasks: user.tasks.filter((task) => new Date(task.dueDate) < now && task.status !== "DONE").length
  }));
  res.json({ data });
}));

router.get("/", asyncRoute(async (req, res) => {
  const data = await prisma.task.findMany({
    where: req.query.clientId ? { serviceOrder: { clientId: String(req.query.clientId) } } : {},
    orderBy: { dueDate: "asc" }
  });
  res.json({ data });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const body = taskPutSchema.parse(req.body);
  const current = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Task not found" });
  const task = await prisma.task.update({
    where: { id: req.params.id },
    data: {
      ...body,
      ...(body.dueDate ? { dueDate: parseDate(body.dueDate, "due date") } : {}),
      // Re-opening a completed task has to clear completedAt, otherwise it stays
      // counted as finished in the workload figures.
      ...(body.status ? { completedAt: body.status === "DONE" ? current.completedAt || new Date() : null } : {})
    }
  });
  res.json({ data: task });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const current = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Task not found" });
  await prisma.task.delete({ where: { id: req.params.id } });
  res.json({ data: current });
}));

module.exports = router;
