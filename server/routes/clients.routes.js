const express = require("express");
const { z } = require("zod");
const { clients, serviceOrders, invoices, campaigns, calendarItems, activities } = require("../data");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();
router.use(verifyToken);

function visibleClients(user) {
  return user.role === "CLIENT" ? clients.filter((client) => client.id === user.clientId) : clients;
}

router.get("/", (req, res) => {
  const { status, city, q = "" } = req.query;
  const data = visibleClients(req.user).filter((client) =>
    (!status || client.status === status) &&
    (!city || client.city === city) &&
    client.businessName.toLowerCase().includes(String(q).toLowerCase())
  ).map((client) => ({
    ...client,
    serviceCount: serviceOrders.filter((order) => order.clientId === client.id && order.status === "ACTIVE").length,
    mrr: serviceOrders.filter((order) => order.clientId === client.id && order.status === "ACTIVE").reduce((sum, item) => sum + item.monthlyValue, 0)
  }));
  res.json({ data, total: data.length });
});

router.post("/", (req, res) => {
  const body = z.object({ businessName: z.string(), contactPerson: z.string(), phone: z.string(), email: z.string().optional(), city: z.string().optional(), industry: z.string().optional() }).parse(req.body);
  const client = { id: `c-${Date.now()}`, ...body, status: "ACTIVE", healthScore: 100, totalValue: 0, services: [] };
  clients.unshift(client);
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
  Object.assign(client, req.body);
  res.json({ data: client });
});

router.delete("/:id", (req, res) => {
  const client = clients.find((item) => item.id === req.params.id);
  if (!client) return res.status(404).json({ message: "Client not found" });
  client.status = "CHURNED";
  res.json({ data: client });
});

module.exports = router;
