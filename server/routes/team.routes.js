const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { users, tasks, allPermissions } = require("../data");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");

const router = express.Router();
router.use(verifyToken, requireRole(["OWNER"]));

const roles = ["OWNER", "ACCOUNT_MANAGER", "SEO_EXEC", "DESIGNER", "CLIENT"];
const publicUser = (user) => ({ ...user, password: undefined });
const initials = (name) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const validPermissions = z.array(z.enum([...allPermissions, "portal"])).default(["dashboard"]);

router.get("/", (_req, res) => {
  const data = users.map((user) => {
    const mine = tasks.filter((task) => task.assignedToId === user.id);
    return {
      ...publicUser(user),
      totalTasks: mine.length,
      doneTasks: mine.filter((task) => task.status === "DONE").length,
      overdueTasks: mine.filter((task) => new Date(task.dueDate) < new Date() && task.status !== "DONE").length
    };
  });
  res.json({ data, permissions: allPermissions, roles });
});

router.post("/", async (req, res) => {
  const body = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(roles).default("ACCOUNT_MANAGER"),
    phone: z.string().optional(),
    permissions: validPermissions
  }).parse(req.body);
  if (users.some((user) => user.email.toLowerCase() === body.email.toLowerCase())) return res.status(409).json({ message: "Email already exists" });
  const user = {
    id: `u-${Date.now()}`,
    ...body,
    password: await bcrypt.hash(body.password, 12),
    avatar: initials(body.name),
    isActive: true
  };
  users.push(user);
  res.status(201).json({ data: publicUser(user) });
});

router.put("/:id", async (req, res) => {
  const user = users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ message: "Team member not found" });
  const body = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional().or(z.literal("")),
    role: z.enum(roles).optional(),
    phone: z.string().optional(),
    permissions: validPermissions.optional(),
    isActive: z.boolean().optional()
  }).parse(req.body);
  if (body.email && users.some((item) => item.id !== user.id && item.email.toLowerCase() === body.email.toLowerCase())) return res.status(409).json({ message: "Email already exists" });
  const { password, ...rest } = body;
  Object.assign(user, rest);
  if (password) user.password = await bcrypt.hash(password, 12);
  if (body.name) user.avatar = initials(body.name);
  res.json({ data: publicUser(user) });
});

router.delete("/:id", (req, res) => {
  const user = users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ message: "Team member not found" });
  if (user.role === "OWNER") return res.status(400).json({ message: "Owner login cannot be removed" });
  user.isActive = false;
  res.json({ data: publicUser(user) });
});

module.exports = router;
