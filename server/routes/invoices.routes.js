const express = require("express");
const PDFDocument = require("pdfkit");
const { z } = require("zod");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

const invoiceSchema = z.object({
  clientId: z.string(),
  lineItems: z.array(z.object({ description: z.string(), amount: z.number() })),
  dueDate: z.string(),
  gstAmount: z.number().default(0),
  paidAmount: z.number().default(0),
  status: z.string().optional(),
  clientPhone: z.string().optional(),
  notes: z.string().optional()
});

function invoiceTotals(body) {
  const amount = body.lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalAmount = amount + Number(body.gstAmount || 0);
  const status = body.status || (Number(body.paidAmount || 0) >= totalAmount ? "PAID" : Number(body.paidAmount || 0) > 0 ? "PARTIAL" : "PENDING");
  return { amount, totalAmount, status };
}

async function nextInvoiceNumber() {
  const count = await prisma.invoice.count();
  return `OB-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
}

router.get("/", asyncRoute(async (req, res) => {
  const data = await prisma.invoice.findMany({
    where: {
      ...(req.query.clientId ? { clientId: String(req.query.clientId) } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {})
    },
    include: { client: true },
    orderBy: { createdAt: "desc" }
  });
  res.json({ data });
}));

router.post("/", asyncRoute(async (req, res) => {
  const body = invoiceSchema.parse(req.body);
  const totals = invoiceTotals(body);
  const invoice = await prisma.invoice.create({
    data: {
      ...body,
      ...totals,
      dueDate: new Date(body.dueDate),
      paidAt: totals.status === "PAID" ? new Date() : null,
      invoiceNumber: await nextInvoiceNumber()
    }
  });
  res.status(201).json({ data: invoice });
}));

router.get("/revenue", asyncRoute(async (_req, res) => {
  const invoices = await prisma.invoice.findMany({ orderBy: { createdAt: "asc" } });
  const data = invoices.reduce((acc, invoice) => {
    const month = new Date(invoice.createdAt).toLocaleDateString("en-IN", { month: "short" });
    const row = acc.find((item) => item.month === month) || acc[acc.push({ month, invoiced: 0, collected: 0 }) - 1];
    row.invoiced += Number(invoice.totalAmount || 0);
    row.collected += Number(invoice.paidAmount || 0);
    return acc;
  }, []);
  res.json({ data });
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { client: true } });
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  res.json({ data: invoice });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const body = invoiceSchema.partial().parse(req.body);
  const current = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Invoice not found" });
  const merged = { ...current, ...body, lineItems: body.lineItems || current.lineItems };
  const totals = invoiceTotals(merged);
  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data: {
      ...body,
      ...totals,
      ...(body.dueDate ? { dueDate: new Date(body.dueDate) } : {}),
      ...(totals.status === "PAID" && !current.paidAt ? { paidAt: new Date() } : {})
    }
  });
  res.json({ data: invoice });
}));

router.put("/:id/pay", asyncRoute(async (req, res) => {
  const current = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Invoice not found" });
  const { paidAmount } = z.object({ paidAmount: z.number() }).parse(req.body);
  const status = paidAmount >= current.totalAmount ? "PAID" : paidAmount > 0 ? "PARTIAL" : "PENDING";
  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data: { paidAmount, status, ...(status === "PAID" ? { paidAt: new Date() } : {}) }
  });
  res.json({ data: invoice });
}));

router.get("/:id/pdf", asyncRoute(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { client: true } });
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=${invoice.invoiceNumber}.pdf`);
  const doc = new PDFDocument({ margin: 48 });
  doc.pipe(res);
  doc.fontSize(22).text("OptiBrandz", { continued: true }).fontSize(11).text("  Vapi, Gujarat");
  doc.moveDown().fontSize(18).text("Invoice");
  doc.fontSize(10).text(`Invoice: ${invoice.invoiceNumber}`).text(`Client: ${invoice.client?.businessName || "Client"}`).text(`Due: ${new Date(invoice.dueDate).toLocaleDateString()}`);
  doc.moveDown().fontSize(12).text("Line Items");
  invoice.lineItems.forEach((item) => doc.text(`${item.description} - INR ${Number(item.amount || 0).toLocaleString("en-IN")}`));
  doc.moveDown().fontSize(12).text(`GST: INR ${Number(invoice.gstAmount || 0).toLocaleString("en-IN")}`).fontSize(16).text(`Total: INR ${Number(invoice.totalAmount || 0).toLocaleString("en-IN")}`);
  doc.moveDown().fontSize(10).text("Bank details: OptiBrandz Marketing Agency | optibrandz.in | grow@optibrandz.in");
  doc.end();
}));

module.exports = router;
