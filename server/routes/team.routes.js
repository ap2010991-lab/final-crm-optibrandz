const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const prisma = require("../db/prisma");
const requireRole = require("../middleware/requireRole");
const asyncRoute = require("../utils/asyncRoute");
const { allPermissions, roles, defaultStaffPermissions } = require("../utils/constants");
const { onlyProvided } = require("../utils/onlyProvided");

const router = express.Router();
router.use(requireRole(["OWNER"]));

const publicUser = (user) => ({ ...user, password: undefined, failedLoginCount: undefined, lockedUntil: undefined });
const initials = (name) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const validPermissions = z.array(z.enum([...allPermissions, "portal"])).default(defaultStaffPermissions);

router.get("/", asyncRoute(async (_req, res) => {
  const now = new Date();
  // Every task for every user used to be loaded to produce three counts per row. Three
  // grouped counts do the same work in the database and stay flat as the CRM fills up.
  const [users, totals, done, overdue] = await Promise.all([
    // Client portal logins are not colleagues. They were listed here as team cards, and
    // the edit form cannot even represent them: its role dropdown deliberately excludes
    // CLIENT, so opening one showed a role that was not theirs.
    prisma.user.findMany({ where: { role: { not: "CLIENT" } }, orderBy: { createdAt: "asc" } }),
    prisma.task.groupBy({ by: ["assignedToId"], _count: { _all: true } }),
    prisma.task.groupBy({ by: ["assignedToId"], where: { status: "DONE" }, _count: { _all: true } }),
    prisma.task.groupBy({
      by: ["assignedToId"],
      where: { status: { not: "DONE" }, dueDate: { lt: now } },
      _count: { _all: true }
    })
  ]);

  const countsBy = (rows) => new Map(rows.map((row) => [row.assignedToId, row._count._all]));
  const totalBy = countsBy(totals);
  const doneBy = countsBy(done);
  const overdueBy = countsBy(overdue);

  const data = users.map((user) => ({
    ...publicUser(user),
    totalTasks: totalBy.get(user.id) || 0,
    doneTasks: doneBy.get(user.id) || 0,
    overdueTasks: overdueBy.get(user.id) || 0
  }));
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

/**
 * Refuses a change that would leave the CRM with no active owner.
 *
 * Team and Settings are owner-only, so an owner who picked a different role from their
 * own edit form — one click — demoted themselves out of the only screen that could put
 * it back. Verified: the request succeeded with 200 and every subsequent call to /team
 * returned 403, with no route to recovery short of editing the database by hand.
 */
async function wouldStrandTheCrm(current, changes) {
  if (current.role !== "OWNER") return false;
  const losesOwner = (changes.role && changes.role !== "OWNER") || changes.isActive === false;
  if (!losesOwner) return false;
  const otherOwners = await prisma.user.count({
    where: { role: "OWNER", isActive: true, NOT: { id: current.id } }
  });
  return otherOwners === 0;
}

router.put("/:id", asyncRoute(async (req, res) => {
  const current = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Team member not found" });
  // onlyProvided, as everywhere else that takes a partial update: Zod fills in
  // `.default(["dashboard"])` for an absent permissions key, so changing a phone number
  // silently reset that colleague's access to dashboard-only. This route was the last one
  // still parsing straight into the update.
  const body = onlyProvided(req.body, z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional().or(z.literal("")),
    role: z.enum(roles).optional(),
    phone: z.string().optional(),
    permissions: validPermissions.optional(),
    isActive: z.boolean().optional()
  }).parse(req.body));

  if (await wouldStrandTheCrm(current, body)) {
    return res.status(422).json({
      message: "This is the only owner login. Make someone else an owner first, or the CRM would be left with no way into Team and Settings."
    });
  }

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
  if (await wouldStrandTheCrm(user, { isActive: false })) {
    return res.status(422).json({
      message: "This is the only owner login. Make someone else an owner first."
    });
  }
  if (user.role === "OWNER") return res.status(400).json({ message: "Owner login cannot be removed" });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  res.json({ data: publicUser(updated) });
}));

module.exports = router;
