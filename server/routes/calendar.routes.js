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

router.post("/bulk", asyncRoute(async (req, res) => {
  const body = z.object({ clientId: z.string(), month: z.number(), year: z.number(), count: z.number().default(26), platform: z.string().default("INSTAGRAM") }).parse(req.body);
  const created = Array.from({ length: body.count }, (_, index) => ({
    clientId: body.clientId,
    month: body.month,
    year: body.year,
    platform: body.platform,
    postType: index % 4 === 0 ? "REEL" : "STATIC",
    caption: "",
    designBrief: "",
    scheduledDate: new Date(body.year, body.month - 1, 1 + Math.floor(index * 30 / body.count)),
    status: "DRAFT"
  }));
  await prisma.contentCalendar.createMany({ data: created });
  res.status(201).json({ data: created });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const body = calendarSchema.partial().parse(req.body);
  const item = await prisma.contentCalendar.update({
    where: { id: req.params.id },
    data: { ...body, ...(body.scheduledDate ? { scheduledDate: new Date(body.scheduledDate) } : {}) }
  });
  res.json({ data: item });
}));

router.put("/:id/approve", requireRole(["CLIENT"]), asyncRoute(async (req, res) => {
  const item = await prisma.contentCalendar.update({ where: { id: req.params.id }, data: { status: "APPROVED", approvedAt: new Date() } });
  res.json({ data: item });
}));

module.exports = router;
