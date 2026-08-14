const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const requireRole = require("../middleware/requireRole");
const asyncRoute = require("../utils/asyncRoute");
const { onlyProvided } = require("../utils/onlyProvided");
const { syncClientServices } = require("../utils/syncClientServices");

const router = express.Router();

const leadSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().email().optional().or(z.literal("")),
  businessName: z.string().optional(),
  city: z.string().optional(),
  source: z.string().default("WEBSITE"),
  status: z.string().default("NEW"),
  serviceInterest: z.array(z.string()).default([]),
  budget: z.string().optional(),
  notes: z.string().optional(),
  assignedToId: z.string().optional().nullable(),
  followUpDate: z.string().optional().nullable()
});

const scoreLead = (lead) => Math.min(100, (lead.budget ? 20 : 0) + (lead.serviceInterest?.length || 0) * 15 + (lead.email ? 10 : 0));

// An empty date string used to reach Prisma as "" and blow up with a 500. Blank now
// means "clear the date", and a nonsense date is rejected with a readable message.
function optionalDate(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`Enter a valid ${field}.`);
    error.status = 422;
    throw error;
  }
  return date;
}

const leadDates = (body) => ({ ...body, followUpDate: optionalDate(body.followUpDate, "follow-up date") });

router.get("/", asyncRoute(async (req, res) => {
  const { status, source, assignedToId, q = "" } = req.query;
  const data = await prisma.lead.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
      ...(assignedToId ? { assignedToId } : {}),
      ...(q ? { OR: [
        { name: { contains: String(q), mode: "insensitive" } },
        { businessName: { contains: String(q), mode: "insensitive" } },
        { phone: { contains: String(q), mode: "insensitive" } }
      ] } : {})
    },
    orderBy: { createdAt: "desc" }
  });
  res.json({ data, total: data.length });
}));

router.post("/", asyncRoute(async (req, res) => {
  const body = leadSchema.parse(req.body);
  const data = leadDates({
    ...body,
    followUpDate: body.followUpDate || new Date(Date.now() + 86400000).toISOString(),
    score: scoreLead(body)
  });
  const lead = await prisma.lead.create({ data });
  res.status(201).json({ data: lead });
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const lead = await prisma.lead.findUnique({
    where: { id: req.params.id },
    include: { activities: { orderBy: { createdAt: "desc" } } }
  });
  if (!lead) return res.status(404).json({ message: "Lead not found" });
  res.json({ data: lead });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const body = onlyProvided(req.body, leadSchema.partial().parse(req.body));
  const current = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Lead not found" });
  const data = leadDates({ ...body, score: scoreLead({ ...current, ...body }) });
  const lead = await prisma.lead.update({ where: { id: req.params.id }, data });
  res.json({ data: lead });
}));

router.delete("/:id", requireRole(["OWNER", "ACCOUNT_MANAGER"]), asyncRoute(async (req, res) => {
  const current = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Lead not found" });
  const lead = await prisma.lead.delete({ where: { id: req.params.id } });
  res.json({ data: lead });
}));

router.post("/:id/activity", asyncRoute(async (req, res) => {
  const body = z.object({ type: z.string(), note: z.string().min(1) }).parse(req.body);
  const activity = await prisma.activity.create({ data: { ...body, leadId: req.params.id, userId: req.user.id } });
  res.status(201).json({ data: activity });
}));

// Converting the same lead twice used to hit the unique constraint on Client.leadId and
// surface as a 500. A second conversion now just returns the client already created.
router.post("/:id/convert", requireRole(["OWNER", "ACCOUNT_MANAGER"]), asyncRoute(async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) return res.status(404).json({ message: "Lead not found" });

  const already = await prisma.client.findUnique({ where: { leadId: lead.id } });
  if (already) return res.status(200).json({ data: already, alreadyConverted: true });

  const client = await prisma.$transaction(async (db) => {
    const created = await db.client.create({
      data: {
        businessName: lead.businessName || lead.name,
        contactPerson: lead.name,
        phone: lead.phone,
        email: lead.email,
        city: lead.city,
        status: "ONBOARDING",
        healthScore: 100,
        totalValue: 0,
        leadId: lead.id
      }
    });
    await syncClientServices(created.id, lead.serviceInterest, undefined, db);
    await db.lead.update({ where: { id: lead.id }, data: { status: "CONVERTED", convertedAt: new Date() } });
    return created;
  }, { maxWait: 10000, timeout: 20000 });

  res.status(201).json({ data: client });
}));

module.exports = router;
