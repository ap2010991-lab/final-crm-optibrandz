const express = require("express");
const { z } = require("zod");
const { clients, serviceOrders, tasks, invoices, campaigns, calendarItems, activities } = require("../data");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();
router.use(verifyToken);

function visibleClients(user) {
  return user.role === "CLIENT" ? clients.filter((client) => client.id === user.clientId) : clients;
}

function syncClientServices(clientId, services = []) {
  const selected = [...new Set(services.map((item) => String(item).trim().toUpperCase().replace(/[\s-]+/g, "_")).filter(Boolean))];
  const currentOrders = serviceOrders.filter((order) => order.clientId === clientId);
  selected.forEach((serviceType) => {
    const existing = currentOrders.find((order) => order.serviceType === serviceType);
    if (existing) existing.status = "ACTIVE";
    else serviceOrders.unshift({
      id: `s-${Date.now()}-${serviceType}`,
      clientId,
      serviceType,
      packageName: "Custom",
      monthlyValue: 0,
      startDate: new Date().toISOString(),
      status: "ACTIVE",
      deliverables: {},
      createdAt: new Date().toISOString()
    });
  });
  currentOrders.forEach((order) => {
    if (!selected.includes(order.serviceType)) order.status = "PAUSED";
  });
}

function removeWhere(collection, predicate) {
  for (let index = collection.length - 1; index >= 0; index -= 1) {
    if (predicate(collection[index])) collection.splice(index, 1);
  }
}

router.get("/", (req, res) => {
  const { status, city, q = "" } = req.query;
  const data = visibleClients(req.user).filter((client) =>
    (!status || client.status === status) &&
    (!city || client.city === city) &&
    client.businessName.toLowerCase().includes(String(q).toLowerCase())
  ).map((client) => {
    const activeOrders = serviceOrders.filter((order) => order.clientId === client.id && order.status === "ACTIVE");
    return {
      ...client,
      services: activeOrders.map((order) => order.serviceType),
      serviceCount: activeOrders.length,
      mrr: activeOrders.reduce((sum, item) => sum + item.monthlyValue, 0)
    };
  });
  res.json({ data, total: data.length });
});

router.post("/", (req, res) => {
  const body = z.object({
    businessName: z.string(),
    contactPerson: z.string(),
    phone: z.string(),
    email: z.string().optional(),
    city: z.string().optional(),
    industry: z.string().optional(),
    websiteUrl: z.string().optional(),
    status: z.string().default("ACTIVE"),
    healthScore: z.number().default(100),
    totalValue: z.number().default(0),
    renewalDate: z.string().optional(),
    services: z.array(z.string()).default([])
  }).parse(req.body);
  const { services, ...clientBody } = body;
  const client = { id: `c-${Date.now()}`, ...clientBody, services: [], createdAt: new Date().toISOString() };
  clients.unshift(client);
  syncClientServices(client.id, services);
  res.status(201).json({ data: client });
});

router.get("/:id", (req, res) => {
  const client = visibleClients(req.user).find((item) => item.id === req.params.id);
  if (!client) return res.status(404).json({ message: "Client not found" });
  res.json({ data: {
    ...client,
    services: serviceOrders.filter((item) => item.clientId === client.id),
    invoices: invoices.filter((item) => item.clientId === client.id).slice(0, 3),
    campaigns: campaigns.filter((item) => item.clientId === client.id).slice(0, 3),
    calendarItems: calendarItems.filter((item) => item.clientId === client.id),
    activities: activities.filter((item) => item.clientId === client.id)
  } });
});

router.put("/:id", (req, res) => {
  const client = clients.find((item) => item.id === req.params.id);
  if (!client) return res.status(404).json({ message: "Client not found" });
  const { services, ...body } = req.body;
  Object.assign(client, body);
  if (Array.isArray(services)) syncClientServices(client.id, services);
  res.json({ data: client });
});

router.delete("/:id", (req, res) => {
  const index = clients.findIndex((item) => item.id === req.params.id);
  const client = clients[index];
  if (!client) return res.status(404).json({ message: "Client not found" });
  const serviceIds = serviceOrders.filter((item) => item.clientId === client.id).map((item) => item.id);
  clients.splice(index, 1);
  removeWhere(serviceOrders, (item) => item.clientId === client.id);
  removeWhere(tasks, (item) => serviceIds.includes(item.serviceOrderId));
  removeWhere(invoices, (item) => item.clientId === client.id);
  removeWhere(campaigns, (item) => item.clientId === client.id);
  removeWhere(calendarItems, (item) => item.clientId === client.id);
  removeWhere(activities, (item) => item.clientId === client.id);
  res.json({ data: client });
});

module.exports = router;
