const express = require("express");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

router.get("/", asyncRoute(async (req, res) => {
  const q = String(req.query.q || "");
  const can = (permission) => req.user.role === "OWNER" || (req.user.permissions || []).includes(permission);
  const [clients, leads, invoices] = await Promise.all([
    can("clients") ? prisma.client.findMany({ where: { businessName: { contains: q, mode: "insensitive" } }, take: 5 }) : [],
    can("leads") ? prisma.lead.findMany({ where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q, mode: "insensitive" } }] }, take: 5 }) : [],
    can("invoices") ? prisma.invoice.findMany({ where: { invoiceNumber: { contains: q, mode: "insensitive" } }, take: 5 }) : []
  ]);
  res.json({ data: { clients, leads, invoices } });
}));

module.exports = router;
