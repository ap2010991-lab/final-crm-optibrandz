const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");
const { syncClientServices, setClientMrr } = require("../utils/syncClientServices");

const router = express.Router();

const clientSchema = z.object({
  businessName: z.string(),
  contactPerson: z.string(),
  phone: z.string(),
  email: z.string().optional().or(z.literal("")),
  city: z.string().optional(),
  industry: z.string().optional(),
  websiteUrl: z.string().optional(),
  status: z.string().default("ACTIVE"),
  healthScore: z.number().default(100),
  totalValue: z.number().default(0),
  mrr: z.number().min(0).optional(),
  renewalDate: z.string().optional().nullable(),
  services: z.array(z.string()).default([])
});

function clientWhere(user) {
  return user.role === "CLIENT" ? { id: user.clientId } : {};
}

function toClientResponse(client) {
  const activeOrders = client.services?.filter((order) => order.status === "ACTIVE") || [];
  return {
    ...client,
    services: activeOrders.map((order) => order.serviceType),
    serviceCount: activeOrders.length,
    mrr: activeOrders.reduce((sum, item) => sum + Number(item.monthlyValue || 0), 0)
  };
}

function mrrFor(client) {
  return (client.services || []).filter((order) => order.status === "ACTIVE").reduce((sum, order) => sum + Number(order.monthlyValue || 0), 0);
}

function requireMrrService(mrr, services) {
  if (mrr > 0 && Array.isArray(services) && services.length === 0) {
    const error = new Error("Choose at least one service before entering a monthly retainer.");
    error.status = 422;
    throw error;
  }
}

router.get("/", asyncRoute(async (req, res) => {
  const { status, city, q = "" } = req.query;
  const data = await prisma.client.findMany({
    where: {
      ...clientWhere(req.user),
      ...(status ? { status } : {}),
      ...(city ? { city } : {}),
      ...(q ? { businessName: { contains: String(q), mode: "insensitive" } } : {})
    },
    include: { services: true },
    orderBy: { createdAt: "desc" }
  });
  const rows = data.map(toClientResponse);
  res.json({ data: rows, total: rows.length });
}));

router.post("/", asyncRoute(async (req, res) => {
  const body = clientSchema.parse(req.body);
  const { services, mrr, renewalDate, ...clientBody } = body;
  requireMrrService(mrr, services);
  const client = await prisma.client.create({
    data: { ...clientBody, renewalDate: renewalDate ? new Date(renewalDate) : null }
  });
  await syncClientServices(client.id, services, mrr);
  res.status(201).json({ data: client });
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, ...clientWhere(req.user) },
    include: {
      services: true,
      invoices: { orderBy: { createdAt: "desc" }, take: 3 },
      campaigns: { orderBy: { createdAt: "desc" }, take: 3 },
      calendarItems: { orderBy: { scheduledDate: "asc" } },
      activities: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!client) return res.status(404).json({ message: "Client not found" });
  res.json({ data: { ...client, mrr: mrrFor(client) } });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const body = clientSchema.partial().parse(req.body);
  const { services, mrr, renewalDate, ...rest } = body;
  requireMrrService(mrr, services);
  if (mrr > 0 && services === undefined) {
    const activeServiceCount = await prisma.serviceOrder.count({ where: { clientId: req.params.id, status: "ACTIVE" } });
    requireMrrService(mrr, activeServiceCount ? undefined : []);
  }
  const client = await prisma.client.update({
    where: { id: req.params.id },
    data: { ...rest, ...(renewalDate !== undefined ? { renewalDate: renewalDate ? new Date(renewalDate) : null } : {}) }
  });
  if (Array.isArray(services)) await syncClientServices(client.id, services, mrr);
  else if (mrr !== undefined) await setClientMrr(client.id, mrr);
  res.json({ data: client });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const client = await prisma.client.delete({ where: { id: req.params.id } });
  res.json({ data: client });
}));

module.exports = router;
