const express = require("express");
const { z } = require("zod");
const { leads, activities, clients } = require("../data");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");

const router = express.Router();
router.use(verifyToken);

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
  assignedToId: z.string().optional(),
  followUpDate: z.string().optional()
});

const scoreLead = (lead) => (lead.budget ? 20 : 0) + (lead.serviceInterest?.length || 0) * 15 + (lead.email ? 10 : 0);

router.get("/", (req, res) => {
  const { status, source, assignedToId, q = "" } = req.query;
  const data = leads.filter((lead) =>
    (!status || lead.status === status) &&
    (!source || lead.source === source) &&
    (!assignedToId || lead.assignedToId === assignedToId) &&
    (`${lead.name} ${lead.businessName || ""} ${lead.phone}`.toLowerCase().includes(String(q).toLowerCase()))
  );
  res.json({ data, total: data.length });
});

router.post("/", (req, res) => {
  const body = leadSchema.parse(req.body);
  const lead = { id: `l-${Date.now()}`, ...body, score: scoreLead(body) };
  leads.unshift(lead);
  res.status(201).json({ data: lead });
});

router.get("/:id", (req, res) => {
  const lead = leads.find((item) => item.id === req.params.id);
  if (!lead) return res.status(404).json({ message: "Lead not found" });
  res.json({ data: { ...lead, activities: activities.filter((item) => item.leadId === lead.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) } });
});

router.put("/:id", (req, res) => {
  const lead = leads.find((item) => item.id === req.params.id);
  if (!lead) return res.status(404).json({ message: "Lead not found" });
  Object.assign(lead, req.body, { score: scoreLead({ ...lead, ...req.body }) });
  res.json({ data: lead });
});

router.post("/:id/activity", (req, res) => {
  const body = z.object({ type: z.string(), note: z.string().min(1) }).parse(req.body);
  const activity = { id: `a-${Date.now()}`, ...body, leadId: req.params.id, userId: req.user.id, createdAt: new Date().toISOString() };
  activities.unshift(activity);
  res.status(201).json({ data: activity });
});

router.post("/:id/convert", requireRole(["OWNER", "ACCOUNT_MANAGER"]), (req, res) => {
  const lead = leads.find((item) => item.id === req.params.id);
  if (!lead) return res.status(404).json({ message: "Lead not found" });
  const client = {
    id: `c-${Date.now()}`,
    businessName: lead.businessName || lead.name,
    contactPerson: lead.name,
    phone: lead.phone,
    email: lead.email,
    city: lead.city,
    status: "ONBOARDING",
    healthScore: 100,
    totalValue: 0,
    services: lead.serviceInterest,
    leadId: lead.id
  };
  clients.unshift(client);
  Object.assign(lead, { status: "CONVERTED", convertedAt: new Date().toISOString() });
  res.status(201).json({ data: client });
});

module.exports = router;
