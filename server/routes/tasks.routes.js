const express = require("express");
const { z } = require("zod");
const { tasks, serviceOrders, users } = require("../data");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");

const router = express.Router();
router.use(verifyToken);

router.post("/", (req, res) => {
  const body = z.object({ title: z.string(), serviceOrderId: z.string().optional(), assignedToId: z.string(), dueDate: z.string(), priority: z.string().default("MEDIUM") }).parse(req.body);
  const task = { id: `t-${Date.now()}`, ...body, status: "PENDING" };
  tasks.unshift(task);
  res.status(201).json({ data: task });
});

router.get("/my", (req, res) => {
  const data = tasks.filter((task) => task.assignedToId === req.user.id && (!req.query.status || task.status === req.query.status));
  res.json({ data });
});

router.get("/workload", requireRole(["OWNER"]), (_req, res) => {
  const data = users.filter((user) => user.role !== "CLIENT").map((user) => {
    const mine = tasks.filter((task) => task.assignedToId === user.id);
    return { userId: user.id, name: user.name, role: user.role, totalTasks: mine.length, doneTasks: mine.filter((task) => task.status === "DONE").length, overdueTasks: mine.filter((task) => new Date(task.dueDate) < new Date() && task.status !== "DONE").length };
  });
  res.json({ data });
});

router.get("/", (req, res) => {
  const data = tasks.filter((task) => {
    if (!req.query.clientId) return true;
    const order = serviceOrders.find((item) => item.id === task.serviceOrderId);
    return order?.clientId === req.query.clientId;
  });
  res.json({ data });
});

router.put("/:id", (req, res) => {
  const task = tasks.find((item) => item.id === req.params.id);
  if (!task) return res.status(404).json({ message: "Task not found" });
  Object.assign(task, req.body);
  if (req.body.status === "DONE") task.completedAt = new Date().toISOString();
  res.json({ data: task });
});

module.exports = router;
