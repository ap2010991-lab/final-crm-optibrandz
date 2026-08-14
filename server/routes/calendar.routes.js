const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const requireRole = require("../middleware/requireRole");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

const calendarSchema = z.object({
  clientId: z.string(),
  month: z.number(),
  year: z.number(),
  platform: z.string().default("INSTAGRAM"),
  postType: z.string().default("STATIC"),
  caption: z.string().optional(),
  designBrief: z.string().optional(),
  scheduledDate: z.string().optional(),
  status: z.string().default("DRAFT"),
  mediaUrl: z.string().optional()
});

router.get("/", asyncRoute(async (req, res) => {
  const data = await prisma.contentCalendar.findMany({
    where: {
      ...(req.query.clientId ? { clientId: String(req.query.clientId) } : {}),
      ...(req.query.month ? { month: Number(req.query.month) } : {}),
      ...(req.query.year ? { year: Number(req.query.year) } : {})
    },
    orderBy: { scheduledDate: "asc" }
  });
  res.json({ data });
}));

router.post("/", asyncRoute(async (req, res) => {
  const body = calendarSchema.parse(req.body);
  const item = await prisma.contentCalendar.create({
    data: { ...body, scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : null }
  });
  res.status(201).json({ data: item });
}));

// "Generate Month" used to blindly add another full batch every time it was pressed,
// so a double tap left 52 posts in one month. It now tops up to the requested count.
router.post("/bulk", asyncRoute(async (req, res) => {
  const body = z.object({
    clientId: z.string().min(1),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
    count: z.number().int().min(1).max(60).default(26),
    platform: z.string().default("INSTAGRAM")
  }).parse(req.body);

  const client = await prisma.client.findUnique({ where: { id: body.clientId } });
  if (!client) return res.status(422).json({ message: "Choose a client first." });

  const existing = await prisma.contentCalendar.count({
    where: { clientId: body.clientId, month: body.month, year: body.year }
  });
  const missing = Math.max(body.count - existing, 0);
  if (!missing) {
    return res.status(200).json({ data: [], created: 0, existing, message: `This month already has ${existing} posts planned.` });
  }

  const daysInMonth = new Date(body.year, body.month, 0).getDate();
  const created = Array.from({ length: missing }, (_, index) => {
    const slot = existing + index;
    return {
      clientId: body.clientId,
      month: body.month,
      year: body.year,
      platform: body.platform,
      postType: slot % 4 === 0 ? "REEL" : "STATIC",
      caption: "",
      designBrief: "",
      scheduledDate: new Date(body.year, body.month - 1, Math.min(daysInMonth, 1 + Math.floor(slot * daysInMonth / body.count))),
      status: "DRAFT"
    };
  });
  await prisma.contentCalendar.createMany({ data: created });
  res.status(201).json({ data: created, created: created.length, existing });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const body = calendarSchema.partial().parse(req.body);
  const item = await prisma.contentCalendar.update({
    where: { id: req.params.id },
    data: { ...body, ...(body.scheduledDate ? { scheduledDate: new Date(body.scheduledDate) } : {}) }
  });
  res.json({ data: item });
}));

// Approval was locked to CLIENT logins only, which meant the agency could never
// approve its own drafts and the button had no working path in the UI.
router.put("/:id/approve", requireRole(["CLIENT", "OWNER", "ACCOUNT_MANAGER"]), asyncRoute(async (req, res) => {
  const current = await prisma.contentCalendar.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Content item not found" });
  const item = await prisma.contentCalendar.update({
    where: { id: req.params.id },
    data: { status: "APPROVED", approvedAt: new Date() }
  });
  res.json({ data: item });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const current = await prisma.contentCalendar.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Content item not found" });
  await prisma.contentCalendar.delete({ where: { id: req.params.id } });
  res.json({ data: current });
}));

module.exports = router;
