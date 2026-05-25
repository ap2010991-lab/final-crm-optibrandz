const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const prisma = require("../db/prisma");
const requireRole = require("../middleware/requireRole");
const asyncRoute = require("../utils/asyncRoute");
const { allPermissions, roles } = require("../utils/constants");

const router = express.Router();
router.use(requireRole(["OWNER"]));

const publicUser = (user) => ({ ...user, password: undefined });
const initials = (name) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const validPermissions = z.array(z.enum([...allPermissions, "portal"])).default(["dashboard"]);

router.get("/", asyncRoute(async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { tasks: true } });
  const now = new Date();
  const data = users.map((user) => {
    const mine = user.tasks || [];
    return {
      ...publicUser(user),
      totalTasks: mine.length,
      doneTasks: mine.filter((task) => task.status === "DONE").length,
      overdueTasks: mine.filter((task) => new Date(task.dueDate) < now && task.status !== "DONE").length
    };
  });
  res.json({ data, permissions: allPermissions, roles });
}));

router.post("/", asyncRoute(async (req, res) => {
  const body = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(roles).default("ACCOUNT_MANAGER"),
    phone: z.string().optional(),
    permissions: validPermissions
  }).parse(req.body);
  const exists = await prisma.user.findFirst({ where: { email: { equals: body.email, mode: "insensitive" } } });
  if (exists) return res.status(409).json({ message: "Email already exists" });
  const user = await prisma.user.create({
    data: { ...body, password: await bcrypt.hash(body.password, 12), avatar: initials(body.name), isActive: true }
  });
  res.status(201).json({ data: publicUser(user) });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const current = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Team member not found" });
  const body = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional().or(z.literal("")),
    role: z.enum(roles).optional(),
    phone: z.string().optional(),
    permissions: validPermissions.optional(),
    isActive: z.boolean().optional()
  }).parse(req.body);
  if (body.email) {
    const exists = await prisma.user.findFirst({ where: { email: { equals: body.email, mode: "insensitive" }, NOT: { id: current.id } } });
    if (exists) return res.status(409).json({ message: "Email already exists" });
  }
  const { password, ...rest } = body;
  const user = await prisma.user.update({
    where: { id: current.id },
    data: { ...rest, ...(password ? { password: await bcrypt.hash(password, 12) } : {}), ...(body.name ? { avatar: initials(body.name) } : {}) }
  });
  res.json({ data: publicUser(user) });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ message: "Team member not found" });
  if (user.role === "OWNER") return res.status(400).json({ message: "Owner login cannot be removed" });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  res.json({ data: publicUser(updated) });
}));

module.exports = router;
