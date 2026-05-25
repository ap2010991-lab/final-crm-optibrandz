const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const requireRole = require("../middleware/requireRole");
const asyncRoute = require("../utils/asyncRoute");
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

const scoreLead = (lead) => (lead.budget ? 20 : 0) + (lead.serviceInterest?.length || 0) * 15 + (lead.email ? 10 : 0);
const leadDates = (body) => ({ ...body, followUpDate: body.followUpDate ? new Date(body.followUpDate) : body.followUpDate });

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
  const body = leadSchema.partial().parse(req.body);
  const current = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Lead not found" });
  const data = leadDates({ ...body, score: scoreLead({ ...current, ...body }) });
  const lead = await prisma.lead.update({ where: { id: req.params.id }, data });
  res.json({ data: lead });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const lead = await prisma.lead.delete({ where: { id: req.params.id } });
  res.json({ data: lead });
}));

router.post("/:id/activity", asyncRoute(async (req, res) => {
  const body = z.object({ type: z.string(), note: z.string().min(1) }).parse(req.body);
  const activity = await prisma.activity.create({ data: { ...body, leadId: req.params.id, userId: req.user.id } });
  res.status(201).json({ data: activity });
}));

router.post("/:id/convert", requireRole(["OWNER", "ACCOUNT_MANAGER"]), asyncRoute(async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) return res.status(404).json({ message: "Lead not found" });
  const client = await prisma.client.create({
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
  await syncClientServices(client.id, lead.serviceInterest);
  await prisma.lead.update({ where: { id: lead.id }, data: { status: "CONVERTED", convertedAt: new Date() } });
  res.status(201).json({ data: client });
}));

module.exports = router;
