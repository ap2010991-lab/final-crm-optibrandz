const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");
const { streamReportPdf } = require("../utils/reportPdf");

const router = express.Router();

const inr = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const monthName = (month, year) => new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

function clientScope(user) {
  return user.role === "CLIENT" ? { clientId: user.clientId || "__none__" } : {};
}

router.post("/generate", asyncRoute(async (req, res) => {
  const body = z.object({
    clientId: z.string().min(1),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
    nextMonthPlan: z.string().max(2000).optional()
  }).parse(req.body);

  const monthStart = new Date(body.year, body.month - 1, 1);
  const monthEnd = new Date(body.year, body.month, 1);

  // The report used to be boilerplate that read the same whatever had happened. It is now
  // assembled from what was actually delivered in the month, so it is worth sending.
  const [client, campaigns, services, invoices, posted] = await Promise.all([
    prisma.client.findUnique({ where: { id: body.clientId } }),
    prisma.campaignLog.findMany({ where: { clientId: body.clientId, month: body.month, year: body.year } }),
    prisma.serviceOrder.findMany({
      where: { clientId: body.clientId, status: "ACTIVE" },
      select: { serviceType: true }
    }),
    prisma.invoice.findMany({ where: { clientId: body.clientId } }),
    prisma.contentCalendar.findMany({
      where: { clientId: body.clientId, status: "PUBLISHED", scheduledDate: { gte: monthStart, lt: monthEnd } },
      select: { platform: true, postType: true }
    })
  ]);
  if (!client) return res.status(422).json({ message: "Choose a client to report on." });

  const balanceDue = Math.max(Number(client.totalValue || 0) - Number(client.advancePaid || 0), 0);
  const adSpend = campaigns.reduce((sum, item) => sum + Number(item.adSpend || 0), 0);
  const campaignLeads = campaigns.reduce((sum, item) => sum + Number(item.leadsGenerated || 0), 0);
  const outstanding = invoices
    .filter((invoice) => !["PAID", "CANCELLED"].includes(invoice.status))
    .reduce((sum, invoice) => sum + Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0), 0);

  const countBy = (rows, key) => rows.reduce((acc, row) => ({ ...acc, [row[key]]: (acc[row[key]] || 0) + 1 }), {});
  const describe = (counts) => Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${count} ${String(name).toLowerCase().replaceAll("_", " ")}`)
    .join(", ");

  const target = Number(client.monthlyContentTarget) || 0;
  const deliveryLine = posted.length
    ? `Published ${posted.length} post${posted.length === 1 ? "" : "s"}${target ? ` of the ${target} committed` : ""}`
      + ` — ${describe(countBy(posted, "postType"))} across ${describe(countBy(posted, "platform"))}.`
    : target
      ? `No posts were published this month against a commitment of ${target}.`
      : "No posts were published this month.";

  const summary = [
    `${monthName(body.month, body.year)} report for ${client.businessName}.`,
    deliveryLine,
    services.length
      ? `Services running: ${services.map((service) => String(service.serviceType).toLowerCase().replaceAll("_", " ")).join(", ")}.`
      : "No active services this month.",
    campaigns.length
      ? `Ad spend ${inr(adSpend)} produced ${campaignLeads} lead${campaignLeads === 1 ? "" : "s"}${campaignLeads ? ` at ${inr(Math.round(adSpend / campaignLeads))} per lead` : ""}.`
      : null,
    `Deal value ${inr(client.totalValue)}, advance received ${inr(client.advancePaid)}, balance due ${inr(balanceDue)}.`,
    outstanding ? `Invoices outstanding: ${inr(outstanding)}.` : "All invoices are settled.",
    body.nextMonthPlan || "Next month: continue optimisation and report weekly progress."
  ].filter(Boolean).join(" ");

  // The old code stored a pdfUrl pointing at /api/reports/<timestamp>.pdf, a route that
  // never existed. The PDF is now generated on demand from the report id.
  const report = await prisma.report.create({
    data: { clientId: body.clientId, month: body.month, year: body.year, summary }
  });
  await prisma.report.update({ where: { id: report.id }, data: { pdfUrl: `/api/reports/${report.id}/pdf` } });

  res.status(201).json({ data: { ...report, pdfUrl: `/api/reports/${report.id}/pdf`, campaignCount: campaigns.length } });
}));

router.get("/", asyncRoute(async (req, res) => {
  const data = await prisma.report.findMany({
    where: {
      ...clientScope(req.user),
      ...(req.query.clientId ? { clientId: String(req.query.clientId) } : {})
    },
    include: { client: { select: { id: true, businessName: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }]
  });
  res.json({ data });
}));

router.get("/:id/pdf", asyncRoute(async (req, res) => {
  const report = await prisma.report.findFirst({
    where: { id: req.params.id, ...clientScope(req.user) },
    include: { client: true }
  });
  if (!report) return res.status(404).json({ message: "Report not found" });

  // Recomputed at render time so a downloaded report always matches the current records
  // rather than a snapshot of whatever the numbers were when it was generated.
  const monthStart = new Date(report.year, report.month - 1, 1);
  const monthEnd = new Date(report.year, report.month, 1);
  const [posted, campaigns, services] = await Promise.all([
    prisma.contentCalendar.findMany({
      where: { clientId: report.clientId, status: "PUBLISHED", scheduledDate: { gte: monthStart, lt: monthEnd } },
      select: { platform: true, postType: true }
    }),
    prisma.campaignLog.findMany({
      where: { clientId: report.clientId, month: report.month, year: report.year },
      select: { adSpend: true, leadsGenerated: true }
    }),
    prisma.serviceOrder.count({ where: { clientId: report.clientId, status: "ACTIVE" } })
  ]);

  const adSpend = campaigns.reduce((sum, row) => sum + Number(row.adSpend || 0), 0);
  const leads = campaigns.reduce((sum, row) => sum + Number(row.leadsGenerated || 0), 0);
  const target = Number(report.client?.monthlyContentTarget) || 0;

  const countBy = (rows, key) => rows.reduce((acc, row) => ({ ...acc, [row[key]]: (acc[row[key]] || 0) + 1 }), {});
  const toRows = (counts) => Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label: String(label).toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), value }));

  const stats = {
    tiles: [
      { label: target ? `Posts of ${target}` : "Posts published", value: posted.length },
      { label: "Active services", value: services },
      leads ? { label: "Leads generated", value: leads } : null,
      adSpend ? { label: "Ad spend", value: `₹${Math.round(adSpend).toLocaleString("en-IN")}` } : null
    ].filter(Boolean),
    breakdown: [...toRows(countBy(posted, "platform")), ...toRows(countBy(posted, "postType"))]
  };

  await streamReportPdf(report, stats, res);
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const current = await prisma.report.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Report not found" });
  await prisma.report.delete({ where: { id: req.params.id } });
  res.json({ data: current });
}));

module.exports = router;
