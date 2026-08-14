const express = require("express");
const PDFDocument = require("pdfkit");
const { z } = require("zod");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");
const { getAgencySettings } = require("../utils/agencySettings");

const router = express.Router();

const inr = (value) => `INR ${Number(value || 0).toLocaleString("en-IN")}`;
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

  const [client, campaigns, serviceCount, invoices] = await Promise.all([
    prisma.client.findUnique({ where: { id: body.clientId } }),
    prisma.campaignLog.findMany({ where: { clientId: body.clientId, month: body.month, year: body.year } }),
    prisma.serviceOrder.count({ where: { clientId: body.clientId, status: "ACTIVE" } }),
    prisma.invoice.findMany({ where: { clientId: body.clientId } })
  ]);
  if (!client) return res.status(422).json({ message: "Choose a client to report on." });

  const balanceDue = Math.max(Number(client.totalValue || 0) - Number(client.advancePaid || 0), 0);
  const adSpend = campaigns.reduce((sum, item) => sum + Number(item.adSpend || 0), 0);
  const campaignLeads = campaigns.reduce((sum, item) => sum + Number(item.leadsGenerated || 0), 0);
  const outstanding = invoices
    .filter((invoice) => !["PAID", "CANCELLED"].includes(invoice.status))
    .reduce((sum, invoice) => sum + Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0), 0);

  const summary = [
    `${monthName(body.month, body.year)} report for ${client.businessName}.`,
    `${serviceCount} active service${serviceCount === 1 ? "" : "s"} delivered across ${campaigns.length} campaign record${campaigns.length === 1 ? "" : "s"}.`,
    campaigns.length ? `Ad spend ${inr(adSpend)} produced ${campaignLeads} lead${campaignLeads === 1 ? "" : "s"}${campaignLeads ? ` at ${inr(Math.round(adSpend / campaignLeads))} per lead` : ""}.` : "No campaign data was logged for this month.",
    `Deal value ${inr(client.totalValue)}, advance received ${inr(client.advancePaid)}, balance due ${inr(balanceDue)}.`,
    outstanding ? `Invoices outstanding: ${inr(outstanding)}.` : "All invoices are settled.",
    body.nextMonthPlan || "Next month: continue optimisation and report weekly progress."
  ].join(" ");

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
  const agency = await getAgencySettings();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="report-${report.month}-${report.year}.pdf"`);
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  doc.on("error", () => res.end());
  doc.pipe(res);
  doc.fontSize(20).text(agency.agencyName || "OptiBrandz");
  doc.fontSize(10).fillColor("#555").text([agency.email, agency.website].filter(Boolean).join("  |  "));
  doc.moveDown(1).fillColor("#000").fontSize(17).text(`${monthName(report.month, report.year)} performance report`);
  doc.moveDown(0.3).fontSize(12).text(report.client?.businessName || "Client");
  doc.moveDown(1).fontSize(11).fillColor("#222").text(report.summary || "", { align: "left", lineGap: 3 });
  doc.end();
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const current = await prisma.report.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Report not found" });
  await prisma.report.delete({ where: { id: req.params.id } });
  res.json({ data: current });
}));

module.exports = router;
