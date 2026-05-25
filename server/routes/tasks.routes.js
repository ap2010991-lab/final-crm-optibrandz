const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const requireRole = require("../middleware/requireRole");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

const taskSchema = z.object({
  title: z.string(),
  serviceOrderId: z.string().optional().nullable(),
  assignedToId: z.string(),
  dueDate: z.string(),
  priority: z.string().default("MEDIUM"),
  status: z.string().default("PENDING")
});

const taskPutSchema = z.object({
  title: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  dueDate: z.string().optional(),
  assignedToId: z.string().optional()
});

router.post("/", asyncRoute(async (req, res) => {
  const body = taskSchema.parse(req.body);
  const task = await prisma.task.create({ data: { ...body, dueDate: new Date(body.dueDate) } });
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
  const task = await prisma.task.update({
    where: { id: req.params.id },
    data: {
      ...body,
      ...(body.dueDate ? { dueDate: new Date(body.dueDate) } : {}),
      ...(body.status === "DONE" ? { completedAt: new Date() } : {})
    }
  });
  res.json({ data: task });
}));

module.exports = router;
