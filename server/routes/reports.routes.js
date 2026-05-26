const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

router.post("/generate", asyncRoute(async (req, res) => {
  const body = z.object({ clientId: z.string(), month: z.number(), year: z.number(), nextMonthPlan: z.string().optional() }).parse(req.body);
  const [client, campaignCount, serviceCount] = await Promise.all([
    prisma.client.findUnique({ where: { id: body.clientId } }),
    prisma.campaignLog.count({ where: { clientId: body.clientId, month: body.month, year: body.year } }),
    prisma.serviceOrder.count({ where: { clientId: body.clientId, status: "ACTIVE" } })
  ]);
  const balanceDue = Math.max(Number(client?.totalValue || 0) - Number(client?.advancePaid || 0), 0);
  const summary = `This month we managed ${serviceCount} services for ${client?.businessName || "client"} with ${campaignCount} campaign records. Deal value: INR ${Number(client?.totalValue || 0).toLocaleString("en-IN")}; advance received: INR ${Number(client?.advancePaid || 0).toLocaleString("en-IN")}; balance due: INR ${balanceDue.toLocaleString("en-IN")}. ${body.nextMonthPlan || "Continue optimization and report weekly progress."}`;
  const report = await prisma.report.create({
    data: { clientId: body.clientId, month: body.month, year: body.year, summary, pdfUrl: `/api/reports/${Date.now()}.pdf` }
  });
  res.status(201).json({ data: { ...report, campaignCount } });
}));

router.get("/", asyncRoute(async (req, res) => {
  const data = await prisma.report.findMany({
    where: req.query.clientId ? { clientId: String(req.query.clientId) } : {},
    orderBy: { createdAt: "desc" }
  });
  res.json({ data });
}));

module.exports = router;
